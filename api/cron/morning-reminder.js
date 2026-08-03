const { pushMessage } = require('../../lib/line');
const { getAllUsers } = require('../../lib/users');
const { buildTodayPlanMessage } = require('../../lib/healthplan');
const { getUserLogs, buildSummaryMessage } = require('../../lib/weight');
const { buildMonthlySummaryMessage, buildMonthlySummaryImage } = require('../../lib/reports');
const { todayStr } = require('../../lib/calc');

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // ถ้ายังไม่ได้ตั้งค่า secret ข้ามการตรวจสอบ (ไม่แนะนำใน production)
  const auth = req.headers['authorization'];
  return auth === `Bearer ${secret}`;
}

function isSunday(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay() === 0;
}

function isFirstOfMonth(dateStr) {
  return dateStr.slice(8, 10) === '01';
}

// รวมสรุปรายสัปดาห์/รายเดือนไว้ในรอบเดียวกับแจ้งเตือนตอนเช้า
// เพื่อให้ใช้ cron job แค่ 2 ตัว (พอดีกับข้อจำกัดของ Vercel แผนฟรี)
module.exports = async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const users = await getAllUsers();
  const today = todayStr();
  const reminderText = 'สวัสดีตอนเช้า ☀️ อย่าลืมชั่งน้ำหนักแล้วพิมพ์ตัวเลขส่งมาบันทึกด้วยนะ';

  for (const user of users) {
    if (!user.user_id) continue;
    try {
      const messages = [{ type: 'text', text: reminderText }];

      if (user.program_start_date) {
        messages.push(await buildTodayPlanMessage(user.user_id));
      }

      const logs = await getUserLogs(user.user_id, 1);
      if (logs.length > 0) {
        if (isSunday(today)) {
          const summary = await buildSummaryMessage(user.user_id);
          messages.push({ type: 'text', text: '📅 สรุปประจำสัปดาห์\n\n' + summary.text });
        }
        if (isFirstOfMonth(today)) {
          const monthly = await buildMonthlySummaryMessage(user.user_id);
          if (monthly) messages.push(monthly);
          const monthlyImage = await buildMonthlySummaryImage(user.user_id);
          if (monthlyImage) messages.push(monthlyImage);
        }
      }

      // LINE push message รองรับสูงสุด 5 ข้อความต่อครั้ง
      await pushMessage(user.user_id, messages.slice(0, 5));
    } catch (err) {
      console.error('morning-reminder error for', user.user_id, err);
    }
  }

  res.status(200).json({ status: 'ok', sent: users.length });
};
