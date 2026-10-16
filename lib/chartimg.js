// สร้างรูปกราฟผ่าน QuickChart แล้วคืน URL สั้นๆ (LINE จำกัด URL รูปไม่เกิน 2000 ตัวอักษร จึงใช้ /chart/create แทนการยัด config ลง URL)
async function createChartImage(chartConfig, width, height) {
  const res = await fetch('https://quickchart.io/chart/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: '2',
      backgroundColor: 'white',
      width: width || 700,
      height: height || 420,
      format: 'png',
      chart: chartConfig
    })
  });
  if (!res.ok) throw new Error('quickchart ' + res.status);
  const json = await res.json();
  if (!json || !json.success || !json.url) throw new Error('quickchart no url');
  return { type: 'image', originalContentUrl: json.url, previewImageUrl: json.url };
}

module.exports = { createChartImage };
