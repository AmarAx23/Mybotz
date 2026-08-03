const { getSupabase } = require('./supabase');
const { getUserData, setUserFields } = require('./users');
const {
  todayStr, yesterdayStr, calcBmi, bmiCategory, computeMovingAverage,
  computeStreak, calcBmrTdee, ACTIVITY_LABELS, ENCOURAGE_LOSS, ENCOURAGE_STREAK, randomFrom
} = require('./calc');

async function getUserLogs(userId, limit) {
  const supabase = getSupabase();
  let query = supabase.from('logs').select('log_date, weight').eq('user_id', userId).order('log_date', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  let rows = (data || []).map((r) => ({ date: r.log_date, weight: Number(r.weight) }));
  if (limit) rows = rows.slice(Math.max(0, rows.length - limit));
  return rows;
}

async function logWeight(userId, weight) {
  const supabase = getSupabase();
  const today = todayStr();

  // หาน้ำหนักครั้งก่อน (วันที่ไม่ใช่วันนี้) ก่อนจะ upsert ทับ
  const allLogs = await getUserLogs(userId);
  const prevEntry = [...allLogs].reverse().find((r) => r.date !== today);
  const prevWeight = prevEntry ? prevEntry.weight : null;

  await supabase.from('logs').upsert(
    { user_id: userId, log_date: today, weight },
    { onConflict: 'user_id,log_date' }
  );

  const user = await getUserData(userId);
  const updates = {};
  if (!user.start_weight) {
    updates.start_weight = weight;
    updates.start_date = today;
  }
  const newStreak = computeStreak(user.last_log_date, today, user.streak);
  updates.streak = newStreak;
  updates.last_log_date = today;
  await setUserFields(userId, updates);

  const updatedUser = await getUserData(userId);

  let msg = `✅ บันทึกน้ำหนักวันนี้: ${weight} กก.\n`;

  if (prevWeight !== null) {
    const diff = Math.round((weight - prevWeight) * 100) / 100;
    if (diff > 0) msg += `เปลี่ยนแปลงจากครั้งก่อน: ⬆️ +${diff} กก.\n`;
    else if (diff < 0) msg += `เปลี่ยนแปลงจากครั้งก่อน: ⬇️ ${diff} กก.\n`;
    else msg += 'เท่าเดิมกับครั้งก่อนเลย\n';
  }

  const recentLogs = await getUserLogs(userId, 7);
  if (recentLogs.length > 0) {
    const avg = Math.round((recentLogs.reduce((a, r) => a + r.weight, 0) / recentLogs.length) * 100) / 100;
    msg += `เฉลี่ย 7 วันล่าสุด: ${avg} กก.\n`;
  }

  msg += `🔥 ทำต่อเนื่อง ${newStreak} วันแล้ว\n`;

  if (updatedUser.height) {
    const bmi = calcBmi(weight, updatedUser.height);
    msg += `BMI: ${bmi} (${bmiCategory(bmi)})\n`;
  }

  if (updatedUser.target_weight) {
    const toGo = Math.round((weight - updatedUser.target_weight) * 100) / 100;
    if (toGo > 0) msg += `เหลืออีก ${toGo} กก. ถึงเป้าหมาย (${updatedUser.target_weight} กก.) สู้ๆ 💪`;
    else if (toGo < 0) msg += `ถึงเป้าหมายแล้ว และเลยไปอีก ${Math.abs(toGo)} กก. เยี่ยมมาก 🎉`;
    else msg += 'ถึงเป้าหมายพอดีเลย! 🎉';
  } else {
    msg += 'พิมพ์ "เป้าหมาย <ตัวเลข>" เพื่อตั้งเป้าหมายน้ำหนักได้นะ';
  }

  const extra = [];
  if (prevWeight !== null && weight < prevWeight) extra.push(randomFrom(ENCOURAGE_LOSS));
  if (newStreak > 0 && newStreak % 7 === 0) extra.push(randomFrom(ENCOURAGE_STREAK));
  if (extra.length > 0) msg += '\n\n' + extra.join('\n');

  return msg;
}

async function getUserWaistLogs(userId, limit) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('measurements')
    .select('log_date, waist')
    .eq('user_id', userId)
    .order('log_date', { ascending: true });
  if (error) throw error;
  let rows = (data || []).map((r) => ({ date: r.log_date, waist: Number(r.waist) }));
  if (limit) rows = rows.slice(Math.max(0, rows.length - limit));
  return rows;
}

async function logWaist(userId, waist) {
  const supabase = getSupabase();
  const today = todayStr();

  const allLogs = await getUserWaistLogs(userId);
  const prevEntry = [...allLogs].reverse().find((r) => r.date !== today);
  const prevWaist = prevEntry ? prevEntry.waist : null;

  await supabase.from('measurements').upsert(
    { user_id: userId, log_date: today, waist },
    { onConflict: 'user_id,log_date' }
  );

  let msg = `✅ บันทึกรอบเอววันนี้: ${waist} ซม.\n`;
  if (prevWaist !== null) {
    const diff = Math.round((waist - prevWaist) * 100) / 100;
    if (diff > 0) msg += `เปลี่ยนแปลงจากครั้งก่อน: ⬆️ +${diff} ซม.`;
    else if (diff < 0) msg += `เปลี่ยนแปลงจากครั้งก่อน: ⬇️ ${diff} ซม.`;
    else msg += 'เท่าเดิมกับครั้งก่อนเลย';
  }
  return msg;
}

