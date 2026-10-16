// จำกัดคนใช้ด้วยรหัสเชิญ: ตั้ง INVITE_CODE ใน Vercel เพื่อเปิดใช้ ถ้าไม่ตั้ง = ใครก็ใช้ได้เหมือนเดิม
const { setUserFields } = require('./users');
const { isAdmin } = require('./admin');

function accessRequired() {
  return !!(process.env.INVITE_CODE && process.env.INVITE_CODE.trim());
}

function isApproved(user, userId) {
  if (!accessRequired()) return true;
  if (userId && isAdmin(userId)) return true;
  if (!user) return false;
  if (user.approved === undefined) return true; // ยังไม่ได้เพิ่มคอลัมน์ approved ใน Supabase -> ไม่ล็อกใคร
  return user.approved === true;
}

// ผู้ใช้พิมพ์ "รหัส xxxx" -> 'ok' | 'wrong' | null (ไม่ใช่ข้อความขอรหัส)
async function tryApprove(userId, text) {
  const m = String(text).trim().match(/^(?:รหัสเชิญ|รหัส|code|invite)\s*[:=]?\s*(\S+)/i);
  if (!m) return null;
  if (m[1].toLowerCase() !== process.env.INVITE_CODE.trim().toLowerCase()) return 'wrong';
  await setUserFields(userId, { approved: true });
  return 'ok';
}

const NEED_CODE_TEXT = 'บอทนี้ใช้ได้เฉพาะคนที่ได้รับเชิญนะ 🔒\nถ้าคุณมีรหัสเชิญ พิมพ์: รหัส <รหัสเชิญ> เช่น "รหัส abc123"';

module.exports = { accessRequired, isApproved, tryApprove, NEED_CODE_TEXT };
