// แลกแต้มเป็นรางวัลจริง (เจ้าของบอทเลี้ยง) ทุกๆ REWARD.cost แต้ม แลกได้เรื่อยๆ
// มี 2 ยอด: "แต้มสะสม" (ใช้วัดระดับ ไม่ลดลง) และ "แต้มแลกของ" = แต้มสะสม - แต้มที่แลกไปแล้ว
// ต้องมีตาราง reward_redemptions ใน Supabase (ดู supabase-schema.sql)
const { getSupabase } = require('./supabase');
const { pushOrThrow, notifyAdmin } = require('./admin');
const { getProfileName } = require('./line');

const fmt = (n) => Number(n).toLocaleString('en-US');

// ---------- ตั้งค่ารางวัล (แก้ตรงนี้ได้) ----------
const REWARD = {
  id: 'sushiro',
  name: 'Sushiro ฟรี 1 มื้อ 🍣',
  cost: 400,
  title: '🍣 จอมหม่ำ' // ได้ +1 ทุกครั้งที่แลก เช่น 🍣 จอมหม่ำ+2
};

async function getRedemptions(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reward_redemptions').select('id, reward, points, status, created_at')
    .eq('user_id', userId).order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// สรุปยอดแลกของ: ถ้าตารางยังไม่มี/อ่านไม่ได้ คืน null (ส่วนอื่นของบอทยังทำงานต่อได้)
async function getWallet(userId, lifetimePoints) {
  let list;
  try {
    list = await getRedemptions(userId);
  } catch (err) {
    console.error('getRedemptions error:', err);
    await notifyAdmin('redeem-table', 'อ่านตาราง reward_redemptions ไม่ได้ (รัน SQL ใน supabase-schema.sql แล้วหรือยัง?): ' + String(err.message || err).slice(0, 200));
    return null;
  }
  const spent = list.reduce((a, r) => a + Number(r.points), 0);
  return { spent, balance: Math.max(0, lifetimePoints - spent), count: list.length, list };
}

function titleFor(count) {
  return count > 0 ? `${REWARD.title}+${count}` : '';
}

// บรรทัดต่อท้ายตอนบันทึกก้าว
function walletLine(beforePoints, afterPoints, wallet) {
  if (!wallet) return '';
  const before = Math.max(0, beforePoints - wallet.spent);
  const after = Math.max(0, afterPoints - wallet.spent);
  if (after >= REWARD.cost && before < REWARD.cost) {
    return `\n🎁 แต้มแลกของครบ ${fmt(REWARD.cost)} แล้ว! แลก ${REWARD.name} ได้เลย\nพิมพ์ "แลกรางวัล" เพื่อรับสิทธิ์\n`;
  }
  if (after >= REWARD.cost) return `🎁 แต้มแลกของ ${fmt(after)} (แลก ${REWARD.name} ได้ พิมพ์ "แลกรางวัล")\n`;
  return `🎁 แต้มแลกของ ${fmt(after)}/${fmt(REWARD.cost)} (อีก ${fmt(REWARD.cost - after)} ได้ ${REWARD.name})\n`;
}

// คำสั่ง "แลกรางวัล": แสดงยอด และปุ่มยืนยัน (ถ้าแต้มพอ)
function buildRedeemPrompt(wallet) {
  if (!wallet) return { type: 'text', text: 'ระบบแลกรางวัลยังไม่พร้อม ลองใหม่ภายหลังนะ' };
  let text = `🎁 แต้มแลกของ: ${fmt(wallet.balance)} แต้ม\nรางวัล: ${REWARD.name} (ใช้ ${fmt(REWARD.cost)} แต้ม)\n`;
  if (wallet.count) text += `แลกไปแล้ว ${wallet.count} ครั้ง ${titleFor(wallet.count)}\n`;
  if (wallet.balance < REWARD.cost) {
    text += `\nยังขาดอีก ${fmt(REWARD.cost - wallet.balance)} แต้ม เดินต่ออีกนิดนะ 💪`;
    return { type: 'text', text };
  }
  text += '\nกด "ยืนยันแลก" เพื่อรับสิทธิ์ (แต้มแลกของจะลด แต่แต้มสะสมและระดับไม่ลด)';
  return {
    type: 'text',
    text,
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '✅ ยืนยันแลก', data: JSON.stringify({ a: 'rd', t: Date.now() }), displayText: 'ยืนยันแลกรางวัล' } },
        { type: 'action', action: { type: 'postback', label: 'ไว้ก่อน', data: JSON.stringify({ a: 'rx' }), displayText: 'ไว้ก่อน' } }
      ]
    }
  };
}

