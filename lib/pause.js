const { addDays, daysBetween } = require('./calc');

// โหมดพัก: users.pause_from .. users.pause_until (รวมทั้งสองวัน) ช่วงนี้บอทไม่เตือน ไม่นับ streak/ชาเลนจ์ขาด
function isPausedOn(user, dateStr) {
  if (!user || !user.pause_from || !user.pause_until) return false;
  return dateStr >= user.pause_from && dateStr <= user.pause_until;
}

// ถ้าเพิ่งพักจบหรือกำลังพักอยู่ (ภายใน days วันหลังพักจบ) ใช้ข้ามการเตือนเรื่องน้ำหนัก/ปรับระดับกิจกรรมที่ข้อมูลผิดเพี้ยนจากช่วงพัก
function recentlyPaused(user, today, days) {
  if (!user || !user.pause_until) return false;
  return daysBetween(user.pause_until, today) < (days || 10);
}

// วันที่บันทึกล่าสุด "ที่ใช้คิด streak": ถ้าระหว่างวันที่บันทึกล่าสุดกับวันนี้เป็นวันพักทั้งหมด ให้ถือว่าเมื่อวานบันทึกแล้ว (streak ไม่ขาด)
function effectiveLastLogDate(user, today) {
  const last = user && user.last_log_date;
  if (!last || !user.pause_from || !user.pause_until) return last;
  if (last >= addDays(user.pause_from, -1) && last < today && today <= addDays(user.pause_until, 1)) {
    return addDays(today, -1);
  }
  return last;
}

module.exports = { isPausedOn, recentlyPaused, effectiveLastLogDate };
