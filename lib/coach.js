const { getUserData, setUserFields } = require('./users');
const { getUserLogs } = require('./weight');
const { getStepLogs, goalForDate } = require('./steps');
const { getMealsSince } = require('./meals');
const { getCalorieTargetForUser } = require('./healthplan');
const { todayStr, addDays, daysBetween } = require('./calc');
const { recentlyPaused } = require('./pause');

const fmt = (n) => Number(n).toLocaleString('en-US');
const round1 = (n) => Math.round(n * 10) / 10;

// ก้าวเฉลี่ยต่อวัน -> ระดับกิจกรรม 1-5 (อิงเกณฑ์ทั่วไป: <5,000 น้อยมาก, 5,000-7,499 น้อย, 7,500-9,999 ปานกลาง, 10,000-12,499 มาก, 12,500+ มากที่สุด)
function stepsToLevel(avg) {
  if (avg < 5000) return 1;
  if (avg < 7500) return 2;
  if (avg < 10000) return 3;
  if (avg < 12500) return 4;
  return 5;
}

// อัตราน้ำหนักลดต่อสัปดาห์ (กก./สัปดาห์ บวก = ลดลง) จากเส้นแนวโน้ม 28 วันล่าสุด
// ต้องมีข้อมูล >= 3 จุด ครอบคลุม >= 10 วัน และข้อมูลล่าสุดไม่เก่าเกิน 10 วัน ไม่งั้นคืน null
function computePace(logs, today) {
  const recent = logs.filter((r) => {
    const d = daysBetween(r.date, today);
    return d >= 0 && d <= 28;
  });
  if (recent.length < 3) return null;
  const first = recent[0].date;
  const last = recent[recent.length - 1].date;
  if (daysBetween(first, last) < 10 || daysBetween(last, today) > 10) return null;
  const xs = recent.map((r) => daysBetween(first, r.date));
  const ys = recent.map((r) => r.weight);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return { rate: -(num / den) * 7, points: n };
}

function paceSection(user, logs, target, today) {
  if (!user.target_weight || logs.length === 0) return null;
  if (recentlyPaused(user, today, 10)) return null; // เพิ่งพัก/กำลังพัก: ข้อมูลน้ำหนักผิดปกติ ไม่เตือนเรื่องช้า/เร็วเกินไป
  const lastW = logs[logs.length - 1].weight;
  if (lastW <= Number(user.target_weight)) return null;
  const pace = computePace(logs, today);
  if (!pace) return null;

  const rate = round1(pace.rate);
  const fastLimit = Math.max(1.0, round1(0.01 * lastW));
  const adj = Number(user.kcal_adjust) || 0;
  const floor = user.gender === 'M' ? 1500 : 1200;
  const note = '(คำนวณจากแนวโน้มน้ำหนัก 4 สัปดาห์ล่าสุด น้ำหนักขึ้นลงรายวันมีน้ำปนอยู่ ดูแนวโน้มหลายสัปดาห์ดีกว่าดูวันเดียว)';

  if (pace.rate < 0.2) {
    let msg = rate < 0
      ? `⚖️ น้ำหนักเพิ่มขึ้นเฉลี่ย ${Math.abs(rate)} กก./สัปดาห์ (ไม่ลดลง)\n`
      : `⚖️ น้ำหนักลดเฉลี่ย ${rate} กก./สัปดาห์ (ช้ากว่าเกณฑ์ ~0.25-1 กก.)\n`;
    msg += 'ลองเช็คก่อน: บันทึกมื้อครบไหม, ชั่งเวลาเดียวกันทุกครั้งไหม แล้วดูต่ออีก 1-2 สัปดาห์\n';
    if (target && !target.maintain && target.min - 150 >= floor && adj - 150 >= -500) {
      msg += `ถ้ายังช้าอยู่ ลองลดแคลอรี่ลงอีก ~150 kcal พิมพ์ "ปรับแคลอรี่ ${adj - 150}" (จะได้ ${fmt(target.min - 150)}-${fmt(target.max - 150)} kcal/วัน)\n`;
    } else {
      msg += `เป้าแคลอรี่ใกล้ขั้นต่ำที่ปลอดภัย (${fmt(floor)}) แล้ว ไม่แนะนำให้ลดอีก แนะนำเพิ่มก้าวเดินแทน\n`;
    }
    return msg + note;
  }
  if (pace.rate > fastLimit) {
    let msg = `⚠️ น้ำหนักลดเฉลี่ย ${rate} กก./สัปดาห์ (เร็วกว่าที่แนะนำ ~${fastLimit} กก.) เสี่ยงเสียกล้ามเนื้อและอ่อนเพลีย\n`;
    if (adj + 150 <= 500) {
      msg += `แนะนำเพิ่มแคลอรี่ ~150 kcal พิมพ์ "ปรับแคลอรี่ ${adj + 150}"`;
      if (target && !target.maintain) msg += ` (จะได้ ${fmt(target.min + 150)}-${fmt(target.max + 150)} kcal/วัน)`;
      msg += '\n';
    }
    return msg + note;
  }
  return `✅ อัตราการลดน้ำหนักอยู่ในเกณฑ์ดี (${rate} กก./สัปดาห์)\n${note}`;
}

