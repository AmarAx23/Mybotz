const { pushOrThrow, notifyAdmin } = require('../../lib/admin');
const { isApproved } = require('../../lib/access');
const { getAllUsers } = require('../../lib/users');
const { buildTodayPlanMessage } = require('../../lib/healthplan');
const { getUserLogs, buildSummaryMessage } = require('../../lib/weight');
const { buildMonthlySummaryMessage, buildMonthlySummaryImage } = require('../../lib/reports');
const { buildWeeklyCoachMessage } = require('../../lib/coach');
const { buildWeeklyChartMessage } = require('../../lib/weeklychart');
const { buildWeeklyRewardsRecap } = require('../../lib/steps');
const { buildCoachNarrative } = require('../../lib/aicoach');
const { aiConfigured } = require('../../lib/ai');
const { todayStr, addDays } = require('../../lib/calc');
const { isPausedOn } = require('../../lib/pause');

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
  const startedAt = Date.now();
  for (const user of users) {
    if (!user.user_id) continue;
    if (!isApproved(user, user.user_id)) continue; // ยังไม่ได้รับอนุญาต (รหัสเชิญ)
    if (isPausedOn(user, today)) continue; // โหมดพัก
    try {
      // ส่งเฉพาะคนที่เคยบันทึกน้ำหนัก (หรือเริ่มแผนแล้ว) กันสแปมคนที่เพิ่งแอดบอทแต่ยังไม่ได้เริ่มใช้
      const hasLogged = !!user.start_weight;
      if (!hasLogged && !user.program_start_date) continue;

      const isFemale = user.gender === 'F';
      const messages = [];
      let weeklyChart = null;

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
          if (coach) {
            // โค้ชเขียนเป็นภาษาคน (AI) ต่อท้ายข้อความโค้ช ถ้าพังหรือใช้เวลานานเกินไปก็ข้าม ไม่กระทบข้อความอื่น
            if (aiConfigured() && Date.now() - startedAt < 35000) {
              try {
                const note = await buildCoachNarrative(user.user_id, coach.text);
                if (note) coach.text += '\n\n💬 ' + note;
              } catch (e) { console.error('coach narrative error for', user.user_id, e); }
            }
            // สรุปแต้ม/เหรียญประจำสัปดาห์ ต่อท้ายข้อความโค้ช (ไม่เพิ่มจำนวนข้อความ LINE จำกัด 5 ข้อความ/ครั้ง)
            try {
              const recap = await buildWeeklyRewardsRecap(user.user_id);
              if (recap) coach.text += '\n\n' + recap;
            } catch (e) { console.error('weekly rewards recap error for', user.user_id, e); }
            messages.push(coach);
            // กราฟก้าว/แคลอรี่ 7 วัน (ถ้าสร้างไม่ได้ก็ข้าม ไม่ให้กระทบข้อความอื่น)
            try { weeklyChart = await buildWeeklyChartMessage(user.user_id); } catch (e) { console.error('weekly chart error for', user.user_id, e); }
            if (weeklyChart) messages.push(weeklyChart);
          }
        } catch (err) {
          // ถ้าสรุปประจำสัปดาห์พัง (เช่น ยังไม่ได้สร้างตารางใหม่ใน Supabase) ก็ยังต้องส่งข้อความเตือนตามปกติ
          console.error('weekly coach error for', user.user_id, err);
        }
      }

      if (messages.length === 0) continue;

      // เพิ่งพักจบเมื่อวาน: ทักต้อนรับกลับ (แทรกในข้อความแรก ไม่เพิ่มจำนวนข้อความ)
      if (user.pause_until === addDays(today, -1) && messages[0].type === 'text') {
        messages[0] = { type: 'text', text: '👋 ครบช่วงพักแล้ว ยินดีต้อนรับกลับ! ค่อยๆ กลับมาทีละนิดก็พอ ไม่ต้องรีบชดเชย\n\n' + messages[0].text };
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
          try {
            const monthlyImage = await buildMonthlySummaryImage(user.user_id);
            if (monthlyImage) messages.push(monthlyImage);
          } catch (e) { console.error('monthly image error for', user.user_id, e); }
        }
      }

      // LINE push message รองรับสูงสุด 5 ข้อความต่อครั้ง ถ้าเกินให้ตัดกราฟรายสัปดาห์ออกก่อน
      if (weeklyChart && messages.length > 5) messages.splice(messages.indexOf(weeklyChart), 1);
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