// กดปุ่มยืนยันแลก (postback a='rd') -> คืน LINE messages หรือ null ถ้าไม่ใช่ postback ของการแลก
async function handleRedeemPostback(userId, rawData, getLifetimePoints) {
  let obj;
  try { obj = JSON.parse(rawData); } catch (_) { return null; }
  if (!obj || (obj.a !== 'rd' && obj.a !== 'rx')) return null;
  if (obj.a === 'rx') return [{ type: 'text', text: 'โอเค เก็บแต้มไว้ก่อน พิมพ์ "แลกรางวัล" เมื่อไหร่ก็ได้นะ' }];

  const points = await getLifetimePoints();
  const wallet = await getWallet(userId, points);
  if (!wallet) return [{ type: 'text', text: 'ระบบแลกรางวัลยังไม่พร้อม ลองใหม่ภายหลังนะ' }];

  // กดปุ่มเดิมซ้ำ: มีการแลกหลังเวลาที่สร้างปุ่มแล้ว = แลกไปแล้ว
  const t = Number(obj.t) || 0;
  if (wallet.list.some((r) => new Date(r.created_at).getTime() >= t)) {
    return [{ type: 'text', text: `แลกรางวัลนี้ไปแล้วนะ ${titleFor(wallet.count)} พิมพ์ "แลกรางวัล" ดูยอดล่าสุด` }];
  }
  if (wallet.balance < REWARD.cost) {
    return [{ type: 'text', text: `แต้มแลกของยังไม่พอ (มี ${fmt(wallet.balance)} ต้องใช้ ${fmt(REWARD.cost)})` }];
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.from('reward_redemptions')
    .insert({ user_id: userId, reward: REWARD.id, points: REWARD.cost, status: 'pending' })
    .select('id').single();
  if (error) throw error;

  const count = wallet.count + 1;
  const left = wallet.balance - REWARD.cost;

  // แจ้งเจ้าของบอท (ไม่ใช้ notifyAdmin เพราะนั่นจำกัด 1 ครั้ง/10 นาที)
  if (process.env.ADMIN_USER_ID) {
    const name = await getProfileName(userId);
    try {
      await pushOrThrow(process.env.ADMIN_USER_ID, [{
        type: 'text',
        text: `🎁 มีคนแลกรางวัล! (#${data.id})\nผู้ใช้: ${name || 'ไม่ทราบชื่อ'}\nรางวัล: ${REWARD.name}\nแลกครั้งที่ ${count} (${titleFor(count)})\n\nพาไปกินแล้วพิมพ์ "ส่งแล้ว ${data.id}" บอทจะแจ้งผู้ใช้ให้`
      }]);
    } catch (err) {
      console.error('notify admin redeem error:', err);
    }
  }

  return [{
    type: 'text',
    text: `🎉 แลกสำเร็จ! ได้สิทธิ์ ${REWARD.name}\n🏷️ ได้ฉายา ${titleFor(count)}\n\nแจ้งเจ้าของบอทแล้ว รอติดต่อนัดวันไปกินได้เลย\n🎁 แต้มแลกของเหลือ ${fmt(left)} แต้ม\n\nกินให้อร่อย แล้วอย่าลืมบันทึกมื้อนั้นด้วยนะ 😋`
  }];
}

// ---------- คำสั่งของเจ้าของบอท ----------
// "รายการแลก": รายการที่ยังไม่ได้เลี้ยง
async function buildPendingListText() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reward_redemptions').select('id, user_id, reward, created_at')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(30);
  if (error) throw error;
  if (!data || data.length === 0) return '✅ ไม่มีรางวัลค้างเลี้ยง';
  let msg = `🎁 รางวัลที่ยังไม่ได้เลี้ยง (${data.length})\n`;
  for (const r of data) {
    const name = await getProfileName(r.user_id);
    msg += `#${r.id} ${name || r.user_id.slice(0, 8)} — ${new Date(r.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}\n`;
  }
  msg += '\nเลี้ยงแล้วพิมพ์ "ส่งแล้ว <เลข>" เช่น "ส่งแล้ว ' + data[0].id + '"';
  return msg;
}

// "ส่งแล้ว 12": ทำเครื่องหมายว่าเลี้ยงแล้ว และแจ้งผู้ใช้
async function markFulfilled(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reward_redemptions').update({ status: 'done', fulfilled_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select('user_id').maybeSingle();
  if (error) throw error;
  if (!data) return `ไม่เจอรายการ #${id} ที่ยังค้างอยู่ (อาจส่งไปแล้ว) พิมพ์ "รายการแลก" ดูทั้งหมด`;
  try {
    await pushOrThrow(data.user_id, [{ type: 'text', text: `🍣 รับรางวัล ${REWARD.name} เรียบร้อย! ขอบคุณที่ขยันเดินนะ เก็บแต้มรอบหน้าต่อเลย 💪` }]);
  } catch (err) {
    console.error('push fulfilled error:', err);
    return `✅ บันทึก #${id} ว่าเลี้ยงแล้ว (แต่ส่งข้อความหาผู้ใช้ไม่สำเร็จ)`;
  }
  return `✅ บันทึก #${id} ว่าเลี้ยงแล้ว และแจ้งผู้ใช้แล้ว`;
}

module.exports = {
  REWARD, getWallet, titleFor, walletLine, buildRedeemPrompt, handleRedeemPostback, buildPendingListText, markFulfilled
};
