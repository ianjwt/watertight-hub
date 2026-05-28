export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  const REPO  = 'ianjwt/watertight-hub';
  const FILE  = 'data/clients.json';
  const API   = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

  try {
    if (req.method === 'GET') {
      const fileRes  = await fetch(API, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const fileData = await fileRes.json();
      if (!fileRes.ok) throw new Error(fileData.message || 'GitHub API error');
      const decoded  = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');
      const parsed   = JSON.parse(decoded);
      return res.status(200).json(parsed);
    }

    if (req.method === 'POST') {
      const { action, clients } = req.body || {};
      if (action !== 'save') return res.status(400).json({ error: 'Invalid action' });

      // Get current SHA
      const getRes  = await fetch(API, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const getData = await getRes.json();
      if (!getRes.ok) throw new Error(getData.message || 'GitHub GET failed');
      const sha = getData.sha;

      const content = Buffer.from(JSON.stringify({ clients }, null, 2)).toString('base64');

      const putRes  = await fetch(API, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update client config', content, sha })
      });
      const putData = await putRes.json();
      if (!putRes.ok) throw new Error(putData.message || 'GitHub PUT failed');

      return res.status(200).json({ success: true });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