// สรุปประจำสัปดาห์: ก้าว + อาหาร + ระดับกิจกรรม + แนวโน้มน้ำหนัก
// apply = true (เรียกจาก cron) จะปรับระดับกิจกรรมอัตโนมัติจริงถ้าเปิดโหมดอัตโนมัติไว้ ถ้า false (พิมพ์ดูเอง) แค่แสดงผล ไม่เปลี่ยนข้อมูล
async function buildWeeklyCoachMessage(userId, opts) {
  const apply = !!(opts && opts.apply);
  const user = await getUserData(userId);
  if (!user) return null;
  const today = todayStr();
  const since = addDays(today, -6);
  const target = await getCalorieTargetForUser(userId);
  const sections = [];

  const stepLogs = (await getStepLogs(userId)).filter((r) => r.date >= since && r.date <= today);
  let stepAvg = null;
  if (stepLogs.length > 0) {
    stepAvg = Math.round(stepLogs.reduce((a, r) => a + r.steps, 0) / stepLogs.length);
    const best = Math.max(...stepLogs.map((r) => r.steps));
    let line = `👟 ก้าว: บันทึก ${stepLogs.length}/7 วัน เฉลี่ย ${fmt(stepAvg)} ก้าว/วัน สูงสุด ${fmt(best)}`;
    if (user.gender === 'F' && user.program_start_date) {
      const passed = stepLogs.filter((r) => { const g = goalForDate(user, r.date); return g !== null && r.steps >= g; }).length;
      line += ` ผ่านชาเลนจ์ ${passed} วัน`;
    }
    sections.push(line);
  }

  const meals = await getMealsSince(userId, since);
  if (meals.length > 0) {
    const byDate = {};
    meals.forEach((m) => {
      if (m.date > today) return;
      byDate[m.date] = byDate[m.date] || { kcal: 0, protein: 0 };
      byDate[m.date].kcal += m.kcal;
      byDate[m.date].protein += m.protein;
    });
    const days = Object.keys(byDate);
    if (days.length > 0) {
      const avgK = Math.round(days.reduce((a, d) => a + byDate[d].kcal, 0) / days.length);
      const avgP = Math.round(days.reduce((a, d) => a + byDate[d].protein, 0) / days.length);
      let line = `🍽 อาหาร: บันทึก ${days.length}/7 วัน เฉลี่ย ${fmt(avgK)} kcal, โปรตีน ${fmt(avgP)} ก./วัน`;
      if (target && !target.maintain) {
        const ok = days.filter((d) => byDate[d].kcal <= target.max).length;
        line += ` อยู่ในเพดานแคลอรี่ ${ok}/${days.length} วัน`;
      }
      sections.push(line + '\n(นับเฉพาะวันที่บันทึกไว้ และเป็นค่าประมาณ)');
    }
  }

  // ระดับกิจกรรมจากก้าวเฉลี่ย (ต้องมีข้อมูลอย่างน้อย 4 วัน)
  if (stepLogs.length >= 4 && !recentlyPaused(user, today, 10)) {
    const level = stepsToLevel(stepAvg);
    const current = user.activity_level;
    if (user.activity_auto) {
      if (!current) {
        if (apply) await setUserFields(userId, { activity_level: level });
        sections.push(`🏃 ตั้งระดับกิจกรรมอัตโนมัติเป็น ${level} (ก้าวเฉลี่ย ${fmt(stepAvg)})`);
      } else if (level !== current) {
        const next = current + (level > current ? 1 : -1);
        if (apply) {
          await setUserFields(userId, { activity_level: next });
          sections.push(`🏃 ปรับระดับกิจกรรมอัตโนมัติ: ${current} → ${next} (ก้าวเฉลี่ย ${fmt(stepAvg)} ขยับทีละ 1 ระดับต่อสัปดาห์) เป้าแคลอรี่จะปรับตาม`);
        } else {
          sections.push(`🏃 สัปดาห์หน้าบอทจะปรับระดับกิจกรรม ${current} → ${next} (ก้าวเฉลี่ย ${fmt(stepAvg)})`);
        }
      }
    } else if (current && level !== current) {
      sections.push(
        `🏃 จากก้าวเฉลี่ย ~${fmt(stepAvg)} ระดับกิจกรรมที่เหมาะคือ ${level} (ตอนนี้ตั้งไว้ ${current}) พิมพ์ "กิจกรรม ${level}" หรือ "กิจกรรม อัตโนมัติ" ให้บอทปรับให้\n` +
        '(ก้าวไม่นับเวท/ปั่นจักรยาน ถ้าออกกำลังกายแบบอื่นด้วย เลือกระดับสูงกว่านี้ได้)'
      );
    }
  }

  const logs = await getUserLogs(userId);
  const pace = paceSection(user, logs, target, today);
  if (pace) sections.push(pace);

  if (sections.length === 0) return null;
  return { type: 'text', text: '🧭 โค้ชประจำสัปดาห์ (7 วันล่าสุด)\n\n' + sections.join('\n\n') };
}

module.exports = { buildWeeklyCoachMessage, stepsToLevel, computePace };
