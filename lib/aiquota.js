const { getUserData, setUserFields } = require('./users');
const { todayStr } = require('./calc');
const { isAdmin } = require('./admin');

// จำนวนรูปที่ให้ AI อ่านได้ต่อคนต่อวัน (ปรับได้ด้วย env AI_DAILY_LIMIT)
function dailyLimit() {
  const n = parseInt(process.env.AI_DAILY_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

// เรียกก่อนส่งรูปให้ AI: ถ้ายังไม่เกินโควต้าจะนับเพิ่ม 1 แล้วคืน {allowed:true}
// เจ้าของบอท (ADMIN_USER_ID) ไม่จำกัด / ถ้ายังไม่ได้สร้างคอลัมน์ใน Supabase (supabase-v4.sql) ให้ผ่านไปก่อน ไม่ให้บอทพัง
async function consumeAiQuota(userId) {
  const limit = dailyLimit();
  if (isAdmin(userId)) return { allowed: true, limit, used: 0 };
  const user = await getUserData(userId);
  if (!user || user.ai_count === undefined) return { allowed: true, limit, used: 0 };
  const today = todayStr();
  const used = user.ai_date === today ? Number(user.ai_count) || 0 : 0;
  if (used >= limit) return { allowed: false, limit, used };
  await setUserFields(userId, { ai_date: today, ai_count: used + 1 });
  return { allowed: true, limit, used: used + 1 };
}

function overQuotaText(limit) {
  return `วันนี้ใช้ AI อ่านรูปครบ ${limit} รูปแล้ว พรุ่งนี้ใช้ได้ใหม่นะ\nระหว่างนี้พิมพ์บันทึกเองได้ เช่น "กิน 450 โปรตีน 30" หรือ "เดิน 7500"`;
}

module.exports = { consumeAiQuota, overQuotaText, dailyLimit };
