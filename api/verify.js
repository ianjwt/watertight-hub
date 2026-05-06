const cookie = require('cookie');
const crypto = require('crypto');

module.exports = async (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.wt_session;

  const SITE_PASSWORD = process.env.SITE_PASSWORD;
  const secret = process.env.SESSION_SECRET || SITE_PASSWORD;

  if (!SITE_PASSWORD || !token) {
    return res.status(401).json({ ok: false });
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(SITE_PASSWORD)
    .digest('hex');

  if (token !== expected) {
    return res.status(401).json({ ok: false });
  }

  res.status(200).json({ ok: true });
};
