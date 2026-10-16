const { getUserData, setUserFields } = require('./users');
const { getUserLogs } = require('./weight');
const { todayStr, addDays, TIMEZONE, calcCalorieTarget, calcDeadlineTarget, daysBetween } = require('./calc');
const {
  PLAN_HEIGHT_CM, PLAN_AGE, PLAN_GENDER,
  PLAN_CALORIE_MIN, PLAN_CALORIE_MAX, PLAN_PROTEIN_MIN, PLAN_PROTEIN_MAX,
  RUN_PLAN, PHASE_START_NOTES, getWeightDay
} = require('./plan-data');
const { PHASE_START_NOTES_F, getWalkDay } = require('./plan-female');

// ข้อมูลที่ต้องมีก่อนเริ่มแผน (เรียงตามลำดับที่ถามทีละข้อ)
function missingProfileSteps(user, latestWeight) {
  const steps = [];
  if (!user.gender) steps.push('พิมพ์ "เพศ ชาย" หรือ "เพศ หญิง"');
  if (!user.height) steps.push('พิมพ์ส่วนสูง (ซม.) เช่น "ส่วนสูง 160"');
  if (!user.age) steps.push('พิมพ์อายุ (ปี) เช่น "อายุ 28"');
  if (latestWeight === null) steps.push('ส่งตัวเลขน้ำหนักวันนี้มา เช่น "55.4"');
  if (!user.activity_level) {
    steps.push('เลือกระดับกิจกรรมตอนนี้ พิมพ์ "กิจกรรม 1-5" เช่น "กิจกรรม 2"\n' +
      '1 = นั่งทำงาน แทบไม่ออกกำลัง\n' +
      '2 = ออกกำลังเบาๆ 1-3 วัน/สัปดาห์\n' +
      '3 = ออกกำลังปานกลาง 3-5 วัน/สัปดาห์\n' +
      '4 = ออกกำลังหนัก 6-7 วัน/สัปดาห์\n' +
      '5 = หนักมาก หรือใช้แรงงานทุกวัน\n' +
      '(ไม่แน่ใจ ให้เลือกต่ำกว่าที่คิดไว้หนึ่งขั้น)');
  }
  if (!user.target_weight) steps.push('พิมพ์เป้าหมายน้ำหนัก (กก.) เช่น "เป้าหมาย 52"');
  return steps;
}

async function getLatestWeight(userId) {
  const logs = await getUserLogs(userId, 1);
  return logs.length > 0 ? logs[0].weight : null;
}

// ข้อความถามข้อมูลข้อถัดไป (ถามทีละข้อ) — คืน null ถ้าเริ่มแผนไปแล้ว
async function onboardingHint(userId) {
  const user = await getUserData(userId);
  if (!user || user.program_start_date) return null;
  const steps = missingProfileSteps(user, await getLatestWeight(userId));
  if (steps.length === 0) return '✅ ข้อมูลครบแล้ว พิมพ์ "เริ่มแผน" ได้เลย 🚀';
  return `📝 ขั้นต่อไป (เหลืออีก ${steps.length} ข้อก่อนเริ่มแผน): ${steps[0]}`;
}

// โปรไฟล์ตรงกับที่ใช้ทำแผน PDF ต้นฉบับ -> ใช้ตัวเลขแคลอรี่จากแผนเดิม ไม่งั้นคำนวณจากโปรไฟล์ของแต่ละคน
function isOriginalPlanProfile(user) {
  return user.gender === PLAN_GENDER && Number(user.height) === PLAN_HEIGHT_CM && Number(user.age) === PLAN_AGE;
}

// ปรับเป้าแคลอรี่ตามค่าที่ผู้ใช้ตั้งเอง (พิมพ์ "ปรับแคลอรี่ -150") โดยไม่ต่ำกว่าขั้นต่ำที่ปลอดภัย
function calorieGuide(user, weight) {
  const g = calorieGuideBase(user, weight);
  const adj = Number(user.kcal_adjust) || 0;
  if (!adj || g.maintain) return g;
  const floor = user.gender === 'M' ? 1500 : 1200;
  const min = Math.max(g.min + adj, floor);
  const max = Math.max(g.max + adj, min + 100);
  return { ...g, min, max, adjust: adj };
}

