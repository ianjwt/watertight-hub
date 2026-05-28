export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  const REPO  = 'ianjwt/watertight-hub';
  const FILE  = 'data/clients.json';
  const API   = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    let step = 'fetch';
    try {
      const fileRes = await fetch(API, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      step = 'parse-json';
      const fileData = await fileRes.json();

      if (fileRes.status === 401) {
        console.error('[client-config] GET 401 — token present:', !!token);
        return res.status(401).json({ error: 'GitHub token not configured or invalid' });
      }
      if (!fileRes.ok) {
        console.error('[client-config] GET non-2xx:', fileRes.status, JSON.stringify(fileData));
        return res.status(502).json({
          error:   `GitHub API error ${fileRes.status}`,
          detail:  fileData.message || null,
          ghStatus: fileRes.status,
        });
      }

      if (!fileData.content) {
        console.error('[client-config] GET — no content field in response:', JSON.stringify(fileData).slice(0, 300));
        return res.status(502).json({
          error:  'GitHub response missing content field',
          detail: JSON.stringify(fileData).slice(0, 500),
        });
      }

      step = 'decode-base64';
      const decoded = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

      step = 'parse-json-content';
      const parsed = JSON.parse(decoded);

      return res.status(200).json(parsed);

    } catch (err) {
      console.error('[client-config] GET error at step', step, err);
      return res.status(500).json({
        error: err.message,
        stack: err.stack,
        step,
      });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let step = 'parse-body';
    try {
      const { action, clients } = req.body || {};
      if (action !== 'save') return res.status(400).json({ error: 'Invalid action' });

      // Get current SHA
      step = 'get-sha';
      const getRes  = await fetch(API, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const getData = await getRes.json();

      if (getRes.status === 401) {
        console.error('[client-config] POST get-SHA 401 — token present:', !!token);
        return res.status(401).json({ error: 'GitHub token not configured or invalid' });
      }
      if (!getRes.ok) {
        console.error('[client-config] POST get-SHA failed:', getRes.status, JSON.stringify(getData));
        return res.status(502).json({
          error:    `GitHub GET failed ${getRes.status}`,
          detail:   getData.message || null,
          ghStatus: getRes.status,
        });
      }

      step = 'put';
      const sha     = getData.sha;
      const content = Buffer.from(JSON.stringify({ clients }, null, 2)).toString('base64');

      const putRes  = await fetch(API, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update client config', content, sha })
      });
      const putData = await putRes.json();

      if (!putRes.ok) {
        console.error('[client-config] PUT failed:', putRes.status, JSON.stringify(putData));
        return res.status(502).json({
          error:    `GitHub PUT failed ${putRes.status}`,
          detail:   putData.message || null,
          ghStatus: putRes.status,
        });
      }

      return res.status(200).json({ success: true });

    } catch (err) {
      console.error('[client-config] POST error at step', step, err);
      return res.status(500).json({
        error: err.message,
        stack: err.stack,
        step,
      });
    }
  }
}
