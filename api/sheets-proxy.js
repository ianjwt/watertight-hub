import { google } from 'googleapis';

const SPREADSHEET_ID = '1FXsgrXgtxZZdWGDN7UsQTXaQBH852buAc8PEA2OCLCM';

// KPI column indices (0-based), first sheet
const COL_WEEK_START   = 0;  // A
const COL_META_SPEND   = 2;  // C
const COL_META_ROAS    = 4;  // E
const COL_BLENDED_ROAS = 9;  // J
const COL_SHOPIFY      = 10; // K

// ── Shared helpers ────────────────────────────────────────────────────────────

function parseNum(val) {
  if (val == null || val === '') return null;
  return parseFloat(String(val).replace(/[$,%\s]/g, '')) || 0;
}

function pct(curr, prev) {
  if (prev == null || prev === 0 || curr == null) return '0%';
  const change = Math.round(((curr - prev) / Math.abs(prev)) * 100);
  if (change > 0) return `+${change}%`;
  if (change < 0) return `${change}%`;
  return '0%';
}

function fmtCurrency(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtDecimal(n) {
  return Number(n).toFixed(2);
}

function normDate(s) {
  return String(s || '').trim()
    .replace(/^0+(\d)/, '$1')
    .replace(/\/0+(\d)/g, '/$1');
}

// ── Creative helpers ──────────────────────────────────────────────────────────

function fmtCPA(cpa) {
  return cpa >= 10 ? '$' + Math.round(cpa) : '$' + cpa.toFixed(1);
}

function splitCamelCase(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function parseAdName(rawName) {
  const clean = rawName.replace(/ - Copy( \d+)?$/i, '').trim();
  const parts = clean.split('_');
  if (parts.length < 3) return null;

  const typeStr = parts[parts.length - 1].toLowerCase();
  if (typeStr !== 'video' && typeStr !== 'image') return null;

  const influencer = splitCamelCase(parts[parts.length - 2]);
  const middleParts = parts.slice(1, parts.length - 2);
  const adName = middleParts.length > 0 ? middleParts.join(' ') : influencer;

  return { type: typeStr, influencer, adName };
}

// ── Creative handler ──────────────────────────────────────────────────────────

async function handleCreative(sheets, res) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Creative Data!A:AB',
  });

  const rows = data.values || [];
  if (rows.length < 2) return res.status(200).json({ video: [], image: [] });

  const headers = rows[0];
  const colAdName = headers.indexOf('Ad name');
  const colSpend  = headers.indexOf('Amount spent (USD)');
  const colPurch  = headers.indexOf('Purchases');
  const colROAS   = headers.indexOf('Purchase ROAS (return on ad spend)');

  if ([colAdName, colSpend, colPurch, colROAS].includes(-1)) {
    return res.status(500).json({ error: 'Creative sheet column mapping failed' });
  }

  const map = new Map(); // key: `${influencer}|${type}`

  for (const row of rows.slice(1)) {
    const rawName = String(row[colAdName] || '').trim();
    if (!rawName.startsWith('Sales_')) continue;

    const spend = parseNum(row[colSpend]);
    const purch = parseNum(row[colPurch]);
    if (!spend || !purch) continue;

    const roas   = parseNum(row[colROAS]) || 0;
    const parsed = parseAdName(rawName);
    if (!parsed) continue;

    const key = `${parsed.influencer}|${parsed.type}`;
    if (map.has(key)) {
      const e = map.get(key);
      e.spend     += spend;
      e.purchases += purch;
      if (roas > e.roas) e.roas = roas;
    } else {
      map.set(key, {
        influencer: parsed.influencer,
        adName:     parsed.adName,
        type:       parsed.type,
        spend,
        purchases:  purch,
        roas,
      });
    }
  }

  const toResult = (e) => ({
    influencer: e.influencer,
    adName:     e.adName,
    purchases:  Math.round(e.purchases),
    cpa:        fmtCPA(e.spend / e.purchases),
    roas:       fmtDecimal(e.roas),
    spend:      fmtCurrency(e.spend),
  });

  const all    = Array.from(map.values());
  const rank   = (a, b) => b.purchases - a.purchases || b.roas - a.roas;
  const videos = all.filter(e => e.type === 'video').sort(rank).slice(0, 3).map(toResult);
  const images = all.filter(e => e.type === 'image').sort(rank).slice(0, 3).map(toResult);

  return res.status(200).json({ video: videos, image: images });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    if (body.type === 'creative') {
      return await handleCreative(sheets, res);
    }

    // ── KPI path ──────────────────────────────────────────────────────────────
    const { weekStart } = body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:Z200',
    });

    const rows = data.values || [];
    if (rows.length < 2) return res.status(404).json({ error: 'Week not found' });

    const target   = normDate(weekStart);
    const dataRows = rows.slice(1);
    const rowIdx   = dataRows.findIndex(r => {
      const cellNorm = normDate(r[COL_WEEK_START] || '');
      return cellNorm === target || cellNorm.startsWith(target + '/');
    });

    if (rowIdx === -1) return res.status(404).json({ error: 'Week not found' });

    const curr = dataRows[rowIdx];
    const prev = rowIdx > 0 ? dataRows[rowIdx - 1] : null;

    const metaSpendCurr   = parseNum(curr[COL_META_SPEND]);
    const metaROASCurr    = parseNum(curr[COL_META_ROAS]);
    const shopifyCurr     = parseNum(curr[COL_SHOPIFY]);
    const blendedROASCurr = parseNum(curr[COL_BLENDED_ROAS]);

    const metaSpendPrev   = prev ? parseNum(prev[COL_META_SPEND])   : null;
    const metaROASPrev    = prev ? parseNum(prev[COL_META_ROAS])    : null;
    const shopifyPrev     = prev ? parseNum(prev[COL_SHOPIFY])      : null;
    const blendedROASPrev = prev ? parseNum(prev[COL_BLENDED_ROAS]) : null;

    return res.status(200).json({
      metaSpend:                  fmtCurrency(metaSpendCurr),
      metaSpendWoW:               pct(metaSpendCurr, metaSpendPrev),
      metaROAS:                   fmtDecimal(metaROASCurr),
      metaROASWoW:                pct(metaROASCurr, metaROASPrev),
      shopifyNewCustomerSales:    fmtCurrency(shopifyCurr),
      shopifyNewCustomerSalesWoW: pct(shopifyCurr, shopifyPrev),
      blendedROAS:                fmtDecimal(blendedROASCurr),
      blendedROASWoW:             pct(blendedROASCurr, blendedROASPrev),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
