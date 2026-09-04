// Pipeline Tracker sync — v1, Evolv only (see pipeline-tracker-v1-spec.md).
// Runs on a daily Vercel Cron (see vercel.json) and is also safe to hit manually.
//
// Reads 3 Google Sheets (Pitch Tracker, Whitelisting, Results Tracker) via the same
// service-account JWT pattern as api/sheets-proxy.js, reads the existing Edit Tracker
// GitHub-JSON for stages 4-5 (no new integration for those), joins everything on a
// canonical influencer name (data/pipeline-tracker-aliases.json), and commits one JSON
// file per client via the GitHub Contents API — same commit-as-database pattern as
// Edit Tracker (api/_lib/github-json.js).

import { google } from 'googleapis';
import { githubGetJson, githubUpdateJson } from './_lib/github-json.js';

const CONFIG_PATH    = 'data/pipeline-tracker-config.json';
const ALIASES_PATH   = 'data/pipeline-tracker-aliases.json';
const CREATIVES_PATH = 'data/edit-tracker-creatives.json';

const STAGE_ORDER = [
  'briefed', 'created', 'live_organic',
  'edited_for_paid', 'shared_with_client',
  'launched_in_paid', 'performing_in_paid',
];

const EDIT_TRACKER_EDITED_STATUSES = new Set([
  'in_edit', 'ready_for_review', 'ready_for_client', 'client_requested_changes', 'live',
]);
const EDIT_TRACKER_SHARED_STATUSES = new Set(['ready_for_client', 'live']);

// ── Sheets client ────────────────────────────────────────────────────────────

function sheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function getValues(sheets, sheetId, range) {
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  return data.values || [];
}

// ── Name canonicalization ────────────────────────────────────────────────────

function buildAliasLookup(aliasesDoc) {
  const lookup = new Map(); // normalized variant -> canonical
  for (const entry of aliasesDoc.aliases || []) {
    for (const variant of entry.variants || []) {
      lookup.set(normName(variant), entry.canonical);
    }
    lookup.set(normName(entry.canonical), entry.canonical);
  }
  return lookup;
}

// Reverse of buildAliasLookup: canonical -> all known variant strings (incl. itself).
// Used for best-effort substring matching against free-text ad/whitelisting names
// (see textMatchesCanonical) rather than exact-match canonicalization.
function buildVariantsByCanonical(aliasesDoc) {
  const map = new Map();
  for (const entry of aliasesDoc.aliases || []) {
    map.set(entry.canonical, [entry.canonical, ...(entry.variants || [])]);
  }
  return map;
}

function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonicalize(rawName, aliasLookup) {
  const norm = normName(rawName);
  return aliasLookup.get(norm) || String(rawName || '').trim();
}

// Distinctive (len >= 4) tokens from a name/variant, for fuzzy substring matching
// against free-text titles like ad names or whitelisting-sheet entries. Every token
// gets checked against EVERY row/creative for EVERY known influencer, so prefer
// distinctive nicknames/handles as alias variants (e.g. "SAHD") over generic
// multi-word phrases (e.g. "Stay at Home Daughter") — the latter's individual words
// ("stay", "home") are common enough to false-positive-match unrelated content.
function nameTokens(s) {
  return normName(s).split(/[^a-z0-9]+/).filter(t => t.length >= 4);
}

function buildMatchCandidates(canonical, variantsByCanonical) {
  const variants = variantsByCanonical.get(canonical) || [canonical];
  const candidates = new Set();
  for (const v of variants) {
    const norm = normName(v);
    if (norm) candidates.add(norm);
    for (const tok of nameTokens(v)) candidates.add(tok);
  }
  return candidates;
}

// Best-effort: true if `haystack` (a free-text ad/whitelisting-row name, often
// covering multiple influencers or using a handle/nickname) references `canonical`.
function textMatchesCanonical(haystack, canonical, variantsByCanonical) {
  const hay = normName(haystack);
  if (!hay) return false;
  for (const candidate of buildMatchCandidates(canonical, variantsByCanonical)) {
    if (hay.includes(candidate)) return true;
  }
  return false;
}

// ── Generic column helpers ───────────────────────────────────────────────────

function findCol(headerRow, matchFn) {
  return (headerRow || []).findIndex(h => matchFn(String(h || '').toLowerCase().trim()));
}

