// Daily Vercel Cron job (see vercel.json, 9am ET) — flags stale creatives to Slack.
// Runs once/day, not hourly, because Vercel's Hobby plan rejects more-frequent cron schedules.
// No-ops cleanly (no GitHub reads, no writes) when SLACK_EDIT_TRACKER_WEBHOOK_URL isn't set yet.

import { githubGetJson, githubUpdateJson } from './_lib/github-json.js';

const CREATIVES_PATH = 'data/edit-tracker-creatives.json';
const STATUSES_PATH  = 'data/edit-tracker-statuses.json';
const ROSTER_PATH     = 'data/edit-tracker-roster.json';

const ROLE_LABELS = {
  creative_strategist: 'Creative Strategist',
  editor:               'Editor',
  reviewer:             'Reviewer',
};

// Don't re-alert on the same stale status more than once per this window.
const REPEAT_HOURS = 24;

function ownerPerson(ownerRole, creative, roster) {
  if (ownerRole === 'editor')   return creative.editor   || roster.find(p => p.role === 'editor')?.name   || null;
  if (ownerRole === 'reviewer') return creative.reviewer || roster.find(p => p.role === 'reviewer')?.name || null;
  if (ownerRole === 'creative_strategist') {
    return creative.briefedBy || roster.find(p => p.role === 'creative_strategist')?.name || null;
  }
  return null;
}

function hoursSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

async function postToSlack(webhookUrl, stale) {
  const lines = stale.map(({ creative, statusLabel, hours, owner, ownerLabel }) => {
    const who = owner ? `${ownerLabel} (${owner})` : ownerLabel;
    return `• *${creative.name}* (${creative.client}) — _${statusLabel}_, ${Math.round(hours)}h — ${who}`;
  });
  const text = `⏳ *Edit Tracker: ${stale.length} item${stale.length === 1 ? '' : 's'} stale*\n${lines.join('\n')}`;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed ${res.status}: ${body}`);
  }
}

export default async function handler(req, res) {
  const webhookUrl = process.env.SLACK_EDIT_TRACKER_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(200).json({ ok: true, skipped: 'SLACK_EDIT_TRACKER_WEBHOOK_URL not set' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.GITHUB_TOKEN;
  let step = 'start';

  try {
    step = 'load-config';
    const [{ content: statusData }, { content: rosterData }, { content: creativeData }] = await Promise.all([
      githubGetJson(STATUSES_PATH, token),
      githubGetJson(ROSTER_PATH, token),
      githubGetJson(CREATIVES_PATH, token),
    ]);

    const statusByKey = Object.fromEntries(statusData.statuses.map(s => [s.key, s]));
    const roster       = rosterData.people || [];
    const creatives     = creativeData.creatives || [];

    step = 'compute-staleness';
    const toAlert = [];
    for (const creative of creatives) {
      const statusCfg = statusByKey[creative.status];
      if (!statusCfg || statusCfg.thresholdHours == null) continue; // terminal/paused — never alerts

      const hours = hoursSince(creative.statusUpdatedAt);
      if (hours < statusCfg.thresholdHours) continue;

      const alertState = creative.alertState || {};
      const alreadyAlertedThisStatus = alertState.lastAlertedStatus === creative.status;
      const dueForRepeat = !alertState.lastAlertedAt || hoursSince(alertState.lastAlertedAt) >= REPEAT_HOURS;

      if (alreadyAlertedThisStatus && !dueForRepeat) continue;

      toAlert.push({
        creative,
        statusLabel: statusCfg.label,
        hours,
        owner:      ownerPerson(statusCfg.ownerRole, creative, roster),
        ownerLabel: ROLE_LABELS[statusCfg.ownerRole] || statusCfg.ownerRole,
      });
    }

    if (toAlert.length === 0) {
      return res.status(200).json({ ok: true, alerted: 0 });
    }

    step = 'post-slack';
    await postToSlack(webhookUrl, toAlert);

    step = 'write-alert-state';
    const now = new Date().toISOString();
    const alertedIds = new Set(toAlert.map(a => a.creative.id));
    await githubUpdateJson(CREATIVES_PATH, token, (data) => {
      data.creatives = (data.creatives || []).map(c => {
        if (!alertedIds.has(c.id)) return c;
        return { ...c, alertState: { lastAlertedStatus: c.status, lastAlertedAt: now } };
      });
      return data;
    }, `Edit Tracker: record staleness alerts (${toAlert.length})`);

    return res.status(200).json({ ok: true, alerted: toAlert.length });

  } catch (err) {
    console.error('[edit-tracker-alerts] error at step', step, err);
    return res.status(err.status || 500).json({ error: err.message, step });
  }
}
