#!/usr/bin/env node
//
// One-time local migration: pulls the old creative-status Google Sheet and turns it into
// data/edit-tracker-creatives.json. Not part of the deployed app — run this by hand once,
// review the output, then `git add data/edit-tracker-creatives.json` and commit/push it
// (a normal commit — the deployed app reads it via the GitHub Contents API from then on).
//
// Requires (env vars, or a local .env file in the repo root):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   (same pair api/sheets-proxy.js uses — must have
//                                         read access to the sheet below)
// Requires `npm install` to have pulled in `googleapis` (already in package.json).
//
// Usage:
//   node scripts/migrate-edit-tracker.mjs discover [--tab="Sheet1"]
//     → connects, prints the column mapping it guessed, and every distinct value found
//       in the status column (with counts). Writes/updates scripts/edit-tracker-status-map.json
//       as a stub for you to fill in by hand — do NOT attempt to guess these automatically,
//       several old values (e.g. "MARIA") are just a person's name with no recoverable stage.
//
//   node scripts/migrate-edit-tracker.mjs apply [--tab="Sheet1"] [--force]
//     → requires scripts/edit-tracker-status-map.json to be fully filled in. Transforms every
//       row and overwrites data/edit-tracker-creatives.json. Refuses to run if that file
//       already has creatives in it, unless --force is passed.

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const SHEET_ID          = '1HUXJIUIAMk6Mhg_SJSJc57HbmyuMiLnXdlEOeT5T2mY';
const STATUS_MAP_PATH   = path.join(REPO_ROOT, 'scripts', 'edit-tracker-status-map.json');
const CREATIVES_PATH    = path.join(REPO_ROOT, 'data', 'edit-tracker-creatives.json');
const CLIENTS_PATH      = path.join(REPO_ROOT, 'data', 'edit-tracker-clients.json');
const STATUSES_PATH     = path.join(REPO_ROOT, 'data', 'edit-tracker-statuses.json');

const VALID_STATUS_KEYS = new Set([
  'needs_brief', 'briefed', 'in_edit', 'ready_for_review',
  'ready_for_client', 'client_requested_changes', 'live', 'on_hold', 'cancelled',
]);

const HEADER_SYNONYMS = {
  name:     ['name', 'ad name', 'creative', 'creative name', 'ad'],
  client:   ['client', 'brand'],
  status:   ['status'],
  editor:   ['editor'],
  reviewer: ['reviewer'],
  link:     ['link', 'url', 'deliverable', 'current link', 'drive link', 'deliverable link'],
  notes:    ['notes', 'internal notes', 'comment', 'comments'],
  platform: ['platform', 'type', 'platform type'],
};

function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (key in process.env) continue;
    process.env[key] = rawVal.replace(/^['"]|['"]$/g, '');
  }
}

function parseArgs(argv) {
  const mode = argv[0];
  const flags = {};
  for (const a of argv.slice(1)) {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
  }
  return { mode, flags };
}

function detectColumns(headerRow) {
  const norm = headerRow.map(h => String(h || '').trim().toLowerCase());
  const cols = {};
  for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    const idx = norm.findIndex(h => synonyms.includes(h));
    cols[field] = idx;
  }
  return cols;
}

function slugify(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function guessPlatform(name) {
  const n = String(name || '').toLowerCase();
  if (/\bvideo\b|_video$/.test(n)) return 'video';
  if (/\bimage\b|_image$/.test(n)) return 'image';
  return null;
}

async function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (env or .env)');
  }
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  return google.sheets({ version: 'v4', auth });
}

async function fetchRows(sheets, tabName) {
  let range = 'A1:Z2000';
  if (tabName) range = `${tabName}!A1:Z2000`;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  const rows = data.values || [];
  if (rows.length < 2) throw new Error('Sheet appears empty (need a header row + at least one data row)');
  return { headers: rows[0], dataRows: rows.slice(1) };
}

// ── discover ──────────────────────────────────────────────────────────────────

