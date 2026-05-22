import { google } from 'googleapis';

const SPREADSHEET_ID = '1FXsgrXgtxZZdWGDN7UsQTXaQBH852buAc8PEA2OCLCM';
const SHEET_NAME = 'Performance Tracker';

function findCol(headers, ...terms) {
  const h = headers.map(v => (v || '').toString().toLowerCase());
  for (const term of terms) {
    const idx = h.findIndex(cell => cell.includes(term.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { weekStart } = req.body || {};
  if (!weekStart) {
    return res.status(400).json({ error: 'weekStart is required' });
  }

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:Z200`,
    });

    const rows = data.values || [];
    if (rows.length < 2) return res.status(404).json({ error: 'Week not found' });

    const headers = rows[0];
    const colWeekStart   = findCol(headers, 'week start', 'week');
    const colMetaSpend   = findCol(headers, 'meta spend', 'meta weekly spend');
    const colMetaROAS    = findCol(headers, 'meta roas');
    const colShopify     = findCol(headers, 'shopify new customer', 'new customer sales');
    const colBlendedROAS = findCol(headers, 'blended roas', 'nc roas', 'new customer roas');

    if ([colWeekStart, colMetaSpend, colMetaROAS, colShopify, colBlendedROAS].includes(-1)) {
      return res.status(500).json({ error: 'Sheet column mapping failed' });
    }

    const target = normDate(weekStart);
    const dataRows = rows.slice(1);
    const rowIdx = dataRows.findIndex(r => {
      const cellNorm = normDate(r[colWeekStart] || '');
      return cellNorm === target || cellNorm.startsWith(target + '/');
    });

    if (rowIdx === -1) return res.status(404).json({ error: 'Week not found' });

    const curr = dataRows[rowIdx];
    const prev = rowIdx > 0 ? dataRows[rowIdx - 1] : null;

    const metaSpendCurr   = parseNum(curr[colMetaSpend]);
    const metaROASCurr    = parseNum(curr[colMetaROAS]);
    const shopifyCurr     = parseNum(curr[colShopify]);
    const blendedROASCurr = parseNum(curr[colBlendedROAS]);

    const metaSpendPrev   = prev ? parseNum(prev[colMetaSpend])   : null;
    const metaROASPrev    = prev ? parseNum(prev[colMetaROAS])    : null;
    const shopifyPrev     = prev ? parseNum(prev[colShopify])     : null;
    const blendedROASPrev = prev ? parseNum(prev[colBlendedROAS]) : null;

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
