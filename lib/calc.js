// ฟังก์ชันคำนวณล้วนๆ ไม่แตะฐานข้อมูล/เครือข่าย เพื่อให้เทสได้ง่าย

const TIMEZONE = 'Asia/Bangkok';

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE }); // sv-SE => YYYY-MM-DD
}

function yesterdayStr() {
  return addDays(todayStr(), -1);
}

// บวก/ลบวันบนสตริง YYYY-MM-DD แบบไม่พึ่ง timezone ของเครื่องที่รันโค้ด
// (คำนวณล้วนๆ ด้วย Date.UTC เพื่อกันบั๊กเรื่อง timezone ของ runtime)
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function calcBmi(weight, heightCm) {
  const h = heightCm / 100;
  return Math.round((weight / (h * h)) * 10) / 10;
}

function bmiCategory(bmi) {
  if (bmi < 18.5) return 'น้ำหนักน้อย';
  if (bmi < 23) return 'ปกติ';
  if (bmi < 25) return 'ท้วม';
  if (bmi < 30) return 'อ้วน';
  return 'อ้วนมาก';
}

function computeMovingAverage(logs, windowSize) {
  // logs: [{date, weight}] เรียงเก่า->ใหม่
  const result = [];
  for (let i = 0; i < logs.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = logs.slice(start, i + 1);
    const sum = slice.reduce((acc, r) => acc + Number(r.weight), 0);
    result.push(Math.round((sum / slice.length) * 100) / 100);
  }
  return result;
}

function computeStreak(lastLogDate, today, currentStreak) {
  if (lastLogDate === today) return currentStreak || 1;
  if (lastLogDate === addDays(today, -1)) return (currentStreak || 0) + 1;
  return 1;
}

const ACTIVITY_FACTORS = { 1: 1.2, 2: 1.375, 3: 1.55, 4: 1.725, 5: 1.9 };
const ACTIVITY_LABELS = {
  1: 'น้อยมาก (นั่งทำงาน ไม่ค่อยออกกำลังกาย)',
  2: 'น้อย (ออกกำลังกาย 1-3 วัน/สัปดาห์)',
  3: 'ปานกลาง (ออกกำลังกาย 3-5 วัน/สัปดาห์)',
  4: 'มาก (ออกกำลังกาย 6-7 วัน/สัปดาห์)',
  5: 'มากที่สุด (ออกกำลังกายหนัก หรือใช้แรงงานทุกวัน)'
};

function calcBmrTdee(weight, heightCm, age, gender, activityLevel) {
  const bmr = gender === 'M'
    ? (10 * weight + 6.25 * heightCm - 5 * age + 5)
    : (10 * weight + 6.25 * heightCm - 5 * age - 161);
  const tdee = Math.round(bmr * ACTIVITY_FACTORS[activityLevel]);
  return { bmr: Math.round(bmr), tdee };
}

// เป้าแคลอรี่ลดน้ำหนัก: ต่ำกว่า TDEE 300-500 kcal/วัน แต่ไม่ต่ำกว่าขั้นต่ำที่ปลอดภัย (หญิง 1200 / ชาย 1500)
// ถ้า BMI < 18.5 ไม่แนะนำให้ลด -> ให้กินเท่า TDEE
function calcCalorieTarget(weight, heightCm, age, gender, activityLevel) {
  const { tdee } = calcBmrTdee(weight, heightCm, age, gender, activityLevel);
  const bmi = calcBmi(weight, heightCm);
  const round10 = (n) => Math.round(n / 10) * 10;
  const round5 = (n) => Math.round(n / 5) * 5;
  const protein = { min: round5(1.2 * weight), max: round5(1.6 * weight) };
  if (bmi < 18.5) {
    return { tdee, min: round10(tdee), max: round10(tdee), protein, maintain: true };
  }
  const floor = gender === 'M' ? 1500 : 1200;
  const min = Math.max(round10(tdee - 500), floor);
  const max = Math.max(round10(tdee - 300), min + 100);
  return { tdee, min, max, protein, maintain: false };
}

