const { pushMessage } = require('../../lib/line');
const { getAllUsers } = require('../../lib/users');
const { buildTodayPlanMessage } = require('../../lib/healthplan');

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // ถ้ายังไม่ได้ตั้งค่า secret ข้ามการตรวจสอบ (ไม่แนะนำใน production)
  const auth = req.headers['authorization'];
  return auth === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const users = await getAllUsers();
  const reminderText = 'สวัสดีตอนเช้า ☀️ อย่าลืมชั่งน้ำหนักแล้วพิมพ์ตัวเลขส่งมาบันทึกด้วยนะ';

  for (const user of users) {
    if (!user.user_id) continue;
    try {
      const messages = [{ type: 'text', text: reminderText }];
      if (user.program_start_date) {
        messages.push(await buildTodayPlanMessage(user.user_id));
      }
      await pushMessage(user.user_id, messages);
    } catch (err) {
      console.error('morning-reminder error for', user.user_id, err);
    }
  }

  res.status(200).json({ status: 'ok', sent: users.length });
};
