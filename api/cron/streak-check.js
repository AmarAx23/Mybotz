const { pushOrThrow, notifyAdmin } = require('../../lib/admin');
const { isApproved } = require('../../lib/access');
const { getAllUsers } = require('../../lib/users');
const { todayStr } = require('../../lib/calc');
const { isPausedOn } = require('../../lib/pause');

function isSunday(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay() === 0;
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers['authorization'];
  return auth === `Bearer ${secret}`;
}

// ทำงานตอนบ่าย: ถ้าใครยังไม่บันทึกน้ำหนักวันนี้ (และเคยบันทึกมาก่อนอย่างน้อยครั้งนึง) ส่งเตือนอีกรอบ
module.exports = async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const users = await getAllUsers();
  const today = todayStr();
  let sent = 0;
  const failures = [];

  for (const user of users) {
    if (!user.user_id) continue;
    if (!isApproved(user, user.user_id)) continue;
    if (!user.start_weight) continue; // ยังไม่เคยบันทึกน้ำหนักเลยสักครั้ง ข้ามไป (กันสแปมคนที่เพิ่งแอดบอท)
    if (isPausedOn(user, today)) continue; // โหมดพัก
    if (user.last_log_date === today) continue; // บันทึกวันนี้ไปแล้ว ไม่ต้องเตือนซ้ำ
    const isFemale = user.gender === 'F';
    if (isFemale && !isSunday(today)) continue; // ผู้ใช้หญิงชั่งน้ำหนักวันอาทิตย์วันเดียว

    try {
      await pushOrThrow(user.user_id, [
        { type: 'text', text: isFemale
          ? '⏰ วันนี้วันอาทิตย์ ยังไม่ได้บันทึกน้ำหนักเลยนะ อย่าลืมชั่งแล้วพิมพ์ตัวเลขมาบันทึกด้วย'
          : '⏰ วันนี้ยังไม่ได้บันทึกน้ำหนักเลยนะ อย่าลืมพิมพ์ตัวเลขมาบันทึกก่อน streak จะขาด!' }
      ]);
      sent++;
    } catch (err) {
      console.error('streak-check error for', user.user_id, err);
      failures.push(String(err && err.message ? err.message : err));
    }
  }

  if (failures.length > 0) {
    await notifyAdmin('cron-streak', `แจ้งเตือนบ่ายส่งไม่สำเร็จ ${failures.length} คน\nตัวอย่าง: ${failures[0]}`);
  }

  res.status(200).json({ status: 'ok', sent, failed: failures.length });
};
