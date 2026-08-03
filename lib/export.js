const { getSupabase } = require('./supabase');
const { getUserLogs, getUserWaistLogs } = require('./weight');
const { todayStr } = require('./calc');

const EXPORT_BUCKET = 'exports';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function buildCsvContent(rows) {
  const header = ['date', 'weight_kg', 'waist_cm'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([csvEscape(r.date), csvEscape(r.weight), csvEscape(r.waist)].join(','));
  }
  return lines.join('\n') + '\n';
}

// รวม log น้ำหนัก + รอบเอว ตามวันที่ แล้วแปลงเป็น CSV อัปโหลดขึ้น Supabase Storage
// คืนค่า public URL ให้ผู้ใช้ดาวน์โหลด (path มี userId ทำให้เดา URL ไม่ได้ เหมือนที่ทำกับ progress-photos)
async function buildExportCsv(userId) {
  const [weightLogs, waistLogs] = await Promise.all([
    getUserLogs(userId),
    getUserWaistLogs(userId)
  ]);

  if (weightLogs.length === 0 && waistLogs.length === 0) {
    return null;
  }

  const byDate = new Map();
  for (const r of weightLogs) {
    byDate.set(r.date, { date: r.date, weight: r.weight, waist: null });
  }
  for (const r of waistLogs) {
    const existing = byDate.get(r.date);
    if (existing) existing.waist = r.waist;
    else byDate.set(r.date, { date: r.date, weight: null, waist: r.waist });
  }

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const csv = buildCsvContent(rows);
  const buffer = Buffer.from(csv, 'utf-8');

  const supabase = getSupabase();
  const path = `${userId}/export-${todayStr()}.csv`;

  const { error: uploadError } = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(path, buffer, { contentType: 'text/csv; charset=utf-8', upsert: true });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(EXPORT_BUCKET).getPublicUrl(path);

  return { url: pub.publicUrl, rowCount: rows.length };
}

module.exports = { buildExportCsv };
