// ===================================================================
// ค่าคงที่จากแผนสุขภาพ 4 เดือน (พอร์ตมาจากไฟล์ PDF ที่ผู้ใช้อัปโหลด)
// แก้ตัวเลขตรงนี้ได้ถ้าโปรไฟล์หรือเป้าหมายเปลี่ยนไปจากตอนที่ทำแผน
// เวอร์ชันนี้: ปรับท่าเวทให้ผสมดัมเบล (ดัมเบลปรับน้ำหนักได้ 2-24 กก./ข้าง)
// ===================================================================

const PLAN_HEIGHT_CM = 183;
const PLAN_AGE = 27;
const PLAN_GENDER = 'M';
const PLAN_ACTIVITY_LEVEL = 4; // วิ่ง 3-5 วัน/สัปดาห์ + เวท = ระดับ "มาก"
const PLAN_TARGET_WEIGHT = 78; // กึ่งกลางเป้าหมาย 75-79 กก. จากแผน (ปรับได้ด้วย "เป้าหมาย <ตัวเลข>")
const PLAN_CALORIE_MIN = 2100;
const PLAN_CALORIE_MAX = 2350;
const PLAN_PROTEIN_MIN = 150;
const PLAN_PROTEIN_MAX = 170;

// แผนวิ่ง 16 สัปดาห์ (อังคาร/พฤหัสบดี = Easy run, เสาร์ = Long run)
const RUN_PLAN = {
  1: { tuethu: 'อบอุ่นเดิน 5 นาที + (วิ่ง 1 นาที/เดิน 2 นาที) x8 + เดินคูลดาวน์ 5 นาที (~30 นาที)', sat: 'เท่ากับวันอังคาร/พฤหัส' },
  2: { tuethu: '(วิ่ง 1.5 นาที/เดิน 2 นาที) x7 (~30 นาที)', sat: '(วิ่ง 2 นาที/เดิน 2 นาที) x6 (~30 นาที)' },
  3: { tuethu: '(วิ่ง 2 นาที/เดิน 1.5 นาที) x7 (~28 นาที)', sat: '(วิ่ง 3 นาที/เดิน 2 นาที) x5 (~32 นาที)' },
  4: { tuethu: '(วิ่ง 3 นาที/เดิน 1.5 นาที) x6 (~30 นาที)', sat: '(วิ่ง 4 นาที/เดิน 2 นาที) x5 (~35 นาที)' },
  5: { tuethu: '(วิ่ง 5 นาที/เดิน 2 นาที) x4 (~30 นาที)', sat: '(วิ่ง 6 นาที/เดิน 2 นาที) x4 (~34 นาที)' },
  6: { tuethu: '(วิ่ง 8 นาที/เดิน 2 นาที) x3 (~32 นาที)', sat: '(วิ่ง 10 นาที/เดิน 2 นาที) x3 (~38 นาที)' },
  7: { tuethu: '(วิ่ง 10 นาที/เดิน 90 วิ) x3 (~35 นาที)', sat: 'วิ่งต่อเนื่อง 20 นาที + เดินคูลดาวน์' },
  8: { tuethu: 'วิ่งต่อเนื่อง 18-20 นาที จังหวะเบา', sat: 'วิ่งต่อเนื่อง 25 นาที' },
  9: { tuethu: 'วิ่งต่อเนื่อง 20-22 นาที จังหวะเบา', sat: 'วิ่งต่อเนื่อง 28-30 นาที' },
  10: { tuethu: 'วิ่งต่อเนื่อง 22-25 นาที (1 วัน/สัปดาห์ สลับเป็น interval 400ม.เร็ว/400ม.เบา x5)', sat: 'วิ่งต่อเนื่อง 32-35 นาที' },
  11: { tuethu: 'วิ่งต่อเนื่อง 25 นาที + interval สัปดาห์ละครั้ง (400ม. x6)', sat: 'วิ่งต่อเนื่อง 35-38 นาที' },
  12: { tuethu: 'วิ่งต่อเนื่อง 28-30 นาที จังหวะเบา-ปานกลาง', sat: 'วิ่งต่อเนื่อง 40 นาที' },
  13: { tuethu: 'Tempo run 25 นาที (จังหวะปานกลาง-ค่อนข้างเร็ว)', sat: 'วิ่งต่อเนื่อง 45 นาที' },
  14: { tuethu: 'Interval 800ม. x4 (เร็ว สลับพักเดิน 2 นาที)', sat: 'วิ่งต่อเนื่อง 45-50 นาที' },
  15: { tuethu: 'Tempo run 30 นาที', sat: 'วิ่งต่อเนื่อง 50 นาที (จุดพีคของโปรแกรม)' },
  16: { tuethu: 'Deload: วิ่งเบา 20 นาทีเท่านั้น', sat: 'Deload: วิ่งเบา 20-25 นาที แล้วประเมินร่างกายใหม่' }
};

