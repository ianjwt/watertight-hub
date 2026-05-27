import { google } from 'googleapis';

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
  return '$' + Math.round(cpa);
}

function splitCamelCase(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

const NON_INFLUENCER = new Set(['WTPodcast', 'Short', 'SupportSystemLP']);

function parseAdName(rawName) {
  const clean = rawName.replace(/ - Copy( \d+)?$/i, '').trim();
  const parts = clean.split('_');
  if (parts.length < 3) return null;

  const typeStr = parts[parts.length - 1].toLowerCase();
  if (typeStr !== 'video' && typeStr !== 'image') return null;

  let influencerIdx = parts.length - 2;
  if (NON_INFLUENCER.has(parts[influencerIdx]) && influencerIdx > 1) {
    influencerIdx--;
  }

  const influencer  = splitCamelCase(parts[influencerIdx]);
  const middleParts = parts.slice(1, influencerIdx);
  const adName      = middleParts.join(' ');

  return { type: typeStr, influencer, adName };
}

// ── Creative handler ──────────────────────────────────────────────────────────

async function handleCreative(sheets, res) {
  const SOWELL_ID = '1FXsgrXgtxZZdWGDN7UsQTXaQBH852buAc8PEA2OCLCM';
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SOWELL_ID,
    range: 'Creative Data!A:AM',
  });

  const rows = data.values || [];
  if (rows.length < 2) return res.status(200).json({ video: [], image: [] });

  const headers = rows[0];
  const findCol = (hdrs, matchFn) => hdrs.findIndex(h => matchFn((h || '').toLowerCase().trim()));

  const colAdName     = findCol(headers, h => h.includes('ad name'));
  const colSpend      = findCol(headers, h => h.includes('amount spent'));
  const colPurch      = findCol(headers, h => h === 'purchases');
  const colROAS       = findCol(headers, h => h.includes('purchase roas'));        // optional
  const colPurchValue = findCol(headers, h => h.includes('purchases conversion value')); // optional
  const colCPA        = findCol(headers, h => h.includes('cost per purchase'));    // optional

  console.log('[creative] header row:', JSON.stringify(headers));
  console.log('[creative] column indices:', { colAdName, colSpend, colPurch, colROAS, colPurchValue, colCPA });

  if ([colAdName, colSpend, colPurch].includes(-1)) {
    return res.status(500).json({ error: 'Creative sheet column mapping failed' });
  }

  const map = new Map(); // key: `${influencer}|${type}`
  let debugCount = 0;

  for (const row of rows.slice(1)) {
    const rawName = String(row[colAdName] || '').trim();
    if (!rawName.startsWith('Sales_')) continue;

    const spend      = parseFloat((String(row[colSpend] || '')).replace(/[$,]/g, '').trim());
    const purch      = parseFloat((String(row[colPurch] || '0')).trim());
    const roasRaw    = colROAS       >= 0 ? parseFloat((String(row[colROAS]       || '0')).trim()) : null;
    const purchValue = colPurchValue >= 0 ? parseFloat((String(row[colPurchValue] || '0')).replace(/[$,]/g, '').trim()) : null;

    if (debugCount < 5) {
      console.log('[creative] row data:', {
        adName:           row[colAdName],
        rawSpend:         row[colSpend],
        rawPurchases:     row[colPurch],
        rawROAS:          colROAS       >= 0 ? row[colROAS]       : '(col absent)',
        rawPurchValue:    colPurchValue >= 0 ? row[colPurchValue] : '(col absent)',
        rawCPA:           colCPA        >= 0 ? row[colCPA]        : '(col absent)',
        parsedSpend:      spend,
        parsedPurchases:  purch,
        parsedROAS:       roasRaw,
        parsedPurchValue: purchValue,
      });
      debugCount++;
    }

    if (!spend || !purch || !Number.isFinite(spend) || !Number.isFinite(purch)) continue;

    const parsed = parseAdName(rawName);
    if (!parsed) continue;

    const key = `${parsed.influencer}|${parsed.type}`;
    if (map.has(key)) {
      const e = map.get(key);
      e.spend     += spend;
      e.purchases += purch;
      if (colPurchValue >= 0 && purchValue != null) e.purchaseValue += purchValue;
      // For ROAS-column path: accumulate weighted ROAS (roas * spend) to average later
      if (colROAS >= 0 && roasRaw != null && Number.isFinite(roasRaw)) {
        e.roasWeightedSum += roasRaw * spend;
        e.roasWeightSpend += spend;
      }
      if (purch > e.bestPurchases) {
        e.bestPurchases = purch;
        e.adName        = parsed.adName;
      }
    } else {
      map.set(key, {
        influencer:       parsed.influencer,
        adName:           parsed.adName,
        type:             parsed.type,
        spend,
        purchases:        purch,
        purchaseValue:    colPurchValue >= 0 && purchValue != null ? purchValue : 0,
        roasWeightedSum:  colROAS >= 0 && roasRaw != null && Number.isFinite(roasRaw) ? roasRaw * spend : 0,
        roasWeightSpend:  colROAS >= 0 && roasRaw != null && Number.isFinite(roasRaw) ? spend : 0,
        bestPurchases:    purch,
      });
    }
  }

  const calcROAS = (e) => {
    if (colROAS >= 0 && e.roasWeightSpend > 0) {
      return (e.roasWeightedSum / e.roasWeightSpend).toFixed(2);
    }
    if (colPurchValue >= 0 && e.spend > 0) {
      return (e.purchaseValue / e.spend).toFixed(2);
    }
    return e.spend > 0 ? '—' : '0.00';
  };

  const calcCPA = (e) => {
    if (colCPA >= 0) {
      // column present — already summed via spend/purchases as best proxy
      return fmtCPA(e.spend / e.purchases);
    }
    return fmtCPA(e.spend / e.purchases);
  };

  const toResult = (e) => ({
    influencer: e.influencer,
    adName:     e.adName,
    purchases:  Math.round(e.purchases),
    cpa:        calcCPA(e),
    roas:       calcROAS(e),
    spend:      fmtCurrency(e.spend),
  });

  const all    = Array.from(map.values());
  const roasNum = (e) => {
    if (colROAS >= 0 && e.roasWeightSpend > 0) return e.roasWeightedSum / e.roasWeightSpend;
    if (colPurchValue >= 0 && e.spend > 0)      return e.purchaseValue / e.spend;
    return 0;
  };
  const rank   = (a, b) => b.purchases - a.purchases || roasNum(b) - roasNum(a);
  const videos = all.filter(e => e.type === 'video').sort(rank).slice(0, 3).map(toResult);
  const images = all.filter(e => e.type === 'image').sort(rank).slice(0, 3).map(toResult);

  return res.status(200).json({ video: videos, image: images });
}

