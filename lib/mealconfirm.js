// ยืนยันมื้ออาหารที่ประเมินจากรูปก่อนบันทึกจริง (ปุ่ม Quick Reply ของ LINE)
// ค่าที่ AI ประเมินถูกเก็บไว้ใน postback data ของปุ่มเลย ไม่ต้องเพิ่มตารางใน Supabase
// postback data (JSON, ไม่เกิน 300 ตัวอักษร): {a, n, k, p, t}
//   a = 'ms' บันทึก | 'me' แก้ไข (เลือกปริมาณ) | 'mx' ไม่บันทึก
//   n = ชื่ออาหาร, k = kcal, p = โปรตีน (กรัม), t = เวลาที่ประเมิน (ms) ใช้กันกดซ้ำ/ปุ่มค้างข้ามวัน
const { getSupabase } = require('./supabase');
const { todayStr } = require('./calc');
const { logMealAndReply } = require('./meals');

const fmt = (n) => Number(n).toLocaleString('en-US');
const TIMEZONE = 'Asia/Bangkok';

function dateOf(ms) {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
}

function cleanMeal(m) {
  const kcal = Math.round(Number(m.k));
  const protein = Math.round(Number(m.p));
  const t = Number(m.t);
  if (!Number.isFinite(kcal) || kcal < 20 || kcal > 3000) return null;
  if (!Number.isFinite(protein) || protein < 0 || protein > 200) return null;
  if (!Number.isFinite(t)) return null;
  const name = String(m.n || 'อาหาร').replace(/\s+/g, ' ').trim().slice(0, 60) || 'อาหาร';
  return { name, kcal, protein, t };
}

function data(a, meal) {
  return JSON.stringify({ a, n: meal.name, k: meal.kcal, p: meal.protein, t: meal.t });
}

function postbackItem(label, a, meal, displayText) {
  return { type: 'action', action: { type: 'postback', label: label.slice(0, 20), data: data(a, meal), displayText } };
}

function scaled(meal, factor) {
  return { ...meal, kcal: Math.max(20, Math.round(meal.kcal * factor)), protein: Math.round(meal.protein * factor) };
}

// ข้อความแรกหลังอ่านรูปอาหาร: แสดงค่าที่ประเมิน พร้อมปุ่ม บันทึก / แก้ไข / ไม่บันทึก
function buildPhotoMealConfirm(food) {
  const meal = cleanMeal({ n: food.name, k: food.kcal, p: food.protein, t: Date.now() });
  return {
    type: 'text',
    text: `🍽 ประเมินจากรูป: ${meal.name}\n≈ ${fmt(meal.kcal)} kcal, โปรตีน ≈ ${fmt(meal.protein)} กรัม\n` +
      '(ค่าประมาณ คลาดเคลื่อนได้ราว 20-30%)\n\nบันทึกเลยไหม? ถ้าปริมาณไม่ตรง กด "แก้ไข"',
    quickReply: {
      items: [
        postbackItem('✅ บันทึก', 'ms', meal, 'บันทึก'),
        postbackItem('✏️ แก้ไข', 'me', meal, 'แก้ไข'),
        postbackItem('❌ ไม่บันทึก', 'mx', meal, 'ไม่บันทึก')
      ]
    }
  };
}

// หน้าแก้ไข: เลือกปริมาณเทียบกับที่ประเมิน หรือพิมพ์เอง
function buildEditMessage(meal) {
  const options = [
    ['ครึ่งเดียว', 0.5],
    ['น้อยกว่านี้', 0.75],
    ['มากกว่านี้', 1.25],
    ['ใหญ่กว่ามาก', 1.5]
  ];
  return {
    type: 'text',
    text: `✏️ แก้ไข: ${meal.name} (ประเมินไว้ ${fmt(meal.kcal)} kcal)\n\n` +
      'เลือกปริมาณที่กินจริงด้านล่าง\nหรือพิมพ์ตัวเลขเอง เช่น "กิน 450 โปรตีน 30"',
    quickReply: {
      items: [
        ...options.map(([label, f]) => {
          const m = scaled(meal, f);
          return postbackItem(`${label} ~${m.kcal}`, 'ms', m, `${label} (~${m.kcal} kcal)`);
        }),
        postbackItem('❌ ไม่บันทึก', 'mx', meal, 'ไม่บันทึก')
      ]
    }
  };
}

// กดซ้ำ: มีมื้อชื่อ/ค่าเดียวกันที่บันทึกหลังเวลาประเมินแล้ว = บันทึกไปแล้ว
async function alreadySaved(userId, meal) {
  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from('meals').select('id')
    .eq('user_id', userId).eq('log_date', todayStr())
    .eq('name', meal.name).eq('kcal', meal.kcal).eq('protein', meal.protein)
    .gte('created_at', new Date(meal.t).toISOString())
    .limit(1);
  if (error) throw error;
  return (rows || []).length > 0;
}

// คืนข้อความตอบกลับ (array ของ LINE messages) หรือ null ถ้าไม่ใช่ postback ของมื้ออาหาร
async function handleMealPostback(userId, rawData) {
  let obj;
  try {
    obj = JSON.parse(rawData);
  } catch (_) {
    return null;
  }
  if (!obj || !['ms', 'me', 'mx'].includes(obj.a)) return null;

  const meal = cleanMeal(obj);
  if (!meal) return [{ type: 'text', text: 'ข้อมูลมื้อนี้ไม่ถูกต้อง ลองส่งรูปใหม่ หรือพิมพ์ เช่น "กิน 450 โปรตีน 30" นะ' }];

  if (obj.a === 'mx') {
    return [{ type: 'text', text: 'โอเค ไม่บันทึกมื้อนี้ 👍 ถ้าจะบันทึกเอง พิมพ์ เช่น "กิน 450 โปรตีน 30"' }];
  }

  if (dateOf(meal.t) !== todayStr()) {
    return [{ type: 'text', text: 'ปุ่มนี้เป็นของวันก่อนแล้ว ส่งรูปใหม่ หรือพิมพ์ เช่น "กิน 450 โปรตีน 30" เพื่อบันทึกวันนี้นะ' }];
  }

  if (obj.a === 'me') return [buildEditMessage(meal)];

  if (await alreadySaved(userId, meal)) {
    return [{ type: 'text', text: `มื้อนี้บันทึกไปแล้วนะ (${meal.name} ~${fmt(meal.kcal)} kcal) พิมพ์ "มื้อวันนี้" เพื่อดูสรุป` }];
  }
  const text = await logMealAndReply(userId, { name: meal.name, kcal: meal.kcal, protein: meal.protein }, 'photo');
  return [{ type: 'text', text: text.replace(/^🍽 ประเมินจากรูป/, '✅ บันทึกแล้ว') }];
}

module.exports = { buildPhotoMealConfirm, handleMealPostback };
