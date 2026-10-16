const { getUserData } = require('./users');
const { getUserLogs } = require('./weight');
const { todayStr } = require('./calc');
const { createChartImage } = require('./chartimg');

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

// รูปกราฟน้ำหนักของเดือนที่แล้ว (เส้นน้ำหนักรายวัน + เส้นเป้าหมาย) ไม่มีข้อมูลเดือนนั้น -> null
async function buildMonthlySummaryImage(userId) {
  const range = previousMonthRange(todayStr());
  const allLogs = await getUserLogs(userId);
  const monthLogs = allLogs.filter((r) => r.date >= range.first && r.date <= range.last);
  if (monthLogs.length === 0) return null;

  const user = await getUserData(userId);
  const labels = monthLogs.map((r) => r.date.slice(8, 10));
  const weights = monthLogs.map((r) => r.weight);
  const datasets = [
    { label: 'น้ำหนัก (กก.)', data: weights, borderColor: '#06C755', backgroundColor: '#06C755', fill: false, lineTension: 0.2, borderWidth: 3 }
  ];
  if (user && user.target_weight) {
    datasets.push({
      label: 'เป้าหมาย', data: weights.map(() => Number(user.target_weight)),
      borderColor: '#E53935', borderDash: [6, 4], fill: false, pointRadius: 0, borderWidth: 2
    });
  }
  const config = {
    type: 'line',
    data: { labels, datasets },
    options: {
      title: { display: true, text: `น้ำหนักเดือน ${range.month}/${range.year} (บันทึก ${monthLogs.length}/${range.daysInMonth} วัน)` },
      legend: { position: 'bottom' }
    }
  };
  return createChartImage(config, 700, 420);
}

module.exports = { buildMonthlySummaryMessage, buildMonthlySummaryImage, previousMonthRange, lastDayOfMonth };
