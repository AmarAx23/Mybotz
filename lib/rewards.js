// ระบบแต้ม ระดับ และเหรียญตรา จากการเดิน
// ทุกอย่างคำนวณใหม่จากตาราง steps ทุกครั้ง (ไม่มีตารางเก็บแต้ม) ส่งก้าวซ้ำ/แก้ตัวเลขในวันเดียวกัน แต้มก็ถูกต้องเอง
// เหรียญ "ใหม่" = เหรียญที่มีหลังบันทึก แต่ไม่มีก่อนบันทึก (ฉลองครั้งเดียว ไม่ต้องเก็บในฐานข้อมูล)
const { addDays } = require('./calc');
const { isPausedOn } = require('./pause');

const fmt = (n) => Number(n).toLocaleString('en-US');
const DEFAULT_STEP_GOAL = 6000;
const STEPS_PER_KM = 1400;

// ---------- กติกาแต้ม (แก้ตัวเลขตรงนี้ได้) ----------
const PTS = {
  log: 2, // บันทึกก้าว (อย่างน้อย LOG_MIN ก้าว)
  pass: 10, // ผ่านเป้าวันนี้
  overPer1000: 1, // เกินเป้า ทุก 1,000 ก้าว
  overMax: 5, // เพดานแต้มเกินเป้าต่อวัน
  comeback: 5, // กลับมาผ่านเป้าหลังหายไปอย่างน้อย COMEBACK_GAP วัน
  week5: 25 // ผ่านเป้าอย่างน้อย 5 วันใน 1 สัปดาห์ (จ.-อา.)
};
const LOG_MIN = 1000;
const COMEBACK_GAP = 2;
const STREAK_BONUS = { 3: 10, 7: 30, 14: 60, 30: 150 }; // หลัง 30 วัน ได้ +150 ทุกๆ 30 วัน

// ---------- ระดับ ----------
const LEVEL_POINTS = [0, 100, 300, 700, 1500, 3000];
const LEVEL_NAMES_F = ['🎀 สาวน้อยหัดเดิน', '👟 คุณหนูสายเดิน', '💅 สาวสวยสายฟิต', '👸 เจ้าหญิงก้าวไว', '👑 ราชินีนักเดิน', '🧚 เทพธิดาหมื่นก้าว'];
const LEVEL_NAMES = ['🌱 มือใหม่หัดเดิน', '🚶 นักเดินฝึกหัด', '👟 นักเดินตัวจริง', '🏃 สายเดิน', '⚡ ยอดนักเดิน', '👑 ตำนานแห่งก้าว'];

