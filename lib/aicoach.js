// โค้ชประจำสัปดาห์แบบเขียนเป็นภาษาคน: ให้ AI สรุปจากข้อความตัวเลขที่บอทคำนวณไว้แล้ว (ตัวเลขเป็นของบอท AI แค่เรียบเรียง)
const { aiConfigured, askClaude } = require('./ai');
const { buildUserContext } = require('./aicontext');

const SYSTEM =
  'You are a warm, honest weight-loss coach inside a LINE bot, writing in friendly Thai. ' +
  'You get DATA about one user and the bot\'s own WEEKLY REPORT (numbers computed by the bot). ' +
  'Write a short coach note of 3-5 lines: name 1-2 specific things they did well this week (only if the data shows it), ' +
  'then 1-2 concrete, small actions for next week. Do NOT repeat every number, do not contradict the report, never invent data, ' +
  'no medical claims, no guilt or shaming. If data is sparse, encourage logging a little more. ' +
  'Plain text only, no markdown, no headings, under 450 characters.';

async function buildCoachNarrative(userId, reportText) {
  if (!aiConfigured()) return null;
  const data = await buildUserContext(userId);
  const out = await askClaude({
    system: SYSTEM,
    user: `DATA:\n${data}\n\nWEEKLY REPORT:\n${String(reportText).slice(0, 2500)}`,
    maxTokens: 400,
    timeoutMs: 15000
  });
  const text = out.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim().slice(0, 600);
  return text.length >= 20 ? text : null;
}

module.exports = { buildCoachNarrative };
