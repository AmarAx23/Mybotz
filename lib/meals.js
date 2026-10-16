const { getSupabase } = require('./supabase');
const { todayStr } = require('./calc');
const { getCalorieTargetForUser } = require('./healthplan');

const fmt = (n) => Number(n).toLocaleString('en-US');

async function getMealsForDate(userId, dateStr) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('meals').select('id, name, kcal, protein, created_at')
    .eq('user_id', userId).eq('log_date', dateStr).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, name: r.name, kcal: Number(r.kcal), protein: Number(r.protein) }));
}

async function getMealsSince(userId, sinceDate) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('meals').select('log_date, kcal, protein')
    .eq('user_id', userId).gte('log_date', sinceDate);
  if (error) throw error;
  return (data || []).map((r) => ({ date: r.log_date, kcal: Number(r.kcal), protein: Number(r.protein) }));
}

async function addMeal(userId, meal) {
  const supabase = getSupabase();
  const { error } = await supabase.from('meals').insert({
    user_id: userId, log_date: todayStr(), name: meal.name, kcal: meal.kcal, protein: meal.protein,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function deleteLastMeal(userId) {
  const meals = await getMealsForDate(userId, todayStr());
  if (meals.length === 0) return 'วันนี้ยังไม่มีมื้อที่บันทึกไว้เลย';
  const last = meals[meals.length - 1];
  const supabase = getSupabase();
  const { error } = await supabase.from('meals').delete().eq('id', last.id);
  if (error) throw error;
  return `🗑 ลบมื้อล่าสุดแล้ว (${last.name} ~${fmt(last.kcal)} kcal)`;
}

function totals(meals) {
  return meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein }), { kcal: 0, protein: 0 });
}

// บรรทัดสรุปยอดรวมวันนี้เทียบเป้า (ถ้ามีเป้า)
async function dayTotalLines(userId, meals) {
  const t = totals(meals);
  const target = await getCalorieTargetForUser(userId);
  let msg = `📊 วันนี้กินไปแล้ว: ${fmt(t.kcal)} kcal, โปรตีน ${fmt(t.protein)} กรัม\n`;
  if (!target) {
    msg += 'ตั้งโปรไฟล์ให้ครบ (เพศ/ส่วนสูง/อายุ/น้ำหนัก) บอทจะเทียบกับเป้าแคลอรี่ให้ด้วย';
    return msg;
  }
  if (target.maintain) {
    msg += `เป้าโดยประมาณ ~${fmt(target.min)} kcal, โปรตีน ${target.protein.min}-${target.protein.max} กรัม`;
    return msg;
  }
  msg += `เป้า: ${fmt(target.min)}-${fmt(target.max)} kcal, โปรตีน ${target.protein.min}-${target.protein.max} กรัม\n`;
  if (t.kcal <= target.max) msg += `เหลืออีก ~${fmt(target.max - t.kcal)} kcal ถึงเพดานของวัน`;
  else msg += `เกินเพดานไป ~${fmt(t.kcal - target.max)} kcal แล้ว ไม่เป็นไรนะ มื้อต่อไปเบาลงหน่อยก็พอ`;
  if (t.protein < target.protein.min) msg += `\nโปรตีนยังขาดอีก ~${fmt(target.protein.min - t.protein)} กรัมถึงขั้นต่ำ`;
  return msg;
}

async function logMealAndReply(userId, meal, source) {
  await addMeal(userId, meal);
  const meals = await getMealsForDate(userId, todayStr());
  let msg = source === 'photo'
    ? `🍽 ประเมินจากรูป: ${meal.name}\n≈ ${fmt(meal.kcal)} kcal, โปรตีน ≈ ${fmt(meal.protein)} กรัม\n(เป็นค่าประมาณ คลาดเคลื่อนได้ราว 20-30%)\n\n`
    : `🍽 บันทึกมื้อ: ${fmt(meal.kcal)} kcal, โปรตีน ${fmt(meal.protein)} กรัม\n\n`;
  msg += await dayTotalLines(userId, meals);
  msg += '\n\nถ้าไม่ตรง พิมพ์ "ลบมื้อล่าสุด" แล้วบันทึกใหม่ได้ (เช่น "กิน 450 โปรตีน 30")';
  return msg;
}

async function buildMealsSummaryMessage(userId) {
  const meals = await getMealsForDate(userId, todayStr());
  if (meals.length === 0) {
    return { type: 'text', text: 'วันนี้ยังไม่ได้บันทึกมื้ออาหารเลย ส่งรูปอาหารมาให้ประเมินได้ หรือพิมพ์ เช่น "กิน 450 โปรตีน 30"' };
  }
  let msg = '🍽 มื้อที่บันทึกวันนี้\n';
  meals.forEach((m, i) => { msg += `${i + 1}. ${m.name} — ${fmt(m.kcal)} kcal, โปรตีน ${fmt(m.protein)} ก.\n`; });
  msg += '\n' + (await dayTotalLines(userId, meals));
  return { type: 'text', text: msg };
}

module.exports = { logMealAndReply, deleteLastMeal, buildMealsSummaryMessage, getMealsForDate, getMealsSince };
