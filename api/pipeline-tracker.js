// Serves synced Pipeline Tracker data to the frontend. Read-only — no POST/write actions,
// per spec (all writes happen server-side in api/pipeline-sync.js).

import { githubGetJson } from './_lib/github-json.js';

const CLIENT_FILES = {
  evolv: 'data/pipeline-tracker-evolv.json',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = String(req.query.client || 'evolv').toLowerCase();
  const path = CLIENT_FILES[client];
  if (!path) {
    return res.status(400).json({ error: `Unknown client: ${client}` });
  }

  const token = process.env.GITHUB_TOKEN;

  try {
    const { content } = await githubGetJson(path, token);
    return res.status(200).json(content);
  } catch (err) {
    console.error('[pipeline-tracker] error', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}
