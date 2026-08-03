const { getUserData, setUserFields } = require('./users');
const { todayStr, TIMEZONE } = require('./calc');
const {
  PLAN_HEIGHT_CM, PLAN_AGE, PLAN_GENDER, PLAN_ACTIVITY_LEVEL, PLAN_TARGET_WEIGHT,
  PLAN_CALORIE_MIN, PLAN_CALORIE_MAX, PLAN_PROTEIN_MIN, PLAN_PROTEIN_MAX,
  RUN_PLAN, DIET_30, PHASE_START_NOTES, getWeightDay
} = require('./plan-data');

async function startPlan(userId) {
  const today = todayStr();
  await setUserFields(userId, {
    program_start_date: today,
    height: PLAN_HEIGHT_CM,
    age: PLAN_AGE,
    gender: PLAN_GENDER,
    activity_level: PLAN_ACTIVITY_LEVEL,
    target_weight: PLAN_TARGET_WEIGHT
  });

  return '🚀 เริ่มแผนสุขภาพ 4 เดือนแล้ว! วันนี้คือวันที่ 1\n' +
    `ตั้งค่าโปรไฟล์ (ส่วนสูง/อายุ/เพศ/กิจกรรม) และเป้าหมายน้ำหนัก ${PLAN_TARGET_WEIGHT} กก. ให้อัตโนมัติแล้ว (แก้ได้ด้วย "เป้าหมาย <ตัวเลข>")\n` +
    `เป้าแคลอรี่จากแผน: ${PLAN_CALORIE_MIN}-${PLAN_CALORIE_MAX} kcal/วัน, โปรตีน ${PLAN_PROTEIN_MIN}-${PLAN_PROTEIN_MAX} กรัม/วัน\n\n` +
    'พิมพ์ "วันนี้" เพื่อดูตารางเวท/วิ่งและเมนูอาหารของวันนี้ได้เลย ทุกเช้าบอทจะแนบตารางของวันนั้นมาพร้อมข้อความแจ้งเตือนด้วย\n\n' +
    'ก่อนเริ่มเฟสที่หนักขึ้น (โดยเฉพาะสัปดาห์ 9 เป็นต้นไป) แนะนำปรึกษาแพทย์ก่อน หากเจ็บ/แน่นหน้าอก เวียนหัวรุนแรงระหว่างฝึก ให้หยุดทันที';
}

function weekdayKeyFor(date) {
  // 'u' equivalent: 1=จันทร์...7=อาทิตย์ ตามเขตเวลา Asia/Bangkok
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short' }).format(date);
  const map = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
  return map[parts];
}

async function buildTodayPlanMessage(userId) {
  const user = await getUserData(userId);
  if (!user || !user.program_start_date) {
    return { type: 'text', text: 'ยังไม่ได้เริ่มโปรแกรม พิมพ์ "เริ่มแผน" เพื่อเริ่มนับวันที่ 1 ของแผน 4 เดือนนะ' };
  }

  const startDate = new Date(user.program_start_date + 'T00:00:00Z');
  const today = new Date(todayStr() + 'T00:00:00Z');
  const dayNumber = Math.round((today - startDate) / 86400000) + 1;

  if (dayNumber < 1) {
    return { type: 'text', text: `โปรแกรมยังไม่เริ่มนะ (เริ่มวันที่ ${user.program_start_date})` };
  }
  if (dayNumber > 112) {
    return { type: 'text', text: '🎉 คุณทำครบ 16 สัปดาห์ของโปรแกรมแล้ว! ลองประเมินร่างกายใหม่ และพิมพ์ "เริ่มแผน" อีกครั้งถ้าจะเริ่มรอบใหม่' };
  }

  const weekNumber = Math.ceil(dayNumber / 7);
  const phase = weekNumber <= 4 ? 1 : (weekNumber <= 8 ? 2 : (weekNumber <= 12 ? 3 : 4));
  const weekdayKey = weekdayKeyFor(today);

  let msg = `📅 วันที่ ${dayNumber} ของแผน (สัปดาห์ ${weekNumber}, เฟส ${phase})\n\n`;

  const weekStartDay = (weekNumber - 1) * 7 + 1;
  if (dayNumber === weekStartDay && PHASE_START_NOTES[weekNumber]) {
    msg += PHASE_START_NOTES[weekNumber] + '\n\n';
  }

  if (weekdayKey === 'tue' || weekdayKey === 'thu') {
    msg += '🏃 วิ่ง (Easy run): ' + RUN_PLAN[weekNumber].tuethu + '\n\n';
  } else if (weekdayKey === 'sat') {
    msg += '🏃 วิ่ง (Long run): ' + RUN_PLAN[weekNumber].sat + '\n\n';
  } else {
    msg += '🏋️ ' + getWeightDay(phase, weekNumber, weekdayKey) + '\n\n';
  }

  const diet = DIET_30[(dayNumber - 1) % 30];
  msg += `🍽 มื้อกลางวัน: ${diet.lunch}\n`;
  msg += `มื้อเย็น: ${diet.dinner}\n`;
  msg += `แคลอรี่รวมวันนี้: ~${diet.kcal} kcal, โปรตีน ~${diet.protein} กรัม`;
  if (diet.batch) msg += '\n👉 วันนี้ต้องทำอาหารเย็น batch ใหม่ (ทำได้ 4 มื้อ)';

  return { type: 'text', text: msg };
}

module.exports = { startPlan, buildTodayPlanMessage };