function isPopulated(val) {
  return val != null && String(val).trim() !== '';
}

// Best-effort: sheet date cells come through as "9/12/2025", or year-less "3/11"
// (common on the Pitch Tracker and Whitelisting sheets — quarterly/current-year
// context makes the year implicit to a human reader). `new Date("3/11")` does NOT
// fail — V8 silently defaults the missing year to 2001, corrupting the date. Treat
// bare M/D as the current year instead. Returns an ISO date or null if it still
// doesn't look like a date (e.g. "CCF/Brief Sent", "Story Set", "Yes").
function parseCellDate(val) {
  if (!isPopulated(val)) return null;
  let s = String(val).trim();
  if (/^\d{1,2}\/\d{1,2}$/.test(s)) s = `${s}/${new Date().getFullYear()}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function truthyFlag(val) {
  const s = normName(val);
  return s === 'yes' || s === 'y' || s === 'true' || s === 'live';
}

// Merges two { reached, date } stage entries for the same influencer/stage, keeping
// whichever side actually reached it and whichever has a known date — used when the
// same influencer shows up as "Confirmed" more than once (e.g. Pitch Tracker's main
// list vs. its outreach recap section) so a later, less-complete duplicate row can't
// blank out an earlier row's real Brief Sent / Content in Drive / Posted Content data.
function mergeStageField(prev, next) {
  if (!prev) return next;
  return { reached: prev.reached || next.reached, date: prev.date || next.date || null };
}

// ── Stage 1-3: Pitch Tracker ─────────────────────────────────────────────────

async function parsePitchTracker(sheets, cfg, aliasLookup, warnings) {
  if (!cfg.sheetId) {
    warnings.push('pitchTracker.sheetId not configured — stages 1-3 skipped');
    return new Map();
  }

  const rows = await getValues(sheets, cfg.sheetId, `${cfg.tabName}!A1:Z200`);
  if (rows.length < 2) {
    warnings.push('pitchTracker sheet returned no data rows');
    return new Map();
  }

  const headers = rows[0];
  const colName        = findCol(headers, h => h.includes('name'));
  const colStatus       = findCol(headers, h => h.includes('partnership status'));
  const colBriefSent    = findCol(headers, h => h.includes('brief sent'));
  const colContentDrive = findCol(headers, h => h.includes('content in drive'));
  const colPostedContent = findCol(headers, h => h.includes('posted content'));

  if ([colName, colStatus, colBriefSent, colContentDrive, colPostedContent].includes(-1)) {
    warnings.push('pitchTracker column mapping failed — check header names against the current-quarter sheet');
    return new Map();
  }

  const out = new Map(); // canonical name -> partial stage data

  for (const row of rows.slice(1)) {
    const nameVal = row[colName];
    if (!isPopulated(nameVal)) continue;
    const status = normName(row[colStatus]);
    if (status !== 'confirmed') continue; // Contacted / In Talks / Passed / Offer Out are outreach, not lifecycle

    const canonical = canonicalize(nameVal, aliasLookup);
    const briefSent = row[colBriefSent];
    const contentDrive = row[colContentDrive];
    const postedContent = row[colPostedContent];

    const rowEntry = {
      briefed:      { reached: isPopulated(briefSent),      date: parseCellDate(briefSent) },
      created:      { reached: isPopulated(contentDrive),   date: parseCellDate(contentDrive) },
      live_organic: { reached: isPopulated(postedContent),  date: parseCellDate(postedContent) },
      sourceLinks: {
        pitchTrackerContentLink: isPopulated(contentDrive) ? String(contentDrive) : null,
        pitchTrackerPostedLink:  isPopulated(postedContent) ? String(postedContent) : null,
      },
    };

    // Same influencer can appear "Confirmed" more than once (main list + outreach
    // recap section further down) — merge rather than let the later row win outright.
    const prev = out.get(canonical);
    out.set(canonical, prev ? {
      briefed:      mergeStageField(prev.briefed, rowEntry.briefed),
      created:      mergeStageField(prev.created, rowEntry.created),
      live_organic: mergeStageField(prev.live_organic, rowEntry.live_organic),
      sourceLinks: {
        pitchTrackerContentLink: prev.sourceLinks.pitchTrackerContentLink || rowEntry.sourceLinks.pitchTrackerContentLink,
        pitchTrackerPostedLink:  prev.sourceLinks.pitchTrackerPostedLink  || rowEntry.sourceLinks.pitchTrackerPostedLink,
      },
    } : rowEntry);
  }

  return out;
}

// ── Stage 4-5: Edit Tracker (existing GitHub-JSON, no new integration) ──────

async function loadEditTrackerStages(token, canonicalNames, variantsByCanonical, warnings) {
  let creatives;
  try {
    const { content } = await githubGetJson(CREATIVES_PATH, token);
    creatives = content.creatives || [];
  } catch (err) {
    warnings.push(`Edit Tracker read failed: ${err.message}`);
    return new Map();
  }

  const evolvCreatives = creatives.filter(c => normName(c.client) === 'evolv');
  const out = new Map(); // canonical name -> partial stage data

  // Edit Tracker creative names are free-text ad names (often multi-influencer,
  // e.g. "Evolv Mixed Creator Ad - Becca, Erin, Leland V1"), not a clean influencer
  // field — best-effort match by substring/token against each known canonical name
  // (from the Pitch Tracker). Flagged as a known limitation, not silently assumed.

  for (const canonical of canonicalNames) {
    const matches = evolvCreatives.filter(c => textMatchesCanonical(c.name, canonical, variantsByCanonical));
    if (matches.length === 0) continue;

    // Use the most-progressed matching creative if there are several.
    const rank = s => EDIT_TRACKER_SHARED_STATUSES.has(s) ? 2 : EDIT_TRACKER_EDITED_STATUSES.has(s) ? 1 : 0;
    const best = matches.sort((a, b) => rank(b.status) - rank(a.status))[0];

    out.set(canonical, {
      edited_for_paid: {
        reached: EDIT_TRACKER_EDITED_STATUSES.has(best.status),
        date: EDIT_TRACKER_EDITED_STATUSES.has(best.status) ? best.statusUpdatedAt : null,
      },
      shared_with_client: {
        reached: EDIT_TRACKER_SHARED_STATUSES.has(best.status),
        date: best.status === 'ready_for_client' ? best.statusUpdatedAt : null,
      },
      sourceLinks: { editTrackerCreativeId: best.id },
    });
  }

  if (canonicalNames.size === 0) {
    warnings.push('No confirmed influencer names from Pitch Tracker — Edit Tracker match skipped');
  }

  return out;
}

// ── Stage 6: Whitelisting sheet (split Meta/TikTok header) ──────────────────

// Real sheet layout (confirmed against the live "Influencer Video Ad Tracker" tab):
// row0 is a platform-divider row, but Google's merged-cell rendering repeats the
// merged value across every spanned column (e.g. 5 cells all reading "META") rather
// than one cell + blanks — so "each non-empty divider cell starts a new block" is
// wrong, and the divider's "TikTok" label also sits one column to the right of where
// that block's fields actually start. Block boundaries are derived from the field
// row itself instead: each repeated "Whitelist usage?" column starts a new platform
// block, which is robust regardless of how the divider row merges/labels render.
async function parseWhitelistingSheet(sheets, cfg, canonicalNames, variantsByCanonical, warnings) {
  if (!cfg.sheetId) {
    warnings.push('whitelisting.sheetId not configured — stage 6 skipped');
    return new Map();
  }

  // Cumulative, all-time tracker (not reset per quarter like the Pitch Tracker) —
  // give it much more headroom than the quarterly sheets.
  const rows = await getValues(sheets, cfg.sheetId, `${cfg.tabName}!A1:Z2000`);
  if (rows.length < 3) {
    warnings.push('whitelisting sheet returned no data rows');
    return new Map();
  }

  const fieldRow = rows[1]; // e.g. [..., 'Name', ..., 'Whitelist usage?', 'Live?', 'Whitelisting Start Date', ..., 'Whitelist usage?', 'Live?', ...]
  const dataRows = rows.slice(2);

  const blockStartIdxs = [];
  fieldRow.forEach((val, idx) => { if (normName(val).includes('whitelist usage')) blockStartIdxs.push(idx); });

  if (blockStartIdxs.length === 0) {
    warnings.push('whitelisting sheet: no "Whitelist usage?" columns found — check tab layout');
    return new Map();
  }

  const blocks = blockStartIdxs.map((start, i) => ({
    start,
    end: i + 1 < blockStartIdxs.length ? blockStartIdxs[i + 1] : fieldRow.length,
  }));

  const colName = findCol(fieldRow, h => h.includes('name'));
  if (colName === -1) {
    warnings.push('whitelisting sheet: could not find a Name column');
    return new Map();
  }

  const out = new Map();

  for (const row of dataRows) {
    const nameVal = row[colName];
    if (!isPopulated(nameVal)) continue; // section-banner rows (e.g. "Evolv GLP-1 CONTENT") have a blank Name cell

    let live = false;
    let liveDate = null;
    for (const block of blocks) {
      const blockHeaders = fieldRow.slice(block.start, block.end);
      const liveIdx  = findCol(blockHeaders, h => h.includes('live'));
      const startIdx = findCol(blockHeaders, h => h.includes('start date'));
      if (liveIdx === -1) continue;
      const liveVal = row[block.start + liveIdx];
      if (truthyFlag(liveVal)) {
        live = true;
        if (startIdx !== -1) liveDate = liveDate || parseCellDate(row[block.start + startIdx]);
      }
    }

    // Whitelisting rows are ad/edit titles, not clean influencer names (e.g.
    // "Stay at Home Daughter 1 (@therealsahd) - ...", "Mixed creator ad (Anne, Ari,
    // Mikayla, Alyssa B)") — one row can reference several influencers at once, so
    // match against every known canonical rather than picking a single one per row.
    for (const canonical of canonicalNames) {
      if (!textMatchesCanonical(nameVal, canonical, variantsByCanonical)) continue;
      const prev = out.get(canonical) || {};
      out.set(canonical, {
        ...prev,
        launched_in_paid: {
          reached: live || (prev.launched_in_paid && prev.launched_in_paid.reached) || false,
          date: (prev.launched_in_paid && prev.launched_in_paid.date) || liveDate || null,
        },
        sourceLinks: { ...(prev.sourceLinks || {}), whitelistingRow: true },
      });
    }
  }

  return out;
}

// ── Stage 7: Results Tracker (account-level only) ───────────────────────────

async function parseResultsTracker(sheets, cfg, warnings) {
  if (!cfg.sheetId) {
    warnings.push('resultsTracker.sheetId not configured — stage 7 skipped');
    return { weeks: [] };
  }

  const range = cfg.tabName ? `${cfg.tabName}!A1:H200` : 'A1:H200';
  const rows = await getValues(sheets, cfg.sheetId, range);
  if (rows.length < 2) {
    warnings.push('resultsTracker sheet returned no data rows');
    return { weeks: [] };
  }

  const headers = rows[0];
  const colWeekStart = findCol(headers, h => h.includes('week start'));
  if (colWeekStart === -1) {
    warnings.push('resultsTracker: could not find Week Start column');
    return { weeks: [] };
  }

  const weeks = rows.slice(1)
    .map(r => parseCellDate(r[colWeekStart]))
    .filter(Boolean)
    .sort();

  return { weeks };
}

// Account-level: an influencer is "performing in paid" once launched AND at least
// one Results Tracker week starts on/after the launch date. Not per-influencer
// attribution — see UI copy in pipeline-tracker.html.
function computePerformingStage(launchedStage, resultsWeeks) {
  if (!launchedStage || !launchedStage.reached) return { reached: false, date: null };
  if (!resultsWeeks.length) return { reached: false, date: null };
  if (!launchedStage.date) {
    // No known launch date — fall back to "any results data exists at all".
    return { reached: true, date: resultsWeeks[resultsWeeks.length - 1] };
  }
  const match = resultsWeeks.find(w => w >= launchedStage.date);
  return match ? { reached: true, date: match } : { reached: false, date: null };
}

// ── Join ──────────────────────────────────────────────────────────────────

function emptyStages() {
  const stages = {};
  for (const key of STAGE_ORDER) stages[key] = { reached: false, date: null };
  return stages;
}

// Furthest CONTINUOUS stage from the start of the lifecycle — not just the latest
// stage with reached: true anywhere in the record. Sources are matched/evidenced
// independently (see the unmatched flags above), so a later stage can show reached
// while a middle one doesn't (unmatched, or genuinely not there yet) — without this,
// an influencer could look like they jumped straight from stage 3 to stage 7 with an
// unmatched/unreached stage 4-6 in between, which misrepresents where they actually
// stand in the pipeline.
function currentStageOf(stages) {
  let current = null;
  for (const key of STAGE_ORDER) {
    if (!stages[key].reached) break;
    current = key;
  }
  return current;
}

async function runSync() {
  const token = process.env.GITHUB_TOKEN;
  const warnings = [];

  const { content: config }  = await githubGetJson(CONFIG_PATH, token);
  const { content: aliases } = await githubGetJson(ALIASES_PATH, token);
  const aliasLookup        = buildAliasLookup(aliases);
  const variantsByCanonical = buildVariantsByCanonical(aliases);

  const sheets = sheetsClient();
  const evolvCfg = config.evolv || {};

  // Influencer universe = confirmed pitch-tracker rows (stages 1-3 gate lifecycle entry) —
  // parsed first so its canonical names can drive the Edit Tracker/Whitelisting
  // best-effort matches below (both sources use free-text ad titles, not clean names).
  const pitchMap = await parsePitchTracker(sheets, evolvCfg.pitchTracker || {}, aliasLookup, warnings);
  const names = new Set(pitchMap.keys());

  const [whitelistMap, editTrackerMap, results] = await Promise.all([
    parseWhitelistingSheet(sheets, evolvCfg.whitelisting || {}, names, variantsByCanonical, warnings),
    loadEditTrackerStages(token, names, variantsByCanonical, warnings),
    parseResultsTracker(sheets, evolvCfg.resultsTracker || {}, warnings),
  ]);

  const now = new Date().toISOString();
  const records = [];
  // Matching against Edit Tracker/Whitelisting is best-effort free-text substring
  // matching (see textMatchesCanonical) — unlike Pitch Tracker, which is the source
  // of `names` itself and so always has an entry per confirmed influencer. Track who
  // came up with zero matches so the UI can show "couldn't match" distinctly from
  // "matched, just hasn't reached this stage yet" (both currently look like
  // reached: false otherwise).
  const unmatchedEditTracker = [];
  const unmatchedWhitelisting = [];

  for (const canonical of names) {
    const stages = emptyStages();
    const sourceLinks = {};
    const editPart = editTrackerMap.get(canonical);
    const whitelistPart = whitelistMap.get(canonical);

    for (const part of [pitchMap.get(canonical), editPart, whitelistPart]) {
      if (!part) continue;
      for (const key of STAGE_ORDER) {
        if (part[key]) stages[key] = part[key];
      }
      if (part.sourceLinks) Object.assign(sourceLinks, part.sourceLinks);
    }

    if (!editPart) {
      stages.edited_for_paid = { ...stages.edited_for_paid, unmatched: true };
      stages.shared_with_client = { ...stages.shared_with_client, unmatched: true };
      unmatchedEditTracker.push(canonical);
    }
    if (!whitelistPart) {
      stages.launched_in_paid = { ...stages.launched_in_paid, unmatched: true };
      unmatchedWhitelisting.push(canonical);
    }

    stages.performing_in_paid = computePerformingStage(stages.launched_in_paid, results.weeks);

    records.push({
      influencer: canonical,
      client: 'Evolv',
      currentStage: currentStageOf(stages),
      stages,
      sourceLinks,
      lastSynced: now,
    });
  }

  if (unmatchedEditTracker.length) {
    warnings.push(`Edit Tracker: couldn't match ${unmatchedEditTracker.length} confirmed influencer(s) — ${unmatchedEditTracker.join(', ')}`);
  }
  if (unmatchedWhitelisting.length) {
    warnings.push(`Whitelisting: couldn't match ${unmatchedWhitelisting.length} confirmed influencer(s) — ${unmatchedWhitelisting.join(', ')}`);
  }

  const output = { client: 'Evolv', lastSynced: now, warnings, records };
  await githubUpdateJson('data/pipeline-tracker-evolv.json', token, () => output, 'Pipeline Tracker: sync Evolv');
  return output;
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const output = await runSync();
    return res.status(200).json({
      ok: true,
      recordCount: output.records.length,
      warnings: output.warnings,
    });
  } catch (err) {
    console.error('[pipeline-sync] error', err);
    return res.status(500).json({ error: err.message });
  }
}
