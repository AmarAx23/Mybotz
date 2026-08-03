const crypto = require('crypto');

const LINE_API_BASE = 'https://api.line.me/v2/bot/message';

function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true; // ถ้ายังไม่ได้ตั้งค่า secret ข้ามการตรวจสอบ (ไม่แนะนำใน production)
  if (!signature) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return hash === signature;
}

async function callLineApi(path, payload) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const res = await fetch(`${LINE_API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('LINE API error:', res.status, text);
  }
}

async function replyMessage(replyToken, messages) {
  return callLineApi('reply', { replyToken, messages });
}

async function pushMessage(userId, messages) {
  return callLineApi('push', { to: userId, messages });
}

module.exports = { verifySignature, replyMessage, pushMessage };
