const { getSupabase } = require('./supabase');
const { getUserData } = require('./users');
const { todayStr, addDays } = require('./calc');
const { stepsFor } = require('./plan-female');
const { weekdayKeyFor } = require('./healthplan');

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
  const { error } = await supabase.from('steps').upsert(
    { user_id: userId, log_date: today, steps },
    { onConflict: 'user_id,log_date' }
  );
  if (error) throw error;

  const user = await getUserData(userId);
  const goal = goalForDate(user, today);

  let msg = `👟 บันทึกก้าววันนี้: ${fmt(steps)} ก้าว\n`;
  if (goal !== null) {
    if (steps >= goal) msg += `🎉 ผ่านชาเลนจ์วันนี้แล้ว! (เป้า ${fmt(goal)} ก้าว)\n`;
    else msg += `เหลืออีก ${fmt(goal - steps)} ก้าว ถึงเป้าวันนี้ (${fmt(goal)}) สู้ๆ 💪\n`;
    const streak = challengeStreak(user, await getStepLogs(userId), today);
    if (streak > 0) msg += `🔥 ผ่านชาเลนจ์ติดต่อกัน ${streak} วัน\n`;
  }
  msg += '(ส่งใหม่ในวันเดียวกัน = แก้ไขค่าเดิม)';
  return msg;
}

async function buildStepsStatusMessage(userId) {
  const user = await getUserData(userId);
  const today = todayStr();
  const logs = await getStepLogs(userId);
  const todayLog = logs.find((r) => r.date === today);
  const goal = goalForDate(user, today);
  let msg = '👟 ก้าววันนี้: ' + (todayLog ? `${fmt(todayLog.steps)} ก้าว` : 'ยังไม่ได้บันทึก') + '\n';
  if (goal !== null) msg += `เป้าวันนี้: ${fmt(goal)} ก้าว\n`;
  msg += '\nบันทึกได้ 2 วิธี: พิมพ์ เช่น "เดิน 7500" หรือส่งรูปแคปหน้าจอจากแอปนับก้าวมาได้เลย';
  return { type: 'text', text: msg };
}

module.exports = { logSteps, getStepLogs, goalForDate, challengeStreak, buildStepsStatusMessage };
