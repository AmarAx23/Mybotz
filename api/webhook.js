const { verifySignature, replyMessage, getMessageContent } = require('../lib/line');
const { ensureUser, setUserFields, getUserData } = require('../lib/users');
const {
  logWeight, deleteTodayWeight, logWaist, buildSummaryMessage, buildGraphMessage, buildTdeeMessage
} = require('../lib/weight');
const { startPlan, buildTodayPlanMessage, buildCalorieMessage, onboardingHint } = require('../lib/healthplan');
const { uploadProgressPhoto, getUserPhotos } = require('../lib/storage');
const { todayStr, addDays, parseDeadlineDays } = require('../lib/calc');
const { logSteps, buildStepsStatusMessage } = require('../lib/steps');
const { readStepsFromImage } = require('../lib/stepsvision');
const { buildWeeklyCoachMessage } = require('../lib/coach');
const { buildWeeklyChartMessage } = require('../lib/weeklychart');
const { isAdmin, notifyAdmin } = require('../lib/admin');
const { accessRequired, isApproved, tryApprove, NEED_CODE_TEXT } = require('../lib/access');
const { setupRichMenu } = require('../lib/richmenu');
const { buildExportCsv } = require('../lib/export');
const { buildMonthlySummaryImage } = require('../lib/reports');
const { consumeAiQuota, overQuotaText } = require('../lib/aiquota');
const { isPausedOn } = require('../lib/pause');
const { logMealAndReply, deleteLastMeal, buildMealsSummaryMessage } = require('../lib/meals');

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
    '• "เป้าหมาย 55 ภายใน 3 เดือน" — ตั้งเป้าพร้อมกำหนดเวลา (บอทคำนวณแคลอรี่ให้)\n' +
    '• "ภายใน 12 สัปดาห์" — ตั้ง/เปลี่ยนกำหนดเวลา  • "ยกเลิกกำหนดเวลา"\n' +
    '• "รอบเอว 75" — บันทึกรอบเอว\n' +
    '• "ลบล่าสุด" — ลบข้อมูลน้ำหนักของวันนี้ทิ้ง\n' +
    '• "เดิน 7500" — บันทึกก้าววันนี้ (หรือส่งรูปแคปหน้าจอแอปนับก้าวมาก็ได้)\n\n' +
    'บันทึกอาหาร:\n' +
    '• ส่งรูปอาหารมา บอทจะประเมินแคลอรี่/โปรตีนให้ (AI อ่านรูปได้วันละ 20 รูป)\n' +
    '• "กิน 450 โปรตีน 30" — บันทึกเอง\n' +
    '• "มื้อวันนี้" — ดูสรุปวันนี้เทียบเป้า\n' +
    '• "ลบมื้อล่าสุด" — ลบมื้อที่บันทึกผิด\n\n' +
    'ตั้งค่าโปรไฟล์ (ใช้คำนวณ BMI/แคลอรี่):\n' +
    '• "ส่วนสูง 170"\n' +
    '• "อายุ 25"\n' +
    '• "เพศ ชาย" หรือ "เพศ หญิง"\n' +
    '• "กิจกรรม 3" (1=น้อยมาก ... 5=มากที่สุด)\n' +
    '• "ทีดีอี" — ดูผล BMI / BMR / TDEE\n' +
    '• "กิจกรรม อัตโนมัติ" — ให้บอทปรับระดับกิจกรรมจากก้าวเฉลี่ย\n' +
    '• "ปรับแคลอรี่ -150" — ปรับเป้าแคลอรี่เอง (พิมพ์ 0 เพื่อยกเลิก)\n' +
    '• "สรุปสัปดาห์" — โค้ชประจำสัปดาห์ (ก้าว/อาหาร/แนวโน้มน้ำหนัก)\n' +
    '• "เป้าแคลอรี่" — ดูเป้าแคลอรี่/โปรตีนต่อวัน\n\n' +
    'พักผ่อน:\n' +
    '• "พัก 3 วัน" — โหมดพัก (ป่วย/เดินทาง) ไม่เตือน streak ไม่ขาด  • "เลิกพัก"\n\n' +
    'แผนสุขภาพ 4 เดือน (ชาย = เวท/วิ่ง, หญิง = ชาเลนจ์เดิน):\n' +
    '• "เริ่มแผน" — เริ่มนับวันที่ 1 ของโปรแกรม\n' +
    '• "วันนี้" — ดูตารางของวันนี้\n\n' +
    'รูปความคืบหน้า:\n' +
    '• ส่งรูปตัวเองมาได้เลย จะเก็บไว้ 1 รูป/วัน\n' +
    '• "เปรียบเทียบรูป" — ดูรูปแรกกับล่าสุด\n\n' +
    'สรุป/ข้อมูล:\n' +
    '• "สรุปเดือน" — ดูรูปสรุปความคืบหน้าเดือนที่แล้ว\n' +
    '• "export" — ขอไฟล์ CSV ข้อมูลน้ำหนัก/รอบเอวทั้งหมด';
}

