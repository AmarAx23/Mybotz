// สร้างเมนูใต้แชท (Rich Menu) 6 ปุ่ม แล้วตั้งเป็นค่าเริ่มต้นสำหรับทุกคน
// เรียกจากคำสั่ง "ตั้งเมนู" (เฉพาะแอดมิน) รันซ้ำได้ จะลบเมนูเดิมของบอทแล้วสร้างใหม่
const IMAGE_BASE64 = require('./richmenu-image');

const API = 'https://api.line.me/v2/bot';
const MENU_NAME = 'weightbot-main';

const BUTTONS = [
  { label: 'วันนี้', text: 'วันนี้' },
  { label: 'ก้าววันนี้', text: 'เดิน' },
  { label: 'มื้อวันนี้', text: 'มื้อวันนี้' },
  { label: 'เป้าแคลอรี่', text: 'เป้าแคลอรี่' },
  { label: 'กราฟ', text: 'กราฟ' },
  { label: 'วิธีใช้', text: 'ช่วยเหลือ' }
];

async function line(method, url, body, headers) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, ...(headers || {}) },
    body
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE ${method} ${url.replace(/^https:\/\/[^/]+/, '')} -> ${res.status}: ${text.slice(0, 150)}`);
  return text ? JSON.parse(text) : {};
}

async function setupRichMenu() {
  const list = await line('GET', `${API}/richmenu/list`);
  for (const m of list.richmenus || []) {
    if (m.name === MENU_NAME) await line('DELETE', `${API}/richmenu/${m.richMenuId}`);
  }

  const colW = [833, 833, 834];
  const areas = BUTTONS.map((b, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      bounds: { x: colW.slice(0, col).reduce((a, n) => a + n, 0), y: row * 843, width: colW[col], height: 843 },
      action: { type: 'message', label: b.label, text: b.text }
    };
  });

  const created = await line('POST', `${API}/richmenu`, JSON.stringify({
    size: { width: 2500, height: 1686 }, selected: true, name: MENU_NAME, chatBarText: 'เมนู', areas
  }), { 'Content-Type': 'application/json' });
  const id = created.richMenuId;

  await line('POST', `https://api-data.line.me/v2/bot/richmenu/${id}/content`,
    Buffer.from(IMAGE_BASE64, 'base64'), { 'Content-Type': 'image/png' });
  await line('POST', `${API}/user/all/richmenu/${id}`);
  return id;
}

module.exports = { setupRichMenu, BUTTONS };