// ── Partnerships handler ──────────────────────────────────────────────────────

async function handlePartnerships(sheets, res) {
  const PARTNERSHIPS_ID = '1CCj-67IAGOlnMunLXrhZbr8cgUFptknOa7JbN6QAtpI';
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: PARTNERSHIPS_ID,
    range: 'Pitch Tracker!A1:G50',
  });

  const rows = data.values || [];
  if (rows.length < 2) return res.status(200).json({ partnerships: [] });

  const headers = rows[0];
  const findCol = (hdrs, matchFn) => hdrs.findIndex(h => matchFn((h || '').toLowerCase().trim()));

  const colGoLive       = findCol(headers, h => h.includes('go live'));
  const colStatus       = findCol(headers, h => h.includes('partnership status'));
  const colName         = findCol(headers, h => h.includes('name'));
  const colDeliverables = findCol(headers, h => h.includes('deliverable'));

  console.log('[partnerships] header row:', JSON.stringify(headers));
  console.log('[partnerships] column indices:', { colGoLive, colStatus, colName, colDeliverables });

  if ([colGoLive, colStatus, colName, colDeliverables].includes(-1)) {
    return res.status(500).json({ error: 'Partnership sheet column mapping failed' });
  }

  const VALID_STATUSES = new Set(['confirmed', 'in talks', 'offer out']);
  const partnerships = [];

  for (const row of rows.slice(1)) {
    const nameVal = (row[colName] || '').toLowerCase().trim();
    if (nameVal.includes('outreach')) break; // stop at outreach sentinel row

    const status = (row[colStatus] || '').toLowerCase().trim();
    if (!VALID_STATUSES.has(status)) continue;

    partnerships.push({
      name:         (row[colName]         || '').trim(),
      status:       (row[colStatus]       || '').trim(),
      goLive:       (row[colGoLive]       || '').trim(),
      deliverables: (row[colDeliverables] || '').trim(),
    });
  }

  return res.status(200).json({ partnerships });
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

    if (body.type === 'partnerships') {
      return await handlePartnerships(sheets, res);
    }

    // ── KPI path ──────────────────────────────────────────────────────────────
    const { weekStart } = body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });

    const SOWELL_ID = '1FXsgrXgtxZZdWGDN7UsQTXaQBH852buAc8PEA2OCLCM';
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SOWELL_ID,
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