// ต่อท้ายข้อความด้วยคำถามข้อถัดไปของการตั้งค่าก่อนเริ่มแผน (ถ้ามี)
async function withHint(userId, text) {
  const hint = await onboardingHint(userId);
  return hint ? text + '\n\n' + hint : text;
}

async function handleImageEvent(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  await ensureUser(userId);

  // ผู้ใช้ที่ยังไม่ได้รับอนุญาต: ไม่อ่านรูป (กันค่า API และข้อมูลปนเปื้อน)
  if (!isApproved(await getUserData(userId), userId)) {
    await replyMessage(replyToken, [{ type: 'text', text: NEED_CODE_TEXT }]);
    return;
  }

  try {
    // จำกัดจำนวนรูปที่ให้ AI อ่านต่อวัน (กันค่าใช้จ่ายบานปลาย)
    let quota = { allowed: true, limit: 20 };
    try {
      quota = await consumeAiQuota(userId);
    } catch (err) {
      console.error('consumeAiQuota error:', err); // นับโควต้าพัง = ปล่อยผ่าน ไม่ให้บอทใช้ไม่ได้
    }
    if (!quota.allowed) {
      await replyMessage(replyToken, [{ type: 'text', text: overQuotaText(quota.limit) }]);
      return;
    }

    const buffer = await getMessageContent(event.message.id);

    // ถ้าตั้ง ANTHROPIC_API_KEY ไว้ ให้ลองอ่านก่อนว่าเป็นรูปแคปหน้าจอแอปนับก้าวหรือไม่
    let vision = null;
    try {
      vision = await readStepsFromImage(buffer);
    } catch (err) {
      console.error('readStepsFromImage error:', err);
      await notifyAdmin('vision', 'อ่านรูปด้วย Claude API ไม่สำเร็จ: ' + String(err.message || err).slice(0, 300));
      await replyMessage(replyToken, [{ type: 'text', text: 'อ่านรูปไม่สำเร็จ ลองส่งใหม่อีกครั้งนะ (ถ้าเป็นรูปนับก้าว พิมพ์ "เดิน 7500" แทนได้)' }]);
      return;
    }

    if (vision.configured && vision.type === 'food') {
      if (vision.food) {
        await replyMessage(replyToken, [{ type: 'text', text: await logMealAndReply(userId, vision.food, 'photo') }]);
      } else {
        await replyMessage(replyToken, [{ type: 'text', text: 'เห็นว่าเป็นรูปอาหาร แต่ประเมินไม่ได้ ลองถ่ายให้เห็นอาหารชัดขึ้น หรือพิมพ์ เช่น "กิน 450 โปรตีน 30" แทนนะ' }]);
      }
      return;
    }

    if (vision.configured && vision.isSteps) {
      if (vision.steps) {
        await replyMessage(replyToken, [{ type: 'text', text: await logSteps(userId, vision.steps) }]);
      } else {
        await replyMessage(replyToken, [{ type: 'text', text: 'เห็นว่าเป็นรูปนับก้าว แต่อ่านตัวเลขไม่ชัด ลองพิมพ์ เช่น "เดิน 7500" แทนนะ' }]);
      }
      return;
    }

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

  if (/^(ไอดีฉัน|my ?id)\s*$/i.test(text)) {
    await replyMessage(replyToken, [{ type: 'text', text: `ไอดี LINE ของคุณสำหรับบอทนี้:\n${userId}\n(ใช้ตั้งเป็น ADMIN_USER_ID ใน Vercel ถ้าคุณเป็นเจ้าของบอท อย่าแชร์ให้คนอื่น)` }]);
    return;
  }

  if (/^ตั้งเมนู\s*$/.test(text)) {
    if (!isAdmin(userId)) {
      await replyMessage(replyToken, [{ type: 'text', text: 'คำสั่งนี้ใช้ได้เฉพาะเจ้าของบอท (ต้องตั้ง ADMIN_USER_ID ใน Vercel ก่อน)' }]);
      return;
    }
    try {
      await setupRichMenu();
      await replyMessage(replyToken, [{ type: 'text', text: '✅ ตั้งเมนูใต้แชทเรียบร้อย ปิดแชทแล้วเปิดใหม่ จะเห็นปุ่มเมนูด้านล่าง' }]);
    } catch (err) {
      console.error('setupRichMenu error:', err);
      await replyMessage(replyToken, [{ type: 'text', text: 'ตั้งเมนูไม่สำเร็จ: ' + String(err.message || err).slice(0, 300) }]);
    }
    return;
  }

  // จำกัดคนใช้ด้วยรหัสเชิญ (ถ้าตั้ง INVITE_CODE ไว้)
  if (accessRequired() && !isApproved(await getUserData(userId), userId)) {
    const result = await tryApprove(userId, text);
    if (result === 'ok') {
      await replyMessage(replyToken, [{ type: 'text', text: 'ยินดีต้อนรับ! 🎉 รหัสถูกต้อง ใช้งานได้แล้วนะ\nเริ่มต้นพิมพ์ "เริ่มแผน" หรือพิมพ์ "ช่วยเหลือ" ดูคำสั่งทั้งหมดได้เลย' }]);
    } else if (result === 'wrong') {
      await replyMessage(replyToken, [{ type: 'text', text: 'รหัสไม่ถูกต้อง ลองใหม่อีกครั้งนะ' }]);
    } else {
      await replyMessage(replyToken, [{ type: 'text', text: NEED_CODE_TEXT }]);
    }
    return;
  }

  // โหมดพัก: "พัก 3 วัน" / "เลิกพัก"
  if (/^(เลิกพัก|ยกเลิกพัก|กลับมาแล้ว|resume)\s*$/i.test(text)) {
    const user = await getUserData(userId);
    if (!isPausedOn(user, todayStr())) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ตอนนี้ไม่ได้อยู่ในโหมดพักนะ' }]);
      return;
    }
    try {
      await setUserFields(userId, { pause_until: addDays(todayStr(), -1) });
      await replyMessage(replyToken, [{ type: 'text', text: '👋 ยินดีต้อนรับกลับ! ปิดโหมดพักแล้ว บอทจะกลับมาเตือนตามปกติตั้งแต่พรุ่งนี้เช้า' }]);
    } catch (err) {
      console.error('resume error:', err);
      await notifyAdmin('pause', 'ปิดโหมดพักไม่สำเร็จ (ลืมรัน supabase-v4.sql หรือเปล่า): ' + String(err.message || err).slice(0, 200));
      await replyMessage(replyToken, [{ type: 'text', text: 'ปิดโหมดพักไม่สำเร็จ ลองใหม่อีกครั้งนะ' }]);
    }
    return;
  }

  const pauseMatch = text.match(/^(พัก|หยุดพัก|pause)\s*(\d{1,3})?\s*(วัน|days?)?\s*$/i);
  if (pauseMatch) {
    const today = todayStr();
    const n = pauseMatch[2] ? parseInt(pauseMatch[2], 10) : null;
    if (n === null) {
      const user = await getUserData(userId);
      const status = isPausedOn(user, today) ? `ตอนนี้อยู่ในโหมดพัก ถึงวันที่ ${user.pause_until}\n(พิมพ์ "เลิกพัก" เพื่อกลับมาเลย)\n\n` : '';
      await replyMessage(replyToken, [{ type: 'text', text: status + 'ต้องไปธุระ ป่วย หรือเดินทาง? พิมพ์ เช่น "พัก 3 วัน" (1-30 วัน)\nระหว่างพัก บอทจะไม่ส่งเตือน streak/ชาเลนจ์ไม่ขาด และไม่เตือนเรื่องน้ำหนักขึ้นลง กลับมาบันทึกน้ำหนักเมื่อไหร่ก็ปิดโหมดพักเอง' }]);
      return;
    }
    if (n < 1 || n > 30) {
      await replyMessage(replyToken, [{ type: 'text', text: 'พักได้ 1-30 วันนะ เช่น "พัก 3 วัน"' }]);
      return;
    }
    const until = addDays(today, n - 1);
    try {
      await setUserFields(userId, { pause_from: today, pause_until: until });
      await replyMessage(replyToken, [{ type: 'text', text: `⏸ เปิดโหมดพัก ${n} วัน (ถึงวันที่ ${until})\nบอทจะไม่ส่งเตือน และ streak/ชาเลนจ์จะไม่ขาด\nกลับมาก่อนได้ แค่บันทึกน้ำหนัก หรือพิมพ์ "เลิกพัก" พักผ่อนให้เต็มที่นะ 🙏` }]);
    } catch (err) {
      console.error('pause error:', err);
      await notifyAdmin('pause', 'เปิดโหมดพักไม่สำเร็จ (ลืมรัน supabase-v4.sql หรือเปล่า): ' + String(err.message || err).slice(0, 200));
      await replyMessage(replyToken, [{ type: 'text', text: 'เปิดโหมดพักไม่สำเร็จ ลองใหม่อีกครั้งนะ' }]);
    }
    return;
  }

  if (/^(มื้อวันนี้|แคลวันนี้|กินอะไรไป|meals)/i.test(text)) {
    await replyMessage(replyToken, [await buildMealsSummaryMessage(userId)]);
    return;
  }

  if (/^(ลบมื้อล่าสุด|ลบมื้อ)/i.test(text)) {
    await replyMessage(replyToken, [{ type: 'text', text: await deleteLastMeal(userId) }]);
    return;
  }

  const eatMatch = text.match(/^(กิน|มื้อ)\s*(\d{2,4})(?:\s*(?:โปรตีน|protein|p)?\s*[:=]?\s*(\d{1,3}))?/i);
  if (eatMatch) {
    const kcal = parseInt(eatMatch[2], 10);
    const protein = eatMatch[3] ? parseInt(eatMatch[3], 10) : 0;
    if (kcal < 20 || kcal > 3000) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ตัวเลขแคลอรี่ดูไม่ถูกต้อง ลองพิมพ์ใหม่ เช่น "กิน 450 โปรตีน 30" นะ' }]);
    } else {
      await replyMessage(replyToken, [{ type: 'text', text: await logMealAndReply(userId, { name: 'บันทึกเอง', kcal, protein }, 'manual') }]);
    }
    return;
  }

  if (/^(ยกเลิกกำหนดเวลา|ลบกำหนดเวลา)/i.test(text)) {
    await setUserFields(userId, { target_date: null });
    await replyMessage(replyToken, [{ type: 'text', text: 'ยกเลิกกำหนดเวลาแล้ว บอทจะกลับไปใช้เป้าแคลอรี่แบบมาตรฐาน (ลดช้าๆ สม่ำเสมอ)' }]);
    return;
  }

  if (/^(ภายใน|within|deadline|กำหนดเวลา)/i.test(text)) {
    const dl = parseDeadlineDays(text);
    if (dl === null || dl < 7 || dl > 730) {
      await replyMessage(replyToken, [{ type: 'text', text: 'พิมพ์กำหนดเวลาแบบนี้นะ เช่น "ภายใน 3 เดือน" "ภายใน 12 สัปดาห์" หรือ "ภายใน 90 วัน" (ช่วง 1 สัปดาห์ ถึง 2 ปี)' }]);
      return;
    }
    const user = await getUserData(userId);
    if (!user || !user.target_weight) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ตั้งเป้าหมายน้ำหนักก่อนนะ เช่น "เป้าหมาย 55" แล้วค่อยตั้งกำหนดเวลา' }]);
      return;
    }
    const date = addDays(todayStr(), dl);
    await setUserFields(userId, { target_date: date });
    await replyMessage(replyToken, [
      { type: 'text', text: `ตั้งกำหนดถึงเป้าหมายไว้ ภายใน ${dl} วัน (${date}) แล้วนะ ⏳` },
      await buildCalorieMessage(userId)
    ]);
    return;
  }

  const stepsMatch = text.match(/^(เดิน|ก้าว|steps?)\s*[:=]?\s*(\d[\d,]*)/i);
  if (stepsMatch) {
    const n = parseInt(stepsMatch[2].replace(/,/g, ''), 10);
    if (n < 100 || n > 100000) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ตัวเลขก้าวดูไม่ถูกต้อง ลองพิมพ์ใหม่ เช่น "เดิน 7500" นะ' }]);
    } else {
      await replyMessage(replyToken, [{ type: 'text', text: await logSteps(userId, n) }]);
    }
    return;
  }

  if (/^(เดิน|ก้าว|steps?)\s*$/i.test(text)) {
    await replyMessage(replyToken, [await buildStepsStatusMessage(userId)]);
    return;
  }

  if (/^(สรุปเดือน|monthly summary|monthly)/i.test(text)) {
    try {
      const image = await buildMonthlySummaryImage(userId);
      if (!image) {
        await replyMessage(replyToken, [{ type: 'text', text: 'เดือนที่แล้วยังไม่มีข้อมูลบันทึกเลยนะ' }]);
      } else {
        await replyMessage(replyToken, [image]);
      }
    } catch (err) {
      console.error('monthly summary image error:', err);
      await replyMessage(replyToken, [{ type: 'text', text: 'สร้างรูปสรุปเดือนไม่สำเร็จ ลองใหม่อีกครั้งนะ' }]);
    }
    return;
  }

  if (/^(export|ส่งออก|ดาวน์โหลดข้อมูล|ออกซีเอสวี)/i.test(text)) {
    try {
      const result = await buildExportCsv(userId);
      if (!result) {
        await replyMessage(replyToken, [{ type: 'text', text: 'ยังไม่มีข้อมูลให้ export เลยนะ ลองบันทึกน้ำหนักก่อน' }]);
      } else {
        await replyMessage(replyToken, [{
          type: 'text',
          text: `📄 ไฟล์ข้อมูลของคุณ (${result.rowCount} วัน) พร้อมแล้ว\n${result.url}\n\nลิงก์นี้เดายาก แต่เข้าถึงได้โดยไม่ต้อง login ถ้าไม่อยากให้คนอื่นเห็น อย่าแชร์ลิงก์นี้นะ`
        }]);
      }
    } catch (err) {
      console.error('export csv error:', err);
      await replyMessage(replyToken, [{ type: 'text', text: 'สร้างไฟล์ export ไม่สำเร็จ ลองใหม่อีกครั้งนะ' }]);
    }
    return;
  }

  if (/^(สรุปสัปดาห์|weekly)/i.test(text)) {
    const coach = await buildWeeklyCoachMessage(userId, { apply: false });
    const out = [coach || { type: 'text', text: 'ยังไม่มีข้อมูลก้าว/อาหาร/น้ำหนักพอสำหรับสรุปสัปดาห์นี้ ลองบันทึกสักสองสามวันก่อนนะ' }];
    try {
      const chart = await buildWeeklyChartMessage(userId);
      if (chart) out.push(chart);
    } catch (err) {
      console.error('weekly chart error:', err);
    }
    await replyMessage(replyToken, out);
    return;
  }

  const adjMatch = text.match(/^ปรับแคลอรี่\s*([+\-−]?)\s*(\d{1,3})/);
  if (adjMatch) {
    const sign = (adjMatch[1] === '-' || adjMatch[1] === '−') ? -1 : 1;
    const value = sign * parseInt(adjMatch[2], 10);
    if (value < -500 || value > 500) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ปรับได้ไม่เกิน ±500 kcal นะ ลองพิมพ์ใหม่ เช่น "ปรับแคลอรี่ -150"' }]);
      return;
    }
    try {
      await setUserFields(userId, { kcal_adjust: value });
    } catch (err) {
      console.error('kcal_adjust error:', err);
      await replyMessage(replyToken, [{ type: 'text', text: 'ฟีเจอร์นี้ต้องอัปเดตฐานข้อมูลก่อน (รัน supabase-v2.sql ใน Supabase)' }]);
      return;
    }
    await replyMessage(replyToken, [
      { type: 'text', text: value === 0 ? 'ยกเลิกการปรับแคลอรี่แล้ว' : `ตั้งปรับเป้าแคลอรี่ ${value > 0 ? '+' : ''}${value} kcal แล้วนะ` },
      await buildCalorieMessage(userId)
    ]);
    return;
  }

  if (/^(กิจกรรม|activity)\s*[:=]?\s*(อัตโนมัติ|auto|ออโต้)/i.test(text)) {
    try {
      await setUserFields(userId, { activity_auto: true });
    } catch (err) {
      console.error('activity_auto error:', err);
      await replyMessage(replyToken, [{ type: 'text', text: 'ฟีเจอร์นี้ต้องอัปเดตฐานข้อมูลก่อน (รัน supabase-v2.sql ใน Supabase)' }]);
      return;
    }
    await replyMessage(replyToken, [{ type: 'text', text:
      '🏃 เปิดโหมดปรับระดับกิจกรรมอัตโนมัติแล้ว\nทุกวันอาทิตย์บอทจะดูก้าวเฉลี่ย 7 วัน (ต้องบันทึกอย่างน้อย 4 วัน) แล้วขยับระดับกิจกรรมทีละ 1 ระดับ เป้าแคลอรี่จะปรับตาม\nก้าวไม่นับเวท/ปั่นจักรยาน ถ้าออกกำลังกายแบบอื่นเยอะ แนะนำตั้งเองด้วย "กิจกรรม 1-5" แทน (จะปิดโหมดอัตโนมัติ)' }]);
    return;
  }

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
    const fields = { target_weight: target };
    let extra = '';
    const dl = parseDeadlineDays(text);
    if (dl !== null) {
      if (dl < 7 || dl > 730) {
        await replyMessage(replyToken, [{ type: 'text', text: 'กำหนดเวลาควรอยู่ระหว่าง 1 สัปดาห์ ถึง 2 ปี ลองพิมพ์ใหม่ เช่น "เป้าหมาย 55 ภายใน 3 เดือน" นะ' }]);
        return;
      }
      fields.target_date = addDays(todayStr(), dl);
      extra = `\nกำหนดถึงเป้า: ภายใน ${dl} วัน (${fields.target_date})`;
    }
    await setUserFields(userId, fields);
    const msgs = [{ type: 'text', text: await withHint(userId, `ตั้งเป้าหมายน้ำหนักไว้ที่ ${target} กก. แล้วนะ 🎯${extra}\nพิมพ์ตัวเลขน้ำหนักมาบันทึกได้เลยทุกเช้า`) }];
    if (dl !== null) msgs.push(await buildCalorieMessage(userId));
    await replyMessage(replyToken, msgs);
    return;
  }

  const heightMatch = text.match(/^(ส่วนสูง|height)\s*[:=]?\s*(\d{2,3}(\.\d{1,2})?)/i);
  if (heightMatch) {
    await setUserFields(userId, { height: parseFloat(heightMatch[2]) });
    await replyMessage(replyToken, [{ type: 'text', text: await withHint(userId, `บันทึกส่วนสูง ${heightMatch[2]} ซม. แล้วนะ`) }]);
    return;
  }

  const ageMatch = text.match(/^(อายุ|age)\s*[:=]?\s*(\d{1,3})/i);
  if (ageMatch) {
    await setUserFields(userId, { age: parseInt(ageMatch[2], 10) });
    await replyMessage(replyToken, [{ type: 'text', text: await withHint(userId, `บันทึกอายุ ${ageMatch[2]} ปี แล้วนะ`) }]);
    return;
  }

  const genderMatch = text.match(/^(เพศ|gender)\s*[:=]?\s*(ชาย|หญิง|male|female)/i);
  if (genderMatch) {
    const g = genderMatch[2].toLowerCase();
    const genderValue = (g === 'ชาย' || g === 'male') ? 'M' : 'F';
    await setUserFields(userId, { gender: genderValue });
    await replyMessage(replyToken, [{ type: 'text', text: await withHint(userId, `บันทึกเพศ ${genderValue === 'M' ? 'ชาย' : 'หญิง'} แล้วนะ`) }]);
    return;
  }

  const activityMatch = text.match(/^(กิจกรรม|activity)\s*[:=]?\s*([1-5])/i);
  if (activityMatch) {
    const prev = await getUserData(userId);
    const fields = { activity_level: parseInt(activityMatch[2], 10) };
    let note = '';
    if (prev && prev.activity_auto) {
      fields.activity_auto = false;
      note = '\n(ปิดโหมดอัตโนมัติแล้ว พิมพ์ "กิจกรรม อัตโนมัติ" เพื่อเปิดใหม่)';
    }
    await setUserFields(userId, fields);
    await replyMessage(replyToken, [{ type: 'text', text: await withHint(userId, `บันทึกระดับกิจกรรม ${activityMatch[2]} แล้วนะ${note}`) }]);
    return;
  }

  const waistMatch = text.match(/^(รอบเอว|เอว|waist)\s*[:=]?\s*(\d{2,3}(\.\d{1,2})?)/i);
  if (waistMatch) {
    const waist = parseFloat(waistMatch[2]);
    await replyMessage(replyToken, [{ type: 'text', text: await logWaist(userId, waist) }]);
    return;
  }

  if (/^(เป้าแคลอรี่|เป้าอาหาร|kcal)/i.test(text)) {
    await replyMessage(replyToken, [await buildCalorieMessage(userId)]);
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
        text: `คุณเริ่มแผนไปแล้วตั้งแต่วันที่ ${user.program_start_date}\nถ้าต้องการรีเซ็ตเริ่มใหม่ (นับวันที่ 1 ใหม่ โปรไฟล์/เป้าหมาย/น้ำหนักที่บันทึกไว้ยังอยู่ครบ) พิมพ์ "ยืนยันเริ่มใหม่"`
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
      await replyMessage(replyToken, [{ type: 'text', text: await withHint(userId, await logWeight(userId, weight)) }]);
      return;
    }
  }

  await replyMessage(replyToken, [{ type: 'text', text: helpText() }]);
}

