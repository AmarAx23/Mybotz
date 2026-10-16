// สรุปข้อมูลของผู้ใช้คนเดียว (ไม่ปนกับคนอื่น) ให้ AI ใช้ตอบ ส่งเฉพาะที่จำเป็น ไม่ส่งไอดี LINE หรือรูป
const { getUserData } = require('./users');
const { getUserLogs } = require('./weight');
const { getStepLogs, goalForDate } = require('./steps');
const { getMealsSince, getMealsForDate } = require('./meals');
const { getCalorieTargetForUser } = require('./healthplan');
const { isPausedOn } = require('./pause');
const { todayStr, addDays } = require('./calc');

const DAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const fmt = (n) => Number(n).toLocaleString('en-US');

// ข้อความสรุปข้อมูล 7-14 วันล่าสุด
async function buildUserContext(userId) {
  const user = await getUserData(userId);
  if (!user) return 'ไม่มีข้อมูลผู้ใช้';
  const today = todayStr();
  const since = addDays(today, -6);
  const lines = [];
  const dow = DAY_TH[new Date(today + 'T00:00:00Z').getUTCDay()];
  lines.push(`วันนี้: ${today} (วัน${dow})`);

  const logs = await getUserLogs(userId, 14);
  const latest = logs.length ? logs[logs.length - 1] : null;
  const prof = [];
  if (user.gender) prof.push(user.gender === 'M' ? 'ชาย' : 'หญิง');
  if (user.age) prof.push(`อายุ ${user.age}`);
  if (user.height) prof.push(`สูง ${user.height} ซม.`);
  if (latest) prof.push(`น้ำหนักล่าสุด ${latest.weight} กก. (${latest.date})`);
  if (user.target_weight) prof.push(`เป้า ${user.target_weight} กก.`);
  if (user.target_date) prof.push(`ภายใน ${user.target_date}`);
  lines.push('โปรไฟล์: ' + (prof.length ? prof.join(', ') : 'ยังไม่ครบ'));
  if (user.gender === 'F' && user.program_start_date) lines.push('แผน: ชาเลนจ์เดิน (มีเป้าก้าวรายวัน)');
  if (user.gender === 'M' && user.program_start_date) lines.push('แผน: เวทดัมเบล/วิ่ง 4 เดือน');
  if (isPausedOn(user, today)) lines.push(`อยู่ในโหมดพักถึง ${user.pause_until}`);

  const target = await getCalorieTargetForUser(userId);
  if (target) {
    lines.push(`เป้าต่อวัน: ${target.maintain ? '~' + fmt(target.min) : fmt(target.min) + '-' + fmt(target.max)} kcal, โปรตีน ${target.protein.min}-${target.protein.max} ก.`);
  }
  if (logs.length) lines.push('น้ำหนัก: ' + logs.map((r) => `${r.date.slice(5)}=${r.weight}`).join(', '));

  const stepMap = {};
  (await getStepLogs(userId)).filter((r) => r.date >= since).forEach((r) => { stepMap[r.date] = r.steps; });
  const stepLine = Object.keys(stepMap).sort().map((d) => {
    const g = goalForDate(user, d);
    return `${d.slice(5)}=${fmt(stepMap[d])}${g ? '/เป้า' + fmt(g) : ''}`;
  });
  if (stepLine.length) lines.push('ก้าว: ' + stepLine.join(', '));

  const byDate = {};
  (await getMealsSince(userId, since)).forEach((m) => {
    if (m.date > today) return;
    byDate[m.date] = byDate[m.date] || { kcal: 0, protein: 0 };
    byDate[m.date].kcal += m.kcal;
    byDate[m.date].protein += m.protein;
  });
  const mealLine = Object.keys(byDate).sort().map((d) => `${d.slice(5)}=${fmt(byDate[d].kcal)}kcal/P${Math.round(byDate[d].protein)}`);
  if (mealLine.length) lines.push('อาหารที่บันทึก (เฉพาะวันที่บันทึก): ' + mealLine.join(', '));

  const t = byDate[today] || { kcal: 0, protein: 0 };
  lines.push(`วันนี้กินไปแล้ว: ${fmt(t.kcal)} kcal, โปรตีน ${Math.round(t.protein)} ก.`);
  if (target && !target.maintain) lines.push(`เหลือถึงเพดานแคลอรี่วันนี้: ${fmt(Math.max(0, target.max - t.kcal))} kcal`);
  return lines.join('\n');
}

// เฉพาะแคลอรี่/โปรตีนที่เหลือวันนี้ (ใช้กับรูปเมนู/ฉลาก ประหยัดกว่าแบบเต็ม)
async function buildRemainingContext(userId) {
  const today = todayStr();
  const target = await getCalorieTargetForUser(userId);
  if (!target) return '';
  const meals = await getMealsForDate(userId, today);
  const t = meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein }), { kcal: 0, protein: 0 });
  const remK = target.maintain ? target.min - t.kcal : target.max - t.kcal;
  return `เป้าวันนี้ ${target.maintain ? '~' + target.min : target.min + '-' + target.max} kcal, โปรตีน ${target.protein.min}-${target.protein.max} ก.; ` +
    `กินไปแล้ว ${Math.round(t.kcal)} kcal, โปรตีน ${Math.round(t.protein)} ก.; เหลือ ~${Math.max(0, Math.round(remK))} kcal`;
}

module.exports = { buildUserContext, buildRemainingContext };