async function buildSummaryMessage(userId) {
  const logs = await getUserLogs(userId, 30);
  const user = await getUserData(userId);

  if (logs.length === 0) {
    return { type: 'text', text: 'ยังไม่มีข้อมูลน้ำหนักเลย ลองพิมพ์ตัวเลขน้ำหนักมาบันทึกดูก่อนนะ' };
  }

  const latest = logs[logs.length - 1];
  let msg = '📊 สรุปความคืบหน้า\n';
  msg += `น้ำหนักล่าสุด: ${latest.weight} กก. (${latest.date})\n`;

  const last7 = logs.slice(Math.max(0, logs.length - 7));
  const avg7 = Math.round((last7.reduce((a, r) => a + r.weight, 0) / last7.length) * 100) / 100;
  msg += `เฉลี่ย 7 วันล่าสุด: ${avg7} กก.\n`;

  if (user.start_weight) {
    const totalChange = Math.round((latest.weight - user.start_weight) * 100) / 100;
    msg += `เปลี่ยนแปลงตั้งแต่เริ่มบันทึก (${user.start_date}): ${totalChange <= 0 ? totalChange : '+' + totalChange} กก.\n`;
  }

  if (logs.length >= 2) {
    const weekAgoLog = logs.length >= 7 ? logs[logs.length - 7] : logs[0];
    const weekChange = Math.round((latest.weight - weekAgoLog.weight) * 100) / 100;
    msg += `เปลี่ยนแปลงช่วง ~7 วันล่าสุด: ${weekChange <= 0 ? weekChange : '+' + weekChange} กก.\n`;
  }

  msg += `🔥 ทำต่อเนื่อง ${user.streak || 0} วัน\n`;

  if (user.height) {
    const bmi = calcBmi(latest.weight, user.height);
    msg += `BMI: ${bmi} (${bmiCategory(bmi)})\n`;
  }

  const waistLogs = await getUserWaistLogs(userId, 1);
  if (waistLogs.length > 0) {
    msg += `รอบเอวล่าสุด: ${waistLogs[0].waist} ซม. (${waistLogs[0].date})\n`;
  }

  if (user.target_weight) {
    const toGo = Math.round((latest.weight - user.target_weight) * 100) / 100;
    msg += `ห่างจากเป้าหมาย (${user.target_weight} กก.): ${toGo > 0 ? toGo : Math.abs(toGo)}${toGo > 0 ? ' กก.' : ' กก. (เกินเป้าหมายแล้ว)'}`;
  } else {
    msg += 'ยังไม่ได้ตั้งเป้าหมาย พิมพ์ "เป้าหมาย <ตัวเลข>" เพื่อตั้งได้เลย';
  }

  return { type: 'text', text: msg };
}

async function buildTdeeMessage(userId) {
  const user = await getUserData(userId);
  const logs = await getUserLogs(userId, 1);
  const missing = [];
  if (logs.length === 0) missing.push('น้ำหนัก (พิมพ์ตัวเลขน้ำหนักมาก่อน)');
  if (!user.height) missing.push('ส่วนสูง (พิมพ์ "ส่วนสูง <ซม.>")');
  if (!user.age) missing.push('อายุ (พิมพ์ "อายุ <ปี>")');
  if (!user.gender) missing.push('เพศ (พิมพ์ "เพศ ชาย" หรือ "เพศ หญิง")');
  if (!user.activity_level) missing.push('ระดับกิจกรรม (พิมพ์ "กิจกรรม <1-5>")');

  if (missing.length > 0) {
    return { type: 'text', text: 'ก่อนคำนวณ ต้องมีข้อมูลให้ครบก่อนนะ ยังขาด:\n- ' + missing.join('\n- ') };
  }

  const weight = logs[0].weight;
  const { bmr, tdee } = calcBmrTdee(weight, user.height, user.age, user.gender, user.activity_level);
  const bmi = calcBmi(weight, user.height);

  let msg = '🔥 ผลการคำนวณ\n';
  msg += `BMI: ${bmi} (${bmiCategory(bmi)})\n`;
  msg += `BMR (แคลอรี่พื้นฐาน): ${bmr} kcal/วัน\n`;
  msg += `TDEE (แคลอรี่ที่ใช้จริงต่อวัน): ${tdee} kcal/วัน\n`;
  msg += `ระดับกิจกรรม: ${ACTIVITY_LABELS[user.activity_level]}\n\n`;
  msg += 'ถ้าอยากลดน้ำหนัก ลองกินให้น้อยกว่า TDEE ประมาณ 300-500 kcal/วัน';

  return { type: 'text', text: msg };
}

async function buildGraphMessage(userId) {
  const logs = await getUserLogs(userId, 30);
  if (logs.length < 2) return null;

  const user = await getUserData(userId);
  const labels = logs.map((r) => r.date.slice(5));
  const weights = logs.map((r) => r.weight);
  const movingAvg = computeMovingAverage(logs, 7);

  const datasets = [
    { label: 'น้ำหนัก', data: weights, borderColor: '#06C755', fill: false, tension: 0.2 },
    { label: 'เฉลี่ย 7 วัน', data: movingAvg, borderColor: '#3399FF', borderDash: [4, 3], fill: false, tension: 0.2, pointRadius: 0 }
  ];

  if (user.target_weight) {
    datasets.push({
      label: 'เป้าหมาย',
      data: weights.map(() => user.target_weight),
      borderColor: '#FF6B6B', borderDash: [6, 4], fill: false, pointRadius: 0
    });
  }

  const chartConfig = {
    type: 'line',
    data: { labels, datasets },
    options: { title: { display: true, text: 'กราฟน้ำหนัก' } }
  };

  const url = 'https://quickchart.io/chart?width=600&height=400&c=' + encodeURIComponent(JSON.stringify(chartConfig));
  return { type: 'image', originalContentUrl: url, previewImageUrl: url };
}

module.exports = {
  getUserLogs, logWeight, getUserWaistLogs, logWaist,
  buildSummaryMessage, buildTdeeMessage, buildGraphMessage
};