// เฟส 1 (สัปดาห์ 1-4) — ดัมเบลแนะนำ: ท่า press/row 4-8 กก./ข้าง, squat/lunge 6-10 กก./ข้าง
const CORE_P1 = 'ปิดท้ายแกนกลาง: Plank 3x20-30วิ, Dead bug 2x10/ข้าง, Bicycle crunch 2x15/ข้าง';
const DAY_P1 = 'เวทเต็มตัว ผสมดัมเบล (ทำแบบเดียวกันได้ทั้ง จ./พ./ศ.) 3 รอบ พัก 60-90วิ/ท่า พัก 2 นาที/รอบ:\n' +
  '• Incline/Knee push-up 3x10-12\n• Goblet squat (ถือดัมเบล 1 ลูกแนบอก) 3x15\n• Dumbbell reverse lunge (ถือดัมเบลข้างละมือ) 3x10/ขา\n• Dumbbell bent-over row 3x12\n• Dumbbell glute bridge (วางดัมเบลบนสะโพก) 3x15\n' +
  CORE_P1 + '\nเป้าหมาย: ทำครบทุกวัน ฟอร์มถูกต้องสำคัญกว่าน้ำหนัก — เดือนแรกใช้ดัมเบลเบาสุดไปก่อน';

// เฟส 2 (สัปดาห์ 5-8) — ดัมเบลแนะนำ: press/row 6-10 กก./ข้าง, squat/lunge 8-14 กก./ข้าง, RDL/deadlift 10-16 กก./ข้าง
const CORE_P2 = 'ปิดท้ายแกนกลาง: Side plank 3x20-30วิ/ข้าง, Leg raise 3x12, Russian twist 3x20 ครั้งรวม';
const DAY_A_P2 = 'วัน Push เน้น (4 รอบ พัก 45-60วิ):\n• Dumbbell shoulder press 4x10-12\n• Standard/Knee push-up 3x12-15\n• Dumbbell floor press 3x10-12\n' + CORE_P2;
const DAY_B_P2 = 'วัน ขา/สะโพก เน้น (4 รอบ พัก 45-60วิ):\n• Goblet squat 4x12\n• Dumbbell walking lunge 3x12/ขา\n• Dumbbell Romanian deadlift (RDL) 3x12\n' + CORE_P2;
const DAY_C_P2 = 'วัน Pull/หลัง เน้น (4 รอบ พัก 45-60วิ):\n• Dumbbell bent-over row 4x12\n• Dumbbell deadlift 3x10\n• Renegade row (แพลงค์สลับดึงดัมเบลขึ้น) 3x8/ข้าง\n' + CORE_P2;
const PHASE2_EXTRA = 'เคล็ดลับสัปดาห์นี้: เพิ่ม metabolic finisher 1 ครั้ง/สัปดาห์ต่อท้ายวันเวท — Dumbbell swing 15 ครั้ง, High knees 30วิ, Squat jump 10 ทำ 4 รอบ พัก 30วิ';

