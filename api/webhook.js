const { verifySignature, replyMessage, getMessageContent } = require('../lib/line');
const { ensureUser, setUserFields, getUserData } = require('../lib/users');
const {
  logWeight, deleteTodayWeight, logWaist, buildSummaryMessage, buildGraphMessage, buildTdeeMessage
} = require('../lib/weight');
const { startPlan, buildTodayPlanMessage } = require('../lib/healthplan');
const { uploadProgressPhoto, getUserPhotos } = require('../lib/storage');
const { todayStr } = require('../lib/calc');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function helpText() {
  return 'สวัสดี! ส่งตัวเลขน้ำหนัก เช่น "65.4" มาบันทึกได้เลย (ส่งซ้ำในวันเดียวกัน = แก้ไขค่าเดิม)\n\n' +
    'คำสั่งเกี่ยวกับน้ำหนัก:\n' +
    '• "เป้าหมาย 60" — ตั้งเป้าหมายน้ำหนัก\n' +
    '• "สรุป" — ดูสรุปความคืบหน้า\n' +
    '• "กราฟ" — ดูกราฟน้ำหนักย้อนหลัง\n' +
    '• "รอบเอว 75" — บันทึกรอบเอว\n' +
    '• "ลบล่าสุด" — ลบข้อมูลน้ำหนักของวันนี้ทิ้ง\n\n' +
    'ตั้งค่าโปรไฟล์ (ใช้คำนวณ BMI/แคลอรี่):\n' +
    '• "ส่วนสูง 170"\n' +
    '• "อายุ 25"\n' +
    '• "เพศ ชาย" หรือ "เพศ หญิง"\n' +
    '• "กิจกรรม 3" (1=น้อยมาก ... 5=มากที่สุด)\n' +
    '• "ทีดีอี" — ดูผล BMI / BMR / TDEE\n\n' +
    'แผนสุขภาพ 4 เดือน (จากไฟล์ที่ตั้งไว้):\n' +
    '• "เริ่มแผน" — เริ่มนับวันที่ 1 ของโปรแกรม\n' +
    '• "วันนี้" — ดูเวท/วิ่งของวันนี้\n\n' +
    'รูปความคืบหน้า:\n' +
    '• ส่งรูปตัวเองมาได้เลย จะเก็บไว้ 1 รูป/วัน\n' +
    '• "เปรียบเทียบรูป" — ดูรูปแรกกับล่าสุด';
}

async function handleImageEvent(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  await ensureUser(userId);

  try {
    const buffer = await getMessageContent(event.message.id);
    await uploadProgressPhoto(userId, todayStr(), buffer, 'image/jpeg');
    await replyMessage(replyToken, [
      { type: 'text', text: '📸 บันทึกรูปความคืบหน้าวันนี้แล้ว! พิมพ์ "เปรียบเทียบรูป" เพื่อดูรูปแรกกับล่าสุดได้' }
    ]);
  } catch (err) {
    console.error('handleImageEvent error:', err);
    await replyMessage(replyToken, [{ type: 'text', text: 'บันทึกรูปไม่สำเร็จ ลองส่งใหม่อีกครั้งนะ' }]);
  }
}