async function handleFollowEvent(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;
  await ensureUser(userId);
  const approved = isApproved(await getUserData(userId), userId);
  const text = approved
    ? 'สวัสดี! ยินดีที่ได้รู้จักนะ 👋\nบอทนี้ช่วยลดน้ำหนัก ติดตามก้าว และนับแคลอรี่\n\nเริ่มต้นง่ายๆ: พิมพ์ "เริ่มแผน" แล้วบอทจะถามข้อมูลทีละข้อ\nหรือส่งตัวเลขน้ำหนักมาบันทึกได้เลย เช่น "65.4"\nพิมพ์ "ช่วยเหลือ" ดูคำสั่งทั้งหมด'
    : 'สวัสดี! ยินดีต้อนรับ 👋\n' + NEED_CODE_TEXT;
  await replyMessage(event.replyToken, [{ type: 'text', text }]);
}

async function handleEvent(event) {
  if (event.type === 'follow') {
    await handleFollowEvent(event);
    return;
  }
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
    events.map((event) => handleEvent(event).catch(async (err) => {
      console.error('handleEvent error:', err);
      await notifyAdmin('webhook', 'บอทเจอ error ระหว่างตอบข้อความ: ' + String(err && err.message ? err.message : err).slice(0, 300));
    }))
  );

  res.status(200).json({ status: 'ok' });
};
