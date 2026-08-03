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
  computeStreak, calcBmrTdee, ACTIVITY_LABELS, ENCOURAGE_LOSS, ENCOURAGE_STREAK, randomFrom
};