async function runDiscover(flags) {
  const sheets = await getSheetsClient();
  const { headers, dataRows } = await fetchRows(sheets, flags.tab);
  const cols = detectColumns(headers);

  console.log('\nDetected columns:');
  for (const [field, idx] of Object.entries(cols)) {
    console.log(`  ${field.padEnd(9)} → ${idx === -1 ? '(not found)' : `"${headers[idx]}" (col ${idx})`}`);
  }
  if (cols.status === -1) throw new Error('Could not find a Status column — pass --tab to point at the right sheet tab, or rename the header to "Status"');

  const counts = new Map();
  for (const row of dataRows) {
    const raw = String(row[cols.status] || '').trim();
    if (!raw) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }

  console.log(`\n${counts.size} distinct status values found (${dataRows.length} rows total):`);
  const existing = fs.existsSync(STATUS_MAP_PATH) ? JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8')) : {};
  const merged = { ...existing };

  for (const [val, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const mapped = merged[val];
    const state = mapped && mapped.status ? `→ mapped to "${mapped.status}"` : '→ NEEDS MAPPING';
    console.log(`  ${String(n).padStart(4)}×  "${val}"  ${state}`);
    if (!merged[val]) {
      merged[val] = { status: null, editorOverride: null, reviewerOverride: null, note: '' };
    }
  }

  fs.mkdirSync(path.dirname(STATUS_MAP_PATH), { recursive: true });
  fs.writeFileSync(STATUS_MAP_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(REPO_ROOT, STATUS_MAP_PATH)}.`);
  console.log(`For each entry, set "status" to one of: ${[...VALID_STATUS_KEYS].join(', ')}, or "skip" to drop those rows.`);
  console.log('For a value that is only a person\'s name (e.g. "MARIA") with no recoverable stage, ask a human which status those rows should become.');
  console.log('Then run: node scripts/migrate-edit-tracker.mjs apply\n');
}

// ── apply ─────────────────────────────────────────────────────────────────────

async function runApply(flags) {
  if (!fs.existsSync(STATUS_MAP_PATH)) {
    throw new Error('No status map found — run discover first: node scripts/migrate-edit-tracker.mjs discover');
  }
  const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
  const unmapped = Object.entries(statusMap).filter(([, v]) => !v.status);
  if (unmapped.length) {
    throw new Error(`${unmapped.length} status value(s) still unmapped: ${unmapped.map(([k]) => `"${k}"`).join(', ')}`);
  }
  for (const [val, v] of Object.entries(statusMap)) {
    if (v.status !== 'skip' && !VALID_STATUS_KEYS.has(v.status)) {
      throw new Error(`Invalid status "${v.status}" mapped from "${val}" — must be one of ${[...VALID_STATUS_KEYS].join(', ')} or "skip"`);
    }
  }

  const existingCreatives = JSON.parse(fs.readFileSync(CREATIVES_PATH, 'utf8')).creatives || [];
  if (existingCreatives.length && !flags.force) {
    throw new Error(`data/edit-tracker-creatives.json already has ${existingCreatives.length} creative(s) — pass --force to overwrite`);
  }

  const knownClients = new Set((JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf8')).clients || []).map(c => c.toLowerCase()));
  const statusLabels  = new Map(
    (JSON.parse(fs.readFileSync(STATUSES_PATH, 'utf8')).statuses || []).map(s => [s.key, s.label])
  );

  const sheets = await getSheetsClient();
  const { headers, dataRows } = await fetchRows(sheets, flags.tab);
  const cols = detectColumns(headers);

  const now = new Date().toISOString();
  const seenIds = new Set();
  const out = [];
  const warnings = [];

  dataRows.forEach((row, i) => {
    const rowNum = i + 2; // account for header row, 1-indexed sheet row
    const name = cols.name !== -1 ? String(row[cols.name] || '').trim() : '';
    if (!name) return; // skip blank rows

    const rawStatus = cols.status !== -1 ? String(row[cols.status] || '').trim() : '';
    const mapping = statusMap[rawStatus];
    if (!mapping || mapping.status === 'skip') return;

    const client = cols.client !== -1 ? String(row[cols.client] || '').trim() : '';
    if (client.toLowerCase() === 'cuyama buckhorn') {
      warnings.push(`Row ${rowNum} ("${name}"): skipped — Cuyama Buckhorn is not a valid client for this app`);
      return;
    }
    if (!client || !knownClients.has(client.toLowerCase())) {
      warnings.push(`Row ${rowNum} ("${name}"): unrecognized client "${client}" — skipped, add manually if needed`);
      return;
    }

    const platformType = cols.platform !== -1 && row[cols.platform]
      ? String(row[cols.platform]).trim().toLowerCase()
      : guessPlatform(name);
    if (platformType !== 'video' && platformType !== 'image') {
      warnings.push(`Row ${rowNum} ("${name}"): couldn't determine platform type (video/image) — defaulted to "video", fix manually`);
    }

    let id = slugify(name) || `creative-${rowNum}`;
    while (seenIds.has(id)) id = `${id}-${rowNum}`;
    seenIds.add(id);

    out.push({
      id,
      name,
      client,
      platformType: (platformType === 'video' || platformType === 'image') ? platformType : 'video',
      status: mapping.status,
      statusUpdatedAt: now, // sheet has no reliable per-status timestamp history — clock starts fresh at import
      editor:   mapping.editorOverride   || (cols.editor   !== -1 ? String(row[cols.editor]   || '').trim() || null : null),
      reviewer: mapping.reviewerOverride || (cols.reviewer !== -1 ? String(row[cols.reviewer] || '').trim() || null : null),
      briefedBy: null,
      briefedAt: null,
      currentLink: cols.link !== -1 ? (String(row[cols.link] || '').trim() || null) : null,
      internalNotes: cols.notes !== -1 ? String(row[cols.notes] || '').trim() : '',
      alertState: { lastAlertedStatus: null, lastAlertedAt: null },
    });
  });

  fs.writeFileSync(CREATIVES_PATH, JSON.stringify({ creatives: out }, null, 2) + '\n');

  console.log(`\nWrote ${out.length} creative(s) to ${path.relative(REPO_ROOT, CREATIVES_PATH)}.`);
  console.log('Status breakdown:');
  const byStatus = {};
  out.forEach(c => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
  for (const [key, n] of Object.entries(byStatus)) console.log(`  ${n}× ${statusLabels.get(key) || key}`);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach(w => console.log('  - ' + w));
  }
  console.log('\nAll statusUpdatedAt timestamps are set to "now" (import time) — the sheet has no reliable per-row history,');
  console.log('so staleness thresholds start counting fresh from this import, not from the original status change.');
  console.log('\nReview the file, then: git add data/edit-tracker-creatives.json && git commit && git push\n');
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadDotEnv();
  const { mode, flags } = parseArgs(process.argv.slice(2));

  if (mode === 'discover') return runDiscover(flags);
  if (mode === 'apply')    return runApply(flags);

  console.log('Usage:');
  console.log('  node scripts/migrate-edit-tracker.mjs discover [--tab="Sheet1"]');
  console.log('  node scripts/migrate-edit-tracker.mjs apply [--tab="Sheet1"] [--force]');
  process.exit(1);
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