async function handleTextEvent(event) {
  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  await ensureUser(userId);

  if (/^(สรุป|summary)/i.test(text)) {
    await replyMessage(replyToken, [await buildSummaryMessage(userId)]);
    return;
  }

  if (/^(กราฟ|graph|chart)/i.test(text)) {
    const chartMsg = await buildGraphMessage(userId);
    if (chartMsg) {
      await replyMessage(replyToken, [chartMsg]);
    } else {
      await replyMessage(replyToken, [{ type: 'text', text: 'ยังไม่มีข้อมูลน้ำหนักพอสำหรับวาดกราฟเลยนะ ลองบันทึกน้ำหนักสัก 2-3 วันก่อน' }]);
    }
    return;
  }

  if (/^(ลบน้ำหนักวันนี้|ลบล่าสุด|delete weight)/i.test(text)) {
    await replyMessage(replyToken, [{ type: 'text', text: await deleteTodayWeight(userId) }]);
    return;
  }

  if (/^(เปรียบเทียบรูป|ดูรูป|before ?after|photos)/i.test(text)) {
    const photos = await getUserPhotos(userId);
    if (photos.length === 0) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ยังไม่มีรูปความคืบหน้าเลย ลองส่งรูปตัวเองมาเก็บไว้ดูก่อนนะ' }]);
      return;
    }
    const first = photos[0];
    const last = photos[photos.length - 1];
    const messages = [{ type: 'text', text: `📸 เปรียบเทียบความคืบหน้า\nรูปแรก: ${first.log_date}` }];
    messages.push({ type: 'image', originalContentUrl: first.public_url, previewImageUrl: first.public_url });
    if (last.log_date !== first.log_date) {
      messages.push({ type: 'text', text: `รูปล่าสุด: ${last.log_date}` });
      messages.push({ type: 'image', originalContentUrl: last.public_url, previewImageUrl: last.public_url });
    }
    await replyMessage(replyToken, messages);
    return;
  }

  if (/^(เป้าหมาย|target)\s*$/i.test(text)) {
    await replyMessage(replyToken, [{ type: 'text', text: 'พิมพ์ "เป้าหมาย <ตัวเลข>" เช่น "เป้าหมาย 60" นะ' }]);
    return;
  }

  const goalMatch = text.match(/^(เป้าหมาย|target)\s*[:=]?\s*(\d+(\.\d{1,2})?)/i);
  if (goalMatch) {
    const target = parseFloat(goalMatch[2]);
    await setUserFields(userId, { target_weight: target });
    await replyMessage(replyToken, [{ type: 'text', text: `ตั้งเป้าหมายน้ำหนักไว้ที่ ${target} กก. แล้วนะ 🎯\nพิมพ์ตัวเลขน้ำหนักมาบันทึกได้เลยทุกเช้า` }]);
    return;
  }

  const heightMatch = text.match(/^(ส่วนสูง|height)\s*[:=]?\s*(\d{2,3}(\.\d{1,2})?)/i);
  if (heightMatch) {
    await setUserFields(userId, { height: parseFloat(heightMatch[2]) });
    await replyMessage(replyToken, [{ type: 'text', text: `บันทึกส่วนสูง ${heightMatch[2]} ซม. แล้วนะ` }]);
    return;
  }

  const ageMatch = text.match(/^(อายุ|age)\s*[:=]?\s*(\d{1,3})/i);
  if (ageMatch) {
    await setUserFields(userId, { age: parseInt(ageMatch[2], 10) });
    await replyMessage(replyToken, [{ type: 'text', text: `บันทึกอายุ ${ageMatch[2]} ปี แล้วนะ` }]);
    return;
  }

  const genderMatch = text.match(/^(เพศ|gender)\s*[:=]?\s*(ชาย|หญิง|male|female)/i);
  if (genderMatch) {
    const g = genderMatch[2].toLowerCase();
    const genderValue = (g === 'ชาย' || g === 'male') ? 'M' : 'F';
    await setUserFields(userId, { gender: genderValue });
    await replyMessage(replyToken, [{ type: 'text', text: `บันทึกเพศ ${genderValue === 'M' ? 'ชาย' : 'หญิง'} แล้วนะ` }]);
    return;
  }

  const activityMatch = text.match(/^(กิจกรรม|activity)\s*[:=]?\s*([1-5])/i);
  if (activityMatch) {
    await setUserFields(userId, { activity_level: parseInt(activityMatch[2], 10) });
    await replyMessage(replyToken, [{ type: 'text', text: `บันทึกระดับกิจกรรม ${activityMatch[2]} แล้วนะ` }]);
    return;
  }

  const waistMatch = text.match(/^(รอบเอว|เอว|waist)\s*[:=]?\s*(\d{2,3}(\.\d{1,2})?)/i);
  if (waistMatch) {
    const waist = parseFloat(waistMatch[2]);
    await replyMessage(replyToken, [{ type: 'text', text: await logWaist(userId, waist) }]);
    return;
  }

  if (/^(ทีดีอี|tdee|แคลอรี่|calorie)/i.test(text)) {
    await replyMessage(replyToken, [await buildTdeeMessage(userId)]);
    return;
  }

  if (/^(ยืนยันเริ่มใหม่|confirm restart)/i.test(text)) {
    await replyMessage(replyToken, [{ type: 'text', text: await startPlan(userId) }]);
    return;
  }

  if (/^(เริ่มแผน|start plan)/i.test(text)) {
    const user = await getUserData(userId);
    if (user && user.program_start_date) {
      await replyMessage(replyToken, [{
        type: 'text',
        text: `คุณเริ่มแผนไปแล้วตั้งแต่วันที่ ${user.program_start_date}\nถ้าต้องการรีเซ็ตเริ่มใหม่ (นับวันที่ 1 ใหม่ และตั้งโปรไฟล์/เป้าหมายกลับเป็นค่าเริ่มต้นจากแผน) พิมพ์ "ยืนยันเริ่มใหม่"`
      }]);
      return;
    }
    await replyMessage(replyToken, [{ type: 'text', text: await startPlan(userId) }]);
    return;
  }

  if (/^(วันนี้|แผนวันนี้|today)/i.test(text)) {
    await replyMessage(replyToken, [await buildTodayPlanMessage(userId)]);
    return;
  }

  if (/^(ช่วยเหลือ|help|เมนู|menu)/i.test(text)) {
    await replyMessage(replyToken, [{ type: 'text', text: helpText() }]);
    return;
  }

  const weightMatch = text.match(/(\d{2,3}(\.\d{1,2})?)/);
  if (weightMatch) {
    const weight = parseFloat(weightMatch[1]);
    if (weight >= 20 && weight <= 300) {
      await replyMessage(replyToken, [{ type: 'text', text: await logWeight(userId, weight) }]);
      return;
    }
  }

  await replyMessage(replyToken, [{ type: 'text', text: helpText() }]);
}

async function handleEvent(event) {
  if (event.type !== 'message') return;
  if (event.message.type === 'text') {
    await handleTextEvent(event);
    return;
  }
  if (event.message.type === 'image') {
    await handleImageEvent(event);
    return;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).json({ status: 'ok' });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-line-signature'];

  if (!verifySignature(rawBody, signature)) {
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  let json;
  try {
    json = JSON.parse(rawBody || '{}');
  } catch (e) {
    res.status(400).json({ error: 'invalid json' });
    return;
  }

  const events = json.events || [];
  await Promise.all(
    events.map((event) => handleEvent(event).catch((err) => console.error('handleEvent error:', err)))
  );

  res.status(200).json({ status: 'ok' });
};