// เฟส 3 (สัปดาห์ 9-12) — ดัมเบลแนะนำ: press/row 8-12 กก./ข้าง, squat/lunge 10-18 กก./ข้าง, RDL/deadlift 14-20 กก./ข้าง
const CORE_P3 = 'ปิดท้ายแกนกลาง: Hollow hold 3x30วิ, V-up 3x12, Side plank hip dip 3x10/ข้าง, Reverse crunch 3x15';
const DAY_A_P3 = 'วัน Push + แกนกลาง (5 รอบ พัก 30-45วิ):\n• Dumbbell shoulder press 4x10-12\n• Diamond push-up (หรือ standard) 3x10-12\n• Dumbbell floor press (จังหวะช้าลง) 4x10\n' + CORE_P3;
const DAY_B_P3 = 'วัน ขา หนักขึ้น (5 รอบ พัก 30-45วิ):\n• Bulgarian split squat ถือดัมเบลข้างละมือ 4x10/ขา\n• Dumbbell Romanian deadlift 4x10\n• Goblet squat (น้ำหนักเพิ่มขึ้น) 3x15\n' + CORE_P3;
const DAY_C_P3 = 'วัน Pull/หลัง + Core (5 รอบ พัก 30-45วิ):\n• Dumbbell deadlift 4x10\n• Dumbbell bent-over row (ค้างท็อป 1 วิ) 4x12\n• Renegade row 4x8/ข้าง\n' + CORE_P3;
const DAY_D_P3 = 'วัน D (ถ้าไหว) Full body circuit เบา:\n• Dumbbell goblet squat 3x12\n• Dumbbell row 3x12\n• Plank 3x30วิ';
const PHASE3_EXTRA = 'เคล็ดลับสัปดาห์นี้: 2 ครั้ง/สัปดาห์ เพิ่ม HIIT finisher 10 นาที (ทำงาน 40วิ/พัก 20วิ x8 รอบ สลับ dumbbell swing/jump lunge/high knees/mountain climber)';

// เฟส 4 (สัปดาห์ 13-16) — ดัมเบลแนะนำ: press/row 8-14 กก./ข้าง, squat/lunge 12-20 กก./ข้าง, RDL/deadlift 16-24 กก./ข้าง
const DAY_ALL_P4 = 'ซูเปอร์เซ็ตเต็มตัว ผสมดัมเบล (5-6 รอบ พัก 20-30วิ):\n• Dumbbell thruster (squat + press ต่อเนื่อง) 5x10\n• Bulgarian split squat / Dumbbell RDL สลับกันคนละวัน 5x10/ขา\n• Dumbbell bent-over row + renegade row สลับกัน 5x12\n• HIIT finisher 10-12 นาที (40วิทำงาน/20วิพัก x10, ใส่ dumbbell swing เข้าไปในรอบด้วยได้)';
const DAY_ALL_P4_DELOAD = 'สัปดาห์ Deload: ทำท่าเดิมทั้งหมดแต่ลดเซ็ต/ครั้งลง 40-50% (2 x reps เดิม) และลดน้ำหนักดัมเบลลง 1-2 ระดับจากที่ใช้ปกติ เน้นยืดเหยียด เดินเบาๆ พักฟื้น\nแกนกลาง: เลือก 3 ท่าจาก Hollow hold/V-up/Side plank hip dip/Plank ทำ 1-2 รอบ';

const REST_NOTE = 'พักผ่อน หรือยืดเหยียด/เดินเบาๆ (ถ้าไหวเพิ่มแกนกลางลำตัวเบาๆ ได้)';

const PHASE_START_NOTES = {
  1: '🔰 เริ่มเฟส 1: ปูพื้นฐาน — เน้นทำครบทุกวัน ฟอร์มถูกต้องสำคัญกว่าหนัก',
  5: '📈 เริ่มเฟส 2: เพิ่มวอลุ่ม — เริ่มแบ่ง Push/ขา/Pull ชัดเจนขึ้น',
  9: '⚠️ เริ่มเฟส 3: เพิ่มความหนัก — ถ้ามีคอเลสเตอรอลสูงหรือยังไม่เคยตรวจร่างกาย แนะนำปรึกษาแพทย์ก่อนเข้าเฟสนี้ หากเจ็บ/แน่นหน้าอก เวียนหัวรุนแรง ให้หยุดทันที',
  13: '🏁 เริ่มเฟส 4: พีค + Deload (สัปดาห์ 16) — ฟังร่างกายตัวเองเป็นหลัก ไม่ต้องฝืนถ้ายังไม่พร้อม'
};

