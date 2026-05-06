const cookie = require('cookie');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => body += chunk);
    req.on('end', resolve);
  });

  let password;
  try {
    password = JSON.parse(body).password;
  } catch {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const SITE_PASSWORD = process.env.SITE_PASSWORD;
  if (!SITE_PASSWORD) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  if (password !== SITE_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Create a signed token: sha256(password + secret)
  const secret = process.env.SESSION_SECRET || SITE_PASSWORD;
  const token = crypto
    .createHmac('sha256', secret)
    .update(SITE_PASSWORD)
    .digest('hex');

  const serialized = cookie.serialize('wt_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  res.setHeader('Set-Cookie', serialized);
  res.status(200).json({ ok: true });
};
