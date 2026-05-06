module.exports = async (req, res) => {
  const SITE_PASSWORD = process.env.SITE_PASSWORD;
  const authHeader = req.headers['x-wt-token'] || '';

  if (!SITE_PASSWORD || !authHeader) {
    return res.status(401).json({ ok: false });
  }

  const expected = 'wt_' + Buffer.from(SITE_PASSWORD).toString('base64');

  if (authHeader !== expected) {
    return res.status(401).json({ ok: false });
  }

  res.status(200).json({ ok: true });
};
