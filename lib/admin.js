// ฟังก์ชันสำหรับเจ้าของบอท: ส่งแจ้งเตือนเมื่อระบบมีปัญหา + ส่ง push แบบที่รายงาน error ได้
// ตั้ง ADMIN_USER_ID ใน Vercel (พิมพ์ "ไอดีฉัน" ในแชทบอทเพื่อดูไอดีของตัวเอง)

function isAdmin(userId) {
  return !!process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID;
}

// push ข้อความไปหาผู้ใช้ ถ้า LINE ตอบ error (เช่น โควต้าเต็ม) จะ throw เพื่อให้ผู้เรียกนับ/รายงานได้
async function pushOrThrow(userId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ to: userId, messages })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push ${res.status}: ${body.slice(0, 150)}`);
  }
}

// กันส่งซ้ำรัวๆ: หัวข้อเดียวกันส่งได้ไม่เกิน 1 ครั้งต่อ 10 นาที (ต่อ instance)
const lastSent = {};
async function notifyAdmin(key, text) {
  const admin = process.env.ADMIN_USER_ID;
  if (!admin) return false;
  const now = Date.now();
  if (lastSent[key] && now - lastSent[key] < 10 * 60 * 1000) return false;
  lastSent[key] = now;
  try {
    await pushOrThrow(admin, [{ type: 'text', text: ('⚠️ แจ้งเตือนจากบอท\n' + text).slice(0, 1000) }]);
    return true;
  } catch (err) {
    console.error('notifyAdmin failed:', err);
    return false;
  }
}

module.exports = { isAdmin, pushOrThrow, notifyAdmin };