// ---------- เหรียญตรา ----------
// need(s) = จริงเมื่อได้เหรียญ, hint(s) = ข้อความบอกว่าเหลืออีกเท่าไหร่ (แสดงตอนยังล็อก)
const BADGES = [
  { id: 'first_log', icon: '👣', name: 'ก้าวแรก', desc: 'บันทึกก้าวครั้งแรก', need: (s) => s.logDays >= 1 },
  { id: 'first_pass', icon: '🎯', name: 'เข้าเป้า', desc: 'ผ่านเป้าครั้งแรก', need: (s) => s.passDays >= 1 },
  { id: 'streak3', icon: '🔥', name: 'จุดไฟ', desc: 'ผ่านเป้า 3 วันติด', need: (s) => s.maxStreak >= 3, hint: (s) => `ตอนนี้ติดกัน ${s.streak} วัน` },
  { id: 'streak7', icon: '🛡️', name: 'สัปดาห์เหล็ก', desc: 'ผ่านเป้า 7 วันติด', need: (s) => s.maxStreak >= 7, hint: (s) => `ตอนนี้ติดกัน ${s.streak} วัน` },
  { id: 'streak14', icon: '💎', name: 'สองสัปดาห์ไม่หยุด', desc: 'ผ่านเป้า 14 วันติด', need: (s) => s.maxStreak >= 14, hint: (s) => `ตอนนี้ติดกัน ${s.streak} วัน` },
  { id: 'streak30', icon: '🏆', name: 'เดือนแห่งวินัย', desc: 'ผ่านเป้า 30 วันติด', need: (s) => s.maxStreak >= 30, hint: (s) => `ตอนนี้ติดกัน ${s.streak} วัน` },
  { id: 'perfect_week', icon: '🌟', name: 'สัปดาห์สมบูรณ์', desc: 'ผ่านเป้าครบ 7 วันใน 1 สัปดาห์ (จ.-อา.)', need: (s) => s.perfectWeek },
  { id: 'weekend', icon: '🎉', name: 'สุดสัปดาห์ไม่ขี้เกียจ', desc: 'ผ่านเป้าทั้งเสาร์และอาทิตย์', need: (s) => s.weekend },
  { id: 'total50k', icon: '🏙️', name: '50,000 ก้าว', desc: 'ก้าวสะสม ≈ 35 กม.', need: (s) => s.total >= 50000, hint: (s) => `อีก ${fmt(50000 - s.total)} ก้าว` },
  { id: 'total100k', icon: '🏖️', name: '100,000 ก้าว', desc: 'ก้าวสะสม ≈ 70 กม.', need: (s) => s.total >= 100000, hint: (s) => `อีก ${fmt(100000 - s.total)} ก้าว` },
  { id: 'total250k', icon: '🌊', name: '250,000 ก้าว', desc: '≈ 180 กม. กรุงเทพ–หัวหิน', need: (s) => s.total >= 250000, hint: (s) => `อีก ${fmt(250000 - s.total)} ก้าว` },
  { id: 'total500k', icon: '⛰️', name: '500,000 ก้าว', desc: '≈ 360 กม. กรุงเทพ–โคราช ไปกลับ', need: (s) => s.total >= 500000, hint: (s) => `อีก ${fmt(500000 - s.total)} ก้าว` },
  { id: 'total1m', icon: '🗻', name: 'ล้านก้าว', desc: '≈ 700 กม. กรุงเทพ–เชียงใหม่', need: (s) => s.total >= 1000000, hint: (s) => `อีก ${fmt(1000000 - s.total)} ก้าว` },
  { id: 'day10k', icon: '💪', name: 'หมื่นก้าว', desc: 'เดินครบ 10,000 ก้าวในวันเดียว', need: (s) => s.maxDay >= 10000, hint: (s) => `สถิติสูงสุด ${fmt(s.maxDay)} ก้าว` },
  { id: 'day15k', icon: '🚀', name: 'หมื่นห้า', desc: 'เดินครบ 15,000 ก้าวในวันเดียว', need: (s) => s.maxDay >= 15000, hint: (s) => `สถิติสูงสุด ${fmt(s.maxDay)} ก้าว` },
  { id: 'personal_best', icon: '📈', name: 'ทำลายสถิติ', desc: 'ทำก้าวสูงสุดใหม่ของตัวเอง (หลังบันทึกไปแล้ว 3 วัน)', need: (s) => s.brokeRecord },
  { id: 'comeback', icon: '🔄', name: 'กลับมาแล้ว', desc: 'กลับมาผ่านเป้าหลังหายไป 3 วันขึ้นไป', need: (s) => s.bigComeback },
  { id: 'halfway', icon: '🏅', name: 'ครึ่งทาง', desc: 'อยู่ในชาเลนจ์ถึงสัปดาห์ที่ 8', need: (s) => s.programDayLogged >= 56, onlyChallenge: true },
  { id: 'finisher', icon: '👑', name: 'จบชาเลนจ์', desc: 'อยู่ในชาเลนจ์ครบ 16 สัปดาห์', need: (s) => s.programDayLogged >= 112, onlyChallenge: true }
];

function isChallengeUser(user) {
  return !!(user && user.gender === 'F' && user.program_start_date);
}

function programDay(user, dateStr) {
  const start = new Date(user.program_start_date + 'T00:00:00Z');
  const day = new Date(dateStr + 'T00:00:00Z');
  return Math.round((day - start) / 86400000) + 1;
}

// เป้าก้าวที่ใช้คิดแต้ม: ชาเลนจ์ 16 สัปดาห์ก่อน ไม่มี = เป้าที่ตั้งเอง ("เป้าก้าว 8000") ไม่ตั้ง = 6,000
function effectiveGoal(user, dateStr, challengeGoalFor) {
  const g = challengeGoalFor(user, dateStr);
  if (g !== null && g !== undefined) return g;
  const own = Number(user && user.step_goal);
  return Number.isInteger(own) && own >= 1000 ? own : DEFAULT_STEP_GOAL;
}

function dow(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0 = อาทิตย์
}

function weekKey(dateStr) {
  return addDays(dateStr, -((dow(dateStr) + 6) % 7)); // วันจันทร์ของสัปดาห์นั้น
}

function levelFor(points, female) {
  let i = 0;
  while (i + 1 < LEVEL_POINTS.length && points >= LEVEL_POINTS[i + 1]) i++;
  const names = female ? LEVEL_NAMES_F : LEVEL_NAMES;
  const next = i + 1 < LEVEL_POINTS.length ? { level: i + 2, name: names[i + 1], need: LEVEL_POINTS[i + 1] - points } : null;
  return { level: i + 1, name: names[i], next };
}