// แผนอาหาร 30 วัน หมุนเวียน (lunch, dinner, kcal รวม, โปรตีนรวม, ต้องทำ batch ใหม่ไหม)
const DIET_30 = [
  { lunch: 'ทูน่า', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2240, protein: 158, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2170, protein: 143, batch: false },
  { lunch: 'ทูน่า', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2240, protein: 158, batch: false },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2170, protein: 143, batch: false },
  { lunch: 'ทูน่า', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2230, protein: 153, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2160, protein: 138, batch: false },
  { lunch: 'ทูน่า', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2230, protein: 153, batch: false },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2160, protein: 138, batch: false },
  { lunch: 'ทูน่า', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2130, protein: 152, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2060, protein: 137, batch: false },
  { lunch: 'ทูน่า', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2130, protein: 152, batch: false },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2060, protein: 137, batch: false },
  { lunch: 'ทูน่า', dinner: 'สปาเกตตี้อกไก่สับซอสมะเขือเทศ', kcal: 2230, protein: 149, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'สปาเกตตี้อกไก่สับซอสมะเขือเทศ', kcal: 2160, protein: 134, batch: false },
  { lunch: 'ทูน่า', dinner: 'สปาเกตตี้อกไก่สับซอสมะเขือเทศ', kcal: 2230, protein: 149, batch: false },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'สปาเกตตี้อกไก่สับซอสมะเขือเทศ', kcal: 2160, protein: 134, batch: false },
  { lunch: 'ทูน่า', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2240, protein: 158, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2170, protein: 143, batch: false },
  { lunch: 'ทูน่า', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2240, protein: 158, batch: false },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'อกไก่พริกไทยดำ + ข้าวกล้อง + เห็ดผัด', kcal: 2170, protein: 143, batch: false },
  { lunch: 'ทูน่า', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2230, protein: 153, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2160, protein: 138, batch: false },
  { lunch: 'ทูน่า', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2230, protein: 153, batch: false },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ปลานึ่ง/ปลาทับทิม + ข้าวกล้อง + ถั่วลูกไก่ต้ม', kcal: 2160, protein: 138, batch: false },
  { lunch: 'ทูน่า', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2130, protein: 152, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2060, protein: 137, batch: false },
  { lunch: 'ทูน่า', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2130, protein: 152, batch: false },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'ไข่ขาวตุ๋น/เจียว 3 ฟอง + ข้าวกล้อง + ทูน่าในน้ำแร่', kcal: 2060, protein: 137, batch: false },
  { lunch: 'ทูน่า', dinner: 'สปาเกตตี้อกไก่สับซอสมะเขือเทศ', kcal: 2230, protein: 149, batch: true },
  { lunch: 'ไข่ขาว 3 ฟอง', dinner: 'สปาเกตตี้อกไก่สับซอสมะเขือเทศ', kcal: 2160, protein: 134, batch: false }
];

function getWeightDay(phase, weekNumber, weekdayKey) {
  if (phase === 1) {
    return weekdayKey === 'sun' ? REST_NOTE : DAY_P1;
  }
  if (phase === 2) {
    if (weekdayKey === 'mon') return DAY_A_P2;
    if (weekdayKey === 'wed') return DAY_B_P2;
    if (weekdayKey === 'fri') return DAY_C_P2;
    return REST_NOTE + '\n\n' + PHASE2_EXTRA;
  }
  if (phase === 3) {
    if (weekdayKey === 'mon') return DAY_A_P3;
    if (weekdayKey === 'wed') return DAY_B_P3;
    if (weekdayKey === 'fri') return DAY_C_P3;
    return DAY_D_P3 + '\n\n' + PHASE3_EXTRA;
  }
  // phase 4
  if (weekNumber === 16) {
    return weekdayKey === 'sun' ? REST_NOTE : DAY_ALL_P4_DELOAD;
  }
  return weekdayKey === 'sun' ? REST_NOTE : DAY_ALL_P4;
}

module.exports = {
  PLAN_HEIGHT_CM, PLAN_AGE, PLAN_GENDER, PLAN_ACTIVITY_LEVEL, PLAN_TARGET_WEIGHT,
  PLAN_CALORIE_MIN, PLAN_CALORIE_MAX, PLAN_PROTEIN_MIN, PLAN_PROTEIN_MAX,
  RUN_PLAN, DIET_30, PHASE_START_NOTES, getWeightDay
};
