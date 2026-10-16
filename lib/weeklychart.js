const { getUserData } = require('./users');
const { getStepLogs, goalForDate } = require('./steps');
const { getMealsSince } = require('./meals');
const { getCalorieTargetForUser } = require('./healthplan');
const { todayStr, addDays } = require('./calc');
const { createChartImage } = require('./chartimg');

const DAY_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// กราฟสรุป 7 วันล่าสุด: แท่ง = ก้าว, เส้น = แคลอรี่ที่กิน (แกนขวา), เส้นประ = เป้าก้าว (ผู้หญิง) / เพดานแคลอรี่
// ไม่มีข้อมูลก้าวและอาหารเลย -> null
async function buildWeeklyChartMessage(userId) {
  const user = await getUserData(userId);
  if (!user) return null;
  const today = todayStr();
  const since = addDays(today, -6);
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(addDays(since, i));

  const stepMap = {};
  (await getStepLogs(userId)).forEach((r) => { stepMap[r.date] = r.steps; });
  const kcalMap = {};
  (await getMealsSince(userId, since)).forEach((m) => {
    if (m.date > today) return;
    kcalMap[m.date] = (kcalMap[m.date] || 0) + m.kcal;
  });

  const hasSteps = dates.some((d) => stepMap[d] !== undefined);
  const hasKcal = dates.some((d) => kcalMap[d] !== undefined);
  if (!hasSteps && !hasKcal) return null;

  const labels = dates.map((d) => DAY_TH[new Date(d + 'T00:00:00Z').getUTCDay()] + ' ' + d.slice(8, 10));
  const datasets = [];
  const yAxes = [];

  if (hasSteps) {
    datasets.push({
      type: 'bar', label: 'ก้าว', yAxisID: 'y-steps',
      data: dates.map((d) => (stepMap[d] !== undefined ? stepMap[d] : null)),
      backgroundColor: '#06C755'
    });
    const goals = dates.map((d) => goalForDate(user, d));
    if (goals.some((g) => g !== null)) {
      datasets.push({
        type: 'line', label: 'เป้าก้าว', yAxisID: 'y-steps', data: goals,
        borderColor: '#2E7D32', borderDash: [6, 4], borderWidth: 2, fill: false, pointRadius: 0, steppedLine: true
      });
    }
    yAxes.push({ id: 'y-steps', position: 'left', ticks: { beginAtZero: true }, scaleLabel: { display: true, labelString: 'ก้าว' } });
  }

  if (hasKcal) {
    datasets.push({
      type: 'line', label: 'แคลอรี่ที่กิน', yAxisID: 'y-kcal',
      data: dates.map((d) => (kcalMap[d] !== undefined ? Math.round(kcalMap[d]) : null)),
      borderColor: '#FF8A00', backgroundColor: '#FF8A00', borderWidth: 3, fill: false, pointRadius: 4, spanGaps: true
    });
    const target = await getCalorieTargetForUser(userId);
    if (target && !target.maintain && target.max) {
      datasets.push({
        type: 'line', label: 'เพดานแคลอรี่', yAxisID: 'y-kcal', data: dates.map(() => target.max),
        borderColor: '#E53935', borderDash: [4, 4], borderWidth: 2, fill: false, pointRadius: 0
      });
    }
    yAxes.push({
      id: 'y-kcal', position: hasSteps ? 'right' : 'left', ticks: { beginAtZero: true },
      gridLines: { drawOnChartArea: !hasSteps }, scaleLabel: { display: true, labelString: 'kcal' }
    });
  }

  const config = {
    type: 'bar',
    data: { labels, datasets },
    options: {
      title: { display: true, text: 'สรุป 7 วันล่าสุด: ก้าว และ แคลอรี่' },
      legend: { position: 'bottom' },
      scales: { yAxes }
    }
  };
  return createChartImage(config, 700, 420);
}

module.exports = { buildWeeklyChartMessage };