// คำนวณแต้ม/สถิติทั้งหมดจากประวัติก้าว
// logs: [{date, steps}] (ลำดับไหนก็ได้), challengeGoalFor: goalForDate จาก steps.js
function computeRewards(user, logs, today, challengeGoalFor) {
  const byDate = {};
  logs.forEach((r) => { if (r.date <= today) byDate[r.date] = Number(r.steps); });
  const dates = Object.keys(byDate).sort();
  const female = !!(user && user.gender === 'F');

  const s = {
    total: 0, logDays: 0, passDays: 0, streak: 0, maxStreak: 0, maxDay: 0,
    perfectWeek: false, weekend: false, brokeRecord: false, bigComeback: false, programDayLogged: 0
  };
  const days = {}; // date -> [{label, pts}]
  let points = 0;
  const add = (d, label, pts) => { (days[d] = days[d] || []).push({ label, pts }); points += pts; };

  if (dates.length > 0) {
    const weekPasses = {};
    let lastLogDate = null;
    let missedSinceLog = 0; // วันที่หายไป (ไม่นับวันพัก) ตั้งแต่บันทึกล่าสุด
    let satPassed = null;

    for (let d = dates[0]; d <= today; d = addDays(d, 1)) {
      const steps = byDate[d];
      const paused = isPausedOn(user, d);

      if (steps === undefined) {
        if (!paused && d !== today) { missedSinceLog++; s.streak = 0; }
        continue;
      }

      const goal = effectiveGoal(user, d, challengeGoalFor);
      const passed = steps >= goal;
      s.logDays++;
      s.total += steps;
      if (s.logDays > 3 && steps > s.maxDay) s.brokeRecord = true;
      s.maxDay = Math.max(s.maxDay, steps);
      if (isChallengeUser(user)) s.programDayLogged = Math.max(s.programDayLogged, programDay(user, d));

      if (steps >= LOG_MIN) add(d, 'บันทึกก้าว', PTS.log);

      if (passed) {
        s.passDays++;
        add(d, 'ผ่านเป้า', PTS.pass);
        const over = Math.min(PTS.overMax, Math.floor((steps - goal) / 1000) * PTS.overPer1000);
        if (over > 0) add(d, `เกินเป้า ${fmt(steps - goal)} ก้าว`, over);
        if (lastLogDate && missedSinceLog >= COMEBACK_GAP) add(d, 'กลับมาแล้ว', PTS.comeback);
        if (lastLogDate && missedSinceLog >= 3) s.bigComeback = true;

        s.streak++;
        s.maxStreak = Math.max(s.maxStreak, s.streak);
        const bonus = STREAK_BONUS[s.streak] || (s.streak > 30 && s.streak % 30 === 0 ? 150 : 0);
        if (bonus) add(d, `ผ่านเป้าติดกัน ${s.streak} วัน`, bonus);

        const wk = weekKey(d);
        weekPasses[wk] = (weekPasses[wk] || 0) + 1;
        if (weekPasses[wk] === 5) add(d, 'ผ่านเป้า 5 วันในสัปดาห์นี้', PTS.week5);
        if (weekPasses[wk] === 7) s.perfectWeek = true;

        if (dow(d) === 6) satPassed = d;
        if (dow(d) === 0 && satPassed === addDays(d, -1)) s.weekend = true;
      } else if (!paused && d !== today) {
        s.streak = 0;
      }
      lastLogDate = d;
      missedSinceLog = 0;
    }
  }

  const challenge = isChallengeUser(user);
  const badges = BADGES.filter((b) => (!b.onlyChallenge || challenge) && b.need(s)).map((b) => b.id);
  return { points, days, stats: s, level: levelFor(points, female), badges, female, challenge };
}

function badgeById(id) {
  return BADGES.find((b) => b.id === id);
}

// ก้าวสะสมทั้งหมด + ระยะทาง + เป้าก้าวสะสมถัดไป
const TOTAL_MILESTONES = [50000, 100000, 250000, 500000, 1000000];
function totalStepsLine(total) {
  let line = `👣 ก้าวสะสม ${fmt(total)} ก้าว ≈ ${fmt(Math.round(total / STEPS_PER_KM))} กม.`;
  const next = TOTAL_MILESTONES.find((m) => total < m);
  if (next) line += ` (อีก ${fmt(next - total)} ถึง ${fmt(next)})`;
  return line;
}

