const { getUserData } = require('./users');
const { getUserLogs } = require('./weight');
const { todayStr } = require('./calc');

function lastDayOfMonth(year, month) {
  // month: 1-12. Date.UTC(year, month, 0) = วันสุดท้ายของ "month" (เพราะ month ในนี้นับจาก 0)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonthRange(todayDateStr) {
  const [y, m] = todayDateStr.split('-').map(Number);
  let py = y;
  let pm = m - 1;
  if (pm === 0) { pm = 12; py = y - 1; }
  const daysInMonth = lastDayOfMonth(py, pm);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    first: `${py}-${pad(pm)}-01`,
    last: `${py}-${pad(pm)}-${pad(daysInMonth)}`,
    year: py,
    month: pm,
    daysInMonth
  };
}

async function buildMonthlySummaryMessage(userId) {
  const today = todayStr();
  const range = previousMonthRange(today);
  const allLogs = await getUserLogs(userId);
  const monthLogs = allLogs.filter((r) => r.date >= range.first && r.date <= range.last);

  if (monthLogs.length === 0) return null;

  const user = await getUserData(userId);
  const startW = monthLogs[0].weight;
  const endW = monthLogs[monthLogs.length - 1].weight;
  const change = Math.round((endW - startW) * 100) / 100;
  const avg = Math.round((monthLogs.reduce((a, r) => a + r.weight, 0) / monthLogs.length) * 100) / 100;
  const minW = Math.min(...monthLogs.map((r) => r.weight));
  const maxW = Math.max(...monthLogs.map((r) => r.weight));
  const adherence = Math.round((monthLogs.length / range.daysInMonth) * 100);

  let msg = `🗓 สรุปประจำเดือน ${range.month}/${range.year}\n\n`;
  msg += `น้ำหนักต้นเดือน: ${startW} กก. → ปลายเดือน: ${endW} กก. (${change <= 0 ? change : '+' + change} กก.)\n`;
  msg += `เฉลี่ยทั้งเดือน: ${avg} กก. (ต่ำสุด ${minW} / สูงสุด ${maxW})\n`;
  msg += `บันทึกครบ ${monthLogs.length}/${range.daysInMonth} วัน (${adherence}%)\n`;
  if (user && user.target_weight) {
    const toGo = Math.round((endW - user.target_weight) * 100) / 100;
    msg += `ห่างจากเป้าหมาย (${user.target_weight} กก.): ${toGo > 0 ? toGo : Math.abs(toGo)} กก.`;
  }

  return { type: 'text', text: msg };
}

module.exports = { buildMonthlySummaryMessage, previousMonthRange, lastDayOfMonth };
