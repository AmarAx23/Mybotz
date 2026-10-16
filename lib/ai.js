// ตัวช่วยเรียก Claude API (ข้อความล้วน) ใช้ร่วมกันทั้งแชทภาษาธรรมดา โค้ชรายสัปดาห์
// ต้องตั้ง ANTHROPIC_API_KEY ใน Vercel (ไม่ตั้ง = ฟีเจอร์ AI ทั้งหมดปิด บอทใช้คำสั่งปกติได้เหมือนเดิม)

function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function askClaude({ system, user, maxTokens, timeoutMs }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: maxTokens || 500,
      system,
      messages: [{ role: 'user', content: user }]
    }),
    signal: AbortSignal.timeout(timeoutMs || 15000)
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
}

module.exports = { aiConfigured, askClaude };