function calorieGuideBase(user, weight) {
  // ถ้าผู้ใช้ตั้งกำหนดเวลาถึงเป้าหมายไว้ ให้คำนวณจากเป้า+กำหนดเวลา
  if (user.target_date && user.target_weight) {
    const daysLeft = daysBetween(todayStr(), user.target_date);
    if (daysLeft > 0 && weight > Number(user.target_weight)) {
      return calcDeadlineTarget(weight, user.height, user.age, user.gender, user.activity_level, Number(user.target_weight), daysLeft);
    }
  }
  if (isOriginalPlanProfile(user)) {
    return { min: PLAN_CALORIE_MIN, max: PLAN_CALORIE_MAX, protein: { min: PLAN_PROTEIN_MIN, max: PLAN_PROTEIN_MAX }, maintain: false };
  }
  return calcCalorieTarget(weight, user.height, user.age, user.gender, user.activity_level);
}

// เป้าแคลอรี่/โปรตีนของผู้ใช้ (null ถ้าข้อมูลยังไม่ครบ)
async function getCalorieTargetForUser(userId) {
  const user = await getUserData(userId);
  const weight = await getLatestWeight(userId);
  if (!user || !user.gender || !user.height || !user.age || weight === null) return null;
  return calorieGuide({ ...user, activity_level: user.activity_level || defaultActivity(user.gender) }, weight);
}

async function buildCalorieMessage(userId) {
  const user = await getUserData(userId);
  const weight = await getLatestWeight(userId);
  const steps = missingProfileSteps(user, weight);
  if (!user.gender || !user.height || !user.age || weight === null) {
    return { type: 'text', text: 'ต้องมีข้อมูลก่อนคำนวณเป้าแคลอรี่นะ ' + steps[0] };
  }
  const g = calorieGuide({ ...user, activity_level: user.activity_level || defaultActivity(user.gender) }, weight);
  let msg = '🍽 เป้าแคลอรี่ต่อวัน\n';
  if (g.maintain) {
    msg += `ตอนนี้ BMI ต่ำกว่าเกณฑ์ ไม่แนะนำให้ลดแคลอรี่ ควรกินให้พอดีกับที่ใช้จริง (~${g.min} kcal/วัน)\n`;
  } else {
    msg += `${g.min}-${g.max} kcal/วัน\n`;
  }
  msg += `โปรตีน ${g.protein.min}-${g.protein.max} กรัม/วัน\n`;
  if (g.adjust) msg += `(รวมที่คุณปรับเอง ${g.adjust > 0 ? '+' : ''}${g.adjust} kcal พิมพ์ "ปรับแคลอรี่ 0" เพื่อยกเลิก)\n`;
  msg += '\n';
  if (g.deadline) {
    const d = g.deadline;
    msg += `🎯 เป้า ${user.target_weight} กก. ภายใน ${d.daysLeft} วัน (ถึง ${user.target_date})\n`;
    msg += `ต้องลดอีก ${d.loss} กก. คิดเป็นขาดดุลเฉลี่ย ~${d.desired} kcal/วัน\n`;
    if (d.limited) {
      msg += `⚠️ เร็วเกินกว่าที่ปลอดภัย บอทจึงจำกัดการขาดดุลไว้ที่ ~${d.used} kcal/วัน`;
      if (d.daysNeeded) msg += ` ซึ่งคาดว่าจะถึงเป้าราววันที่ ${addDays(todayStr(), d.daysNeeded)} (ประมาณ ${Math.ceil(d.daysNeeded / 7)} สัปดาห์) ถ้าอยากถึงตามกำหนดจริง แนะนำขยายเวลาออกไป พิมพ์ เช่น "ภายใน 4 เดือน"`;
      msg += '\n\n';
    } else {
      msg += d.desired < 200 ? 'เวลายังเหลือเยอะ ลดสบายๆ ได้\n\n' : '✅ อยู่ในช่วงที่ปลอดภัย\n\n';
    }
  }
  msg += 'เป็นค่าประมาณเพื่อลดน้ำหนักอย่างค่อยเป็นค่อยไป ไม่ใช่คำแนะนำทางการแพทย์ ถ้ามีโรคประจำตัวหรือตั้งครรภ์ ควรปรึกษาแพทย์/นักโภชนาการ';
  return { type: 'text', text: msg };
}

