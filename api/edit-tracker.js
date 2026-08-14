import { githubGetJson, githubUpdateJson } from './_lib/github-json.js';

const CREATIVES_PATH = 'data/edit-tracker-creatives.json';
const CLIENTS_PATH    = 'data/edit-tracker-clients.json';
const STATUSES_PATH   = 'data/edit-tracker-statuses.json';

const BLOCKED_CLIENTS = new Set(['cuyama buckhorn']);

function isBlockedClient(name) {
  return BLOCKED_CLIENTS.has(String(name || '').trim().toLowerCase());
}

function slugify(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function makeId(name) {
  return `${slugify(name) || 'creative'}-${Date.now().toString(36).slice(-5)}`;
}

async function validateClient(token, client) {
  if (isBlockedClient(client)) {
    const err = new Error('Cuyama Buckhorn is not a valid client for this app');
    err.status = 400;
    throw err;
  }
  const { content } = await githubGetJson(CLIENTS_PATH, token);
  const known = (content.clients || []).map(c => c.toLowerCase());
  if (!known.includes(String(client || '').toLowerCase())) {
    const err = new Error(`Unknown client: ${client}`);
    err.status = 400;
    throw err;
  }
}

async function validateStatus(token, status) {
  const { content } = await githubGetJson(STATUSES_PATH, token);
  const known = (content.statuses || []).map(s => s.key);
  if (!known.includes(status)) {
    const err = new Error(`Unknown status: ${status}`);
    err.status = 400;
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  let step = 'start';

  try {
    // ── GET ────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      step = 'get-creatives';
      const { content } = await githubGetJson(CREATIVES_PATH, token);
      return res.status(200).json(content);
    }

    // ── POST ───────────────────────────────────────────────────────────────
    const { action } = req.body || {};

    if (action === 'create') {
      step = 'validate-create';
      const { name, client, platformType, editor, reviewer, internalNotes } = req.body;
      if (!name || !name.trim())       return res.status(400).json({ error: 'name is required' });
      if (!client)                     return res.status(400).json({ error: 'client is required' });
      if (platformType !== 'video' && platformType !== 'image') {
        return res.status(400).json({ error: 'platformType must be "video" or "image"' });
      }
      await validateClient(token, client);

      const now = new Date().toISOString();
      const creative = {
        id:              makeId(name),
        name:            name.trim(),
        client,
        platformType,
        status:          'needs_brief',
        statusUpdatedAt: now,
        editor:          editor || null,
        reviewer:        reviewer || null,
        briefedBy:       null,
        briefedAt:       null,
        currentLink:     null,
        internalNotes:   internalNotes || '',
        alertState:      { lastAlertedStatus: null, lastAlertedAt: null },
      };

      step = 'write-create';
      await githubUpdateJson(CREATIVES_PATH, token, (data) => {
        data.creatives = [...(data.creatives || []), creative];
        return data;
      }, `Edit Tracker: add creative "${creative.name}"`);

      return res.status(200).json({ success: true, creative });
    }

    if (action === 'transition') {
      step = 'validate-transition';
      const { id, toStatus, briefedBy } = req.body;
      if (!id)       return res.status(400).json({ error: 'id is required' });
      if (!toStatus) return res.status(400).json({ error: 'toStatus is required' });
      await validateStatus(token, toStatus);
      if (toStatus === 'briefed' && !briefedBy) {
        return res.status(400).json({ error: 'briefedBy is required when transitioning to Briefed' });
      }

      step = 'write-transition';
      let updatedCreative = null;
      const now = new Date().toISOString();
      await githubUpdateJson(CREATIVES_PATH, token, (data) => {
        const list = data.creatives || [];
        const idx  = list.findIndex(c => c.id === id);
        if (idx === -1) { const e = new Error('Creative not found'); e.status = 404; throw e; }

        const c = { ...list[idx], status: toStatus, statusUpdatedAt: now };
        c.alertState = { lastAlertedStatus: null, lastAlertedAt: null };
        if (toStatus === 'briefed') {
          c.briefedBy = briefedBy;
          c.briefedAt = now;
        }
        list[idx] = c;
        updatedCreative = c;
        data.creatives = list;
        return data;
      }, `Edit Tracker: transition ${id} → ${toStatus}`);

      return res.status(200).json({ success: true, creative: updatedCreative });
    }

    if (action === 'updateFields') {
      step = 'validate-updateFields';
      const { id, fields } = req.body;
      if (!id)     return res.status(400).json({ error: 'id is required' });
      if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields is required' });
      if (fields.platformType && fields.platformType !== 'video' && fields.platformType !== 'image') {
        return res.status(400).json({ error: 'platformType must be "video" or "image"' });
      }
      if (fields.client) await validateClient(token, fields.client);

      const ALLOWED = ['name', 'client', 'platformType', 'editor', 'reviewer', 'currentLink', 'internalNotes'];
      const patch = {};
      for (const key of ALLOWED) if (key in fields) patch[key] = fields[key];

      step = 'write-updateFields';
      let updatedCreative = null;
      await githubUpdateJson(CREATIVES_PATH, token, (data) => {
        const list = data.creatives || [];
        const idx  = list.findIndex(c => c.id === id);
        if (idx === -1) { const e = new Error('Creative not found'); e.status = 404; throw e; }

        const c = { ...list[idx], ...patch };
        list[idx] = c;
        updatedCreative = c;
        data.creatives = list;
        return data;
      }, `Edit Tracker: update ${id}`);

      return res.status(200).json({ success: true, creative: updatedCreative });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (err) {
    console.error('[edit-tracker] error at step', step, err);
    return res.status(err.status || 500).json({ error: err.message, step });
  }
}