// เป้าแคลอรี่แบบกำหนดเวลา: คำนวณว่าต้องขาดดุลเฉลี่ยวันละเท่าไหร่ถึงจะถึงน้ำหนักเป้าหมายตามกำหนด
// (ประมาณ 7,700 kcal ต่อไขมัน 1 กก.) แล้วจำกัดไม่ให้เกินขีดปลอดภัย:
//   - ขาดดุลไม่เกิน 1,000 kcal/วัน และไม่เกิน ~1% ของน้ำหนักตัวต่อสัปดาห์ (= 11 x น้ำหนัก kcal/วัน)
//   - แคลอรี่ที่กินไม่ต่ำกว่าขั้นต่ำ (หญิง 1,200 / ชาย 1,500)
function calcDeadlineTarget(weight, heightCm, age, gender, activityLevel, targetWeight, daysLeft) {
  const base = calcCalorieTarget(weight, heightCm, age, gender, activityLevel);
  const loss = Math.round((weight - targetWeight) * 100) / 100;
  if (base.maintain || loss <= 0 || daysLeft <= 0) return base;

  const round10 = (n) => Math.round(n / 10) * 10;
  const floor = gender === 'M' ? 1500 : 1200;
  const desired = Math.round((loss * 7700) / daysLeft);
  const safeMax = Math.max(0, Math.min(1000, Math.round(11 * weight), base.tdee - floor));
  const used = Math.min(desired, safeMax);
  const limited = desired > safeMax;
  const center = base.tdee - used;
  const min = Math.max(round10(center - 100), floor);
  const max = Math.max(round10(center + 100), min + 100);
  const daysNeeded = used > 0 ? Math.ceil((loss * 7700) / used) : null;
  return {
    tdee: base.tdee, min, max, protein: base.protein, maintain: false,
    deadline: { loss, daysLeft, desired, used, limited, daysNeeded }
  };
}

// อ่านกำหนดเวลาจากข้อความ เช่น "ภายใน 3 เดือน" / "ภายใน 12 สัปดาห์" / "ภายใน 90 วัน" -> จำนวนวัน (ไม่เจอ = null)
function parseDeadlineDays(str) {
  const m = String(str).match(/(?:ภายใน|within|deadline|กำหนดเวลา)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(วัน|สัปดาห์|อาทิตย์|เดือน|ปี|days?|weeks?|months?|years?)/i);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  const mult = /^(วัน|day)/.test(unit) ? 1 : (/^(สัปดาห์|อาทิตย์|week)/.test(unit) ? 7 : (/^(ปี|year)/.test(unit) ? 365 : 30));
  return Math.round(parseFloat(m[1]) * mult);
}

function daysBetween(fromStr, toStr) {
  return Math.round((new Date(toStr + 'T00:00:00Z') - new Date(fromStr + 'T00:00:00Z')) / 86400000);
}

const ENCOURAGE_LOSS = [
  'เก่งมาก น้ำหนักลดลงแล้ว 👏',
  'สุดยอด ทำได้ดีมาก ไปต่อ! 💪',
  'เยี่ยมเลย ความพยายามเริ่มเห็นผลแล้ว 🌟',
  'ดีใจด้วยนะ ลดลงอีกแล้ว!',
  'เก่งสุดๆ อย่าเพิ่งหยุดนะ'
];

const ENCOURAGE_STREAK = [
  'ต่อเนื่องขนาดนี้ วินัยสุดๆ 🔥',
  'ทำได้ต่อเนื่องแบบนี้ เป้าหมายอยู่ไม่ไกลแล้ว!',
  'สม่ำเสมอแบบนี้แหละ ที่ทำให้สำเร็จ 🙌',
  'ยอดเยี่ยม ทำต่อเนื่องได้ดีมาก!'
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  TIMEZONE, todayStr, yesterdayStr, addDays, calcBmi, bmiCategory, computeMovingAverage,
  computeStreak, calcBmrTdee, calcCalorieTarget, calcDeadlineTarget, parseDeadlineDays, daysBetween, ACTIVITY_LABELS, ENCOURAGE_LOSS, ENCOURAGE_STREAK, randomFrom
};
