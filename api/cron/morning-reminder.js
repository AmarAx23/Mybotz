const { pushOrThrow, notifyAdmin } = require('../../lib/admin');
const { isApproved } = require('../../lib/access');
const { getAllUsers } = require('../../lib/users');
const { buildTodayPlanMessage } = require('../../lib/healthplan');
const { getUserLogs, buildSummaryMessage } = require('../../lib/weight');
const { buildMonthlySummaryMessage, buildMonthlySummaryImage } = require('../../lib/reports');
const { buildWeeklyCoachMessage } = require('../../lib/coach');
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

  const failures = [];
  for (const user of users) {
    if (!user.user_id) continue;
    if (!isApproved(user, user.user_id)) continue; // ยังไม่ได้รับอนุญาต (รหัสเชิญ)
    try {
      // ส่งเฉพาะคนที่เคยบันทึกน้ำหนัก (หรือเริ่มแผนแล้ว) กันสแปมคนที่เพิ่งแอดบอทแต่ยังไม่ได้เริ่มใช้
      const hasLogged = !!user.start_weight;
      if (!hasLogged && !user.program_start_date) continue;

      const isFemale = user.gender === 'F';
      const messages = [];

      if (!isFemale) {
        if (hasLogged) messages.push({ type: 'text', text: reminderText });
      } else if (isSunday(today)) {
        // ผู้ใช้หญิง: ชั่งน้ำหนักสัปดาห์ละครั้ง (วันอาทิตย์) ส่วนวันอื่นเตือนเฉพาะชาเลนจ์เดิน
        if (hasLogged) messages.push({ type: 'text', text: 'สวัสดีตอนเช้า ☀️ วันนี้วันอาทิตย์ อย่าลืมชั่งน้ำหนักแล้วพิมพ์ตัวเลขส่งมาบันทึกด้วยนะ' });
      } else if (user.program_start_date) {
        messages.push({ type: 'text', text: 'สวัสดีตอนเช้า ☀️ ชาเลนจ์เดินวันนี้มาแล้ว!' });
      }

      if (user.program_start_date) {
        messages.push(await buildTodayPlanMessage(user.user_id));
      }

      if (isSunday(today)) {
        // โค้ชประจำสัปดาห์ (ก้าว/อาหาร/ระดับกิจกรรม/แนวโน้มน้ำหนัก) ส่งวันอาทิตย์
        try {
          const coach = await buildWeeklyCoachMessage(user.user_id, { apply: true });
          if (coach) messages.push(coach);
        } catch (err) {
          // ถ้าสรุปประจำสัปดาห์พัง (เช่น ยังไม่ได้สร้างตารางใหม่ใน Supabase) ก็ยังต้องส่งข้อความเตือนตามปกติ
          console.error('weekly coach error for', user.user_id, err);
        }
      }

      if (messages.length === 0) continue;

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
      await pushOrThrow(user.user_id, messages.slice(0, 5));
    } catch (err) {
      console.error('morning-reminder error for', user.user_id, err);
      failures.push(String(err && err.message ? err.message : err));
    }
  }

  if (failures.length > 0) {
    await notifyAdmin('cron-morning', `แจ้งเตือนเช้าส่งไม่สำเร็จ ${failures.length} คน (จากทั้งหมด ${users.length})\nตัวอย่าง: ${failures[0]}`);
  }

  res.status(200).json({ status: 'ok', sent: users.length - failures.length, failed: failures.length });
};
