const { pushMessage } = require('../../lib/line');
const { getAllUsers } = require('../../lib/users');
const { todayStr } = require('../../lib/calc');

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

  for (const user of users) {
    if (!user.user_id) continue;
    if (!user.start_weight) continue; // ยังไม่เคยบันทึกน้ำหนักเลยสักครั้ง ข้ามไป (กันสแปมคนที่เพิ่งแอดบอท)
    if (user.last_log_date === today) continue; // บันทึกวันนี้ไปแล้ว ไม่ต้องเตือนซ้ำ
    const isFemale = user.gender === 'F';
    if (isFemale && !isSunday(today)) continue; // ผู้ใช้หญิงชั่งน้ำหนักวันอาทิตย์วันเดียว

    try {
      await pushMessage(user.user_id, [
        { type: 'text', text: isFemale
          ? '⏰ วันนี้วันอาทิตย์ ยังไม่ได้บันทึกน้ำหนักเลยนะ อย่าลืมชั่งแล้วพิมพ์ตัวเลขมาบันทึกด้วย'
          : '⏰ วันนี้ยังไม่ได้บันทึกน้ำหนักเลยนะ อย่าลืมพิมพ์ตัวเลขมาบันทึกก่อน streak จะขาด!' }
      ]);
      sent++;
    } catch (err) {
      console.error('streak-check error for', user.user_id, err);
    }
  }

  res.status(200).json({ status: 'ok', sent });
};
