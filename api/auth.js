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

  res.status(200).json({ ok: true, token: 'wt_' + Buffer.from(SITE_PASSWORD).toString('base64') });
};
