const { getSupabase } = require('./supabase');
const { getUserData } = require('./users');
const { todayStr, addDays } = require('./calc');
const { stepsFor } = require('./plan-female');
const { weekdayKeyFor } = require('./healthplan');
const { isPausedOn } = require('./pause');
const { computeRewards, rewardLines, effectiveGoal, buildWeeklyRecapText, buildMorningLines } = require('./rewards');
const { getWallet, walletLine, titleFor, REWARD } = require('./redeem');

const fmt = (n) => Number(n).toLocaleString('en-US');

async function getStepLogs(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('steps').select('log_date, steps').eq('user_id', userId).order('log_date', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({ date: r.log_date, steps: Number(r.steps) }));
}

// เป้าก้าวของวันที่กำหนด (มีเฉพาะผู้ใช้หญิงที่เริ่มชาเลนจ์แล้ว และยังอยู่ใน 16 สัปดาห์) ไม่มี -> null
function goalForDate(user, dateStr) {
  if (!user || user.gender !== 'F' || !user.program_start_date) return null;
  const start = new Date(user.program_start_date + 'T00:00:00Z');
  const day = new Date(dateStr + 'T00:00:00Z');
  const dayNumber = Math.round((day - start) / 86400000) + 1;
  if (dayNumber < 1 || dayNumber > 112) return null;
  const weekNumber = Math.ceil(dayNumber / 7);
  return stepsFor(weekNumber, weekdayKeyFor(day));
}

// จำนวนวันติดต่อกันที่ผ่านชาเลนจ์ (ถ้าวันนี้ยังไม่ผ่าน ให้นับถึงเมื่อวานก่อน)
function challengeStreak(user, logs, today) {
  const byDate = {};
  logs.forEach((r) => { byDate[r.date] = r.steps; });
  let count = 0;
  let d = today;
  for (let i = 0; i < 200; i++) {
    const goal = goalForDate(user, d);
    if (goal === null) break;
    if (isPausedOn(user, d) && byDate[d] === undefined) { d = addDays(d, -1); continue; } // วันพัก: ไม่นับและไม่ทำให้ขาด
    if (byDate[d] !== undefined && byDate[d] >= goal) {
      count++;
    } else if (d !== today) {
      break;
    }
    d = addDays(d, -1);
  }
  return count;
}

async function logSteps(userId, steps) {
  const supabase = getSupabase();
  const today = todayStr();
  const user = await getUserData(userId);
  const logsBefore = await getStepLogs(userId);

  const { error } = await supabase.from('steps').upsert(
    { user_id: userId, log_date: today, steps },
    { onConflict: 'user_id,log_date' }
  );
  if (error) throw error;

  const logsAfter = logsBefore.filter((r) => r.date !== today).concat([{ date: today, steps }]);
  const before = computeRewards(user, logsBefore, today, goalForDate);
  const after = computeRewards(user, logsAfter, today, goalForDate);

  const challengeGoal = goalForDate(user, today);
  const goal = effectiveGoal(user, today, goalForDate);
  const label = challengeGoal !== null ? 'ชาเลนจ์' : 'เป้า';

  let msg = `👟 บันทึกก้าววันนี้: ${fmt(steps)} ก้าว\n`;
  if (steps >= goal) msg += `🎉 ผ่าน${label}วันนี้แล้ว! (เป้า ${fmt(goal)} ก้าว)\n`;
  else msg += `เหลืออีก ${fmt(goal - steps)} ก้าว ถึงเป้าวันนี้ (${fmt(goal)}) สู้ๆ 💪\n`;
  if (after.stats.streak > 0) msg += `🔥 ผ่านเป้าติดต่อกัน ${after.stats.streak} วัน\n`;
  msg += '\n' + rewardLines(before, after, today);
  msg += walletLine(before.points, after.points, await getWallet(userId, after.points));
  msg += '\n(ส่งใหม่ในวันเดียวกัน = แก้ไขค่าเดิม | พิมพ์ "แต้ม" "เหรียญ" ดูรายละเอียด)';
  return msg;
}

async function buildStepsStatusMessage(userId) {
  const user = await getUserData(userId);
  const today = todayStr();
  const logs = await getStepLogs(userId);
  const todayLog = logs.find((r) => r.date === today);
  const goal = effectiveGoal(user, today, goalForDate);
  let msg = '👟 ก้าววันนี้: ' + (todayLog ? `${fmt(todayLog.steps)} ก้าว` : 'ยังไม่ได้บันทึก') + '\n';
  msg += `เป้าวันนี้: ${fmt(goal)} ก้าว\n`;
  const r = computeRewards(user, logs, today, goalForDate);
  msg += `🪙 ${fmt(r.points)} แต้ม | ${r.level.name} (Lv.${r.level.level})\n`;
  msg += '\nบันทึกได้ 2 วิธี: พิมพ์ เช่น "เดิน 7500" หรือส่งรูปแคปหน้าจอจากแอปนับก้าวมาได้เลย';
  return { type: 'text', text: msg };
}

// สรุปแต้ม/เหรียญ 7 วันล่าสุด (null = สัปดาห์นี้ไม่มีอะไรให้สรุป)
async function buildWeeklyRewardsRecap(userId) {
  const user = await getUserData(userId);
  const today = todayStr();
  const logs = await getStepLogs(userId);
  const r = computeRewards(user, logs, today, goalForDate);
  const lastWeek = computeRewards(user, logs, addDays(today, -7), goalForDate);
  const wallet = await getWallet(userId, r.points);
  return buildWeeklyRecapText(r, lastWeek, today, wallet, wallet ? titleFor(wallet.count) : '', REWARD);
}

// บรรทัดให้กำลังใจตอนเช้าจากผลเมื่อวาน (array ไม่เกิน 2 บรรทัด)
async function buildMorningStepLines(user) {
  const today = todayStr();
  const logs = await getStepLogs(user.user_id);
  if (logs.length === 0) return [];
  const r = computeRewards(user, logs, today, goalForDate);
  const wallet = await getWallet(user.user_id, r.points);
  return buildMorningLines(user, logs, today, goalForDate, wallet, REWARD);
}

async function buildRewardsForUser(userId) {
  const user = await getUserData(userId);
  return computeRewards(user, await getStepLogs(userId), todayStr(), goalForDate);
}

module.exports = { logSteps, getStepLogs, goalForDate, challengeStreak, buildStepsStatusMessage, buildRewardsForUser, buildWeeklyRewardsRecap, buildMorningStepLines };