function defaultActivity(gender) {
  // หญิง = แผนเดิน (น้อย-ปานกลาง), ชาย = แผนเวท+วิ่ง (ตามแผน PDF)
  return gender === 'F' ? 2 : 4;
}

async function startPlan(userId) {
  const user = await getUserData(userId);
  const weight = await getLatestWeight(userId);
  const steps = missingProfileSteps(user, weight);
  if (steps.length > 0) {
    return `ก่อนเริ่มแผน ขอข้อมูลของคุณก่อนนะ (เหลืออีก ${steps.length} ข้อ)\nข้อแรก: ${steps[0]}\n\nตอบทีละข้อได้เลย ทำเสร็จแล้วบอทจะบอกข้อถัดไปให้`;
  }

  const activity = user.activity_level || defaultActivity(user.gender);
  await setUserFields(userId, { program_start_date: todayStr(), activity_level: activity });

  const g = calorieGuide({ ...user, activity_level: activity }, weight);
  const isF = user.gender === 'F';

  let msg = `🚀 เริ่ม${isF ? 'ชาเลนจ์เดิน' : 'แผนเวท/วิ่ง'} 16 สัปดาห์แล้ว! วันนี้คือวันที่ 1\n`;
  msg += g.maintain
    ? 'BMI ต่ำกว่าเกณฑ์ บอทไม่แนะนำให้ลดแคลอรี่ ควรกินให้พอดีกับที่ใช้จริง\n'
    : `เป้าแคลอรี่: ${g.min}-${g.max} kcal/วัน, โปรตีน ${g.protein.min}-${g.protein.max} กรัม/วัน (พิมพ์ "เป้าแคลอรี่" ดูได้ทุกเมื่อ)\nอยากให้คำนวณตามกำหนดเวลา พิมพ์ เช่น "ภายใน 3 เดือน"\n`;
  msg += `\nพิมพ์ "วันนี้" เพื่อดูตารางของวันนี้ได้เลย ทุกเช้าบอทจะแนบตารางของวันนั้นมาพร้อมข้อความแจ้งเตือนด้วย\n\n`;
  msg += isF
    ? 'ถ้าเจ็บ/แน่นหน้าอก เวียนหัวรุนแรงระหว่างเดิน ให้หยุดทันที'
    : 'ก่อนเริ่มเฟสที่หนักขึ้น (โดยเฉพาะสัปดาห์ 9 เป็นต้นไป) แนะนำปรึกษาแพทย์ก่อน หากเจ็บ/แน่นหน้าอก เวียนหัวรุนแรงระหว่างฝึก ให้หยุดทันที';
  return msg;
}

function weekdayKeyFor(date) {
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
  const isF = user.gender === 'F';

  let msg = `📅 วันที่ ${dayNumber} ของ${isF ? 'ชาเลนจ์' : 'แผน'} (สัปดาห์ ${weekNumber}, เฟส ${phase})\n\n`;

  const notes = isF ? PHASE_START_NOTES_F : PHASE_START_NOTES;
  const weekStartDay = (weekNumber - 1) * 7 + 1;
  if (dayNumber === weekStartDay && notes[weekNumber]) {
    msg += notes[weekNumber] + '\n\n';
  }

  if (isF) {
    msg += getWalkDay(weekNumber, weekdayKey);
    // แผนของผู้หญิงเน้นคุมแคลอรี่ เลยแนบเป้าแคลอรี่ประจำวันไว้ด้วย
    const weight = await getLatestWeight(userId);
    if (weight !== null && user.height && user.age) {
      const g = calorieGuide(user, weight);
      if (!g.maintain) msg += `\n\n🍽 เป้าวันนี้: ${g.min}-${g.max} kcal, โปรตีน ${g.protein.min}-${g.protein.max} กรัม`;
    }
  } else if (weekdayKey === 'tue' || weekdayKey === 'thu') {
    msg += '🏃 วิ่ง (Easy run): ' + RUN_PLAN[weekNumber].tuethu;
  } else if (weekdayKey === 'sat') {
    msg += '🏃 วิ่ง (Long run): ' + RUN_PLAN[weekNumber].sat;
  } else {
    msg += '🏋️ ' + getWeightDay(phase, weekNumber, weekdayKey);
  }

  return { type: 'text', text: msg.trim() };
}

module.exports = { startPlan, buildTodayPlanMessage, buildCalorieMessage, onboardingHint, weekdayKeyFor, getCalorieTargetForUser };
