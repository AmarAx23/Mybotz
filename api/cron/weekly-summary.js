const { pushMessage } = require('../../lib/line');
const { getAllUsers } = require('../../lib/users');
const { getUserLogs, buildSummaryMessage } = require('../../lib/weight');

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers['authorization'];
  return auth === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const users = await getAllUsers();
  let sent = 0;

  for (const user of users) {
    if (!user.user_id) continue;
    try {
      const logs = await getUserLogs(user.user_id, 1);
      if (logs.length === 0) continue; // ยังไม่เคยบันทึกอะไรเลย ข้ามไป
      const summary = await buildSummaryMessage(user.user_id);
      await pushMessage(user.user_id, [{ type: 'text', text: '📅 สรุปประจำสัปดาห์\n\n' + summary.text }]);
      sent++;
    } catch (err) {
      console.error('weekly-summary error for', user.user_id, err);
    }
  }

  res.status(200).json({ status: 'ok', sent });
};