// ข้อความส่วนแต้มที่ต่อท้ายตอนบันทึกก้าว (เทียบก่อน/หลังบันทึก เพื่อหาเหรียญใหม่และการเลื่อนระดับ)
function rewardLines(before, after, today) {
  const items = after.days[today] || [];
  const todayPts = items.reduce((a, x) => a + x.pts, 0);
  let msg = '';
  items.filter((x) => x.label !== 'บันทึกก้าว').forEach((x) => { msg += `➕ ${x.label} +${x.pts}\n`; });
  msg += `🪙 วันนี้ +${todayPts} แต้ม | รวม ${fmt(after.points)} แต้ม\n`;
  const lv = after.level;
  msg += `${lv.name} (Lv.${lv.level})` + (lv.next ? ` อีก ${fmt(lv.next.need)} แต้มถึง Lv.${lv.next.level}` : ' ระดับสูงสุดแล้ว!') + '\n';
  msg += totalStepsLine(after.stats.total) + '\n';

  if (lv.level > before.level.level) {
    msg += `\n🎊 เลื่อนระดับ! ตอนนี้คุณคือ ${lv.name} แล้ว\n`;
  }
  const fresh = after.badges.filter((id) => !before.badges.includes(id)).map(badgeById);
  if (fresh.length) {
    msg += '\n🏅 ปลดล็อกเหรียญใหม่!\n';
    fresh.forEach((b) => { msg += `${b.icon} ${b.name} — ${b.desc}\n`; });
    msg += 'พิมพ์ "เหรียญ" ดูเหรียญทั้งหมด\n';
  }
  return msg;
}

// คำสั่ง "แต้ม"
// wallet = ยอดแลกของจาก redeem.js (null = ระบบแลกยังไม่พร้อม), title = ฉายาจากการแลก เช่น 🍣 จอมหม่ำ+2
function buildPointsText(r, today, wallet, title, reward) {
  const lv = r.level;
  let msg = `🪙 แต้มสะสม: ${fmt(r.points)} แต้ม (ใช้วัดระดับ ไม่ลดลง)\n`;
  if (wallet && reward) {
    msg += `🎁 แต้มแลกของ: ${fmt(wallet.balance)} แต้ม` +
      (wallet.balance >= reward.cost ? ` แลก ${reward.name} ได้! พิมพ์ "แลกรางวัล"` : ` (อีก ${fmt(reward.cost - wallet.balance)} ได้ ${reward.name})`) + '\n';
  }
  msg += `\n${lv.name} (Lv.${lv.level})` + (title ? ` · ${title}` : '') + '\n';
  if (lv.next) msg += `อีก ${fmt(lv.next.need)} แต้มถึง Lv.${lv.next.level} ${lv.next.name}\n`;
  else msg += 'ถึงระดับสูงสุดแล้ว เก่งมาก!\n';
  msg += `🔥 ผ่านเป้าติดกัน ${r.stats.streak} วัน (สูงสุด ${r.stats.maxStreak})\n`;
  msg += totalStepsLine(r.stats.total) + '\n';
  msg += '\n7 วันล่าสุด:\n';
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const pts = (r.days[d] || []).reduce((a, x) => a + x.pts, 0);
    msg += `${d.slice(5)}  ${pts ? '+' + pts : '-'}\n`;
  }
  msg += '\nได้แต้มจาก: บันทึกก้าว +2, ผ่านเป้า +10, เกินเป้าทุก 1,000 ก้าว +1 (สูงสุด +5), ' +
    'ติดกัน 3/7/14/30 วัน +10/+30/+60/+150, ผ่าน 5 วันในสัปดาห์ +25, กลับมาผ่านเป้าหลังหายไป +5';
  return msg;
}

// คำสั่ง "เหรียญ"
function buildBadgesText(r, title) {
  const list = BADGES.filter((b) => !b.onlyChallenge || r.challenge);
  const got = list.filter((b) => r.badges.includes(b.id));
  let msg = `🏅 เหรียญตรา ${got.length}/${list.length}\n` + `${r.level.name}` + (title ? ` · ${title}` : '') + '\n\n';
  got.forEach((b) => { msg += `${b.icon} ${b.name}\n`; });
  if (got.length === 0) msg += 'ยังไม่มีเหรียญ บันทึกก้าววันนี้รับเหรียญแรกเลย!\n';
  const locked = list.filter((b) => !r.badges.includes(b.id));
  if (locked.length) {
    msg += '\nยังล็อกอยู่:\n';
    locked.forEach((b) => { msg += `🔒 ${b.name} — ${b.desc}` + (b.hint ? ` (${b.hint(r.stats)})` : '') + '\n'; });
  }
  return msg.trim();
}

module.exports = {
  computeRewards, rewardLines, buildPointsText, buildBadgesText, effectiveGoal, levelFor,
  DEFAULT_STEP_GOAL, BADGES, LEVEL_NAMES, LEVEL_NAMES_F
};
