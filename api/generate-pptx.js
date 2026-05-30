import PptxGenJS from 'pptxgenjs';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '116E53';
const DARK_GREEN = '0D4F3C';
const ORANGE     = 'E8A44A';
const SAGE       = '8FA882';
const BG         = 'F5F2EC';

// ── Required factories (never reuse option objects across calls) ───────────────
const makeShadow   = () => ({ type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.08 });
const makeCardFill = () => ({ color: 'FFFFFF' });

// ── Helpers ───────────────────────────────────────────────────────────────────
function wowText(kpi) {
  const d = kpi.dir;
  const arrow = (d === '↑' || d === 'up') ? '↑' : (d === '↓' || d === 'down') ? '↓' : '→';
  return `${arrow} ${kpi.wow || ''}`;
}

function slideTitle(slide, title, y = 0.25) {
  slide.addText(title, { x: 0.5, y, w: 9, h: 0.5, fontSize: 28, bold: true, color: GREEN, fontFace: 'Calibri' });
}

function fmtTileVal(val, fmt) {
  if (!val && val !== 0) return '—';
  const n = parseFloat(String(val).replace(/[$,x]/g, ''));
  if (isNaN(n)) return String(val);
  if (fmt === '$') return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (fmt === 'x') return n.toFixed(2);
  return String(val);
}

// ── Slide 1 — Cover ───────────────────────────────────────────────────────────
function addSlide1(pres, weekRange, clientName, coverColor) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.08, h: 5.625,
    fill: { color: GREEN }, line: { width: 0, color: GREEN },
  });

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 4.95, w: 10, h: 0.675,
    fill: { color: GREEN }, line: { width: 0, color: GREEN },
  });

  slide.addShape(pres.ShapeType.ellipse, {
    x: 0.2, y: 4.62, w: 0.28, h: 0.28,
    fill: { color: GREEN }, line: { width: 0, color: GREEN },
  });
  slide.addText('watertight', {
    x: 0.54, y: 4.63, w: 1.4, h: 0.26,
    fontSize: 13, bold: true, color: GREEN, fontFace: 'Calibri', valign: 'middle',
  });

  slide.addText(clientName, {
    x: 0.5, y: 1.5, w: 9, h: 1.0,
    fontSize: 52, bold: true, color: GREEN, align: 'center', fontFace: 'Calibri',
  });

  slide.addText('Weekly Paid Media Performance', {
    x: 0.5, y: 2.65, w: 9, h: 0.5,
    fontSize: 18, color: '444444', align: 'center', fontFace: 'Calibri',
  });

  slide.addText(weekRange || '', {
    x: 0.5, y: 3.2, w: 9, h: 0.4,
    fontSize: 14, italic: true, color: '888888', align: 'center', fontFace: 'Calibri',
  });
}

// ── Slide 2 — Weekly Summary ──────────────────────────────────────────────────
function addSlide2(pres, kpis, contextBlurb, kpiMetrics) {
  const defaultMetrics = [
    { label: 'Shopify Sales', key: 'sales'    },
    { label: 'Blended ROAS',  key: 'roas'     },
    { label: 'Meta Spend',    key: 'spend'    },
    { label: 'Meta ROAS',     key: 'metaroas' },
  ];
  // Accept any client's metrics (≥3 tiles required); fall back to SoWell defaults
  const metrics = (kpiMetrics && kpiMetrics.length >= 3) ? kpiMetrics : defaultMetrics;

  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Weekly Summary');

  const tileY = 0.95;
  const tileW = 2.9;
  const tileH = 1.5;
  // Tiles are positioned by array order; kpis object keys match metric.key values
  const tiles = [
    { x: 0.35, fill: GREEN,  label: metrics[0].label, kpi: kpis[metrics[0].key] || {}, format: metrics[0].format },
    { x: 3.55, fill: ORANGE, label: metrics[1].label, kpi: kpis[metrics[1].key] || {}, format: metrics[1].format },
    { x: 6.75, fill: SAGE,   label: metrics[2].label, kpi: kpis[metrics[2].key] || {}, format: metrics[2].format },
  ];

  tiles.forEach(({ x, fill, label, kpi, format }) => {
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: tileY, w: tileW, h: tileH,
      rectRadius: 0.12,
      fill: { color: fill }, line: { width: 0, color: fill },
    });
    slide.addText(fmtTileVal(kpi.val, format), {
      x, y: tileY + 0.1, w: tileW, h: 0.7,
      fontSize: 30, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
    });
    slide.addText(label, {
      x, y: tileY + 0.82, w: tileW, h: 0.25,
      fontSize: 9, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
    });
    slide.addText(wowText(kpi), {
      x, y: tileY + 1.1, w: tileW, h: 0.3,
      fontSize: 11, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
    });
  });

  // 4th metric smaller tile — only rendered if metrics[3] exists
  if (metrics[3]) {
    const mr = kpis[metrics[3].key] || {};
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.35, y: 2.6, w: 2.0, h: 0.65,
      rectRadius: 0.08,
      fill: makeCardFill(), shadow: makeShadow(), line: { width: 0, color: 'FFFFFF' },
    });
    slide.addText(metrics[3].label, {
      x: 0.5, y: 2.65, w: 1.2, h: 0.25,
      fontSize: 9, bold: true, color: GREEN, fontFace: 'Calibri',
    });
    slide.addText(fmtTileVal(mr.val, metrics[3].format), {
      x: 1.7, y: 2.63, w: 1.0, h: 0.3,
      fontSize: 12, bold: true, color: GREEN, fontFace: 'Calibri', shrinkText: true,
    });
    slide.addText(wowText(mr), {
      x: 0.5, y: 2.9, w: 1.7, h: 0.25,
      fontSize: 10, color: '666666', fontFace: 'Calibri',
    });
  }

  slide.addText(contextBlurb || '', {
    x: 0.35, y: 3.45, w: 9.3, h: 1.9,
    fontSize: 11, italic: true, color: '555555', fontFace: 'Calibri',
  });
}

// ── Slide 3 — Performance Charts ─────────────────────────────────────────────
function addSlide3(pres, charts) {
  if (!charts || charts.length === 0) return;
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Performance Trends');

  if (charts.length === 1) {
    slide.addImage({ x: 2.25, y: 1.0, w: 5.5, h: 3.5, path: charts[0].url });
  } else {
    slide.addImage({ x: 0.3, y: 1.0, w: 4.6, h: 3.5, path: charts[0].url });
    slide.addImage({ x: 5.1, y: 1.0, w: 4.6, h: 3.5, path: charts[1].url });
  }
}

function addSlide3b(pres, charts) {
  if (!charts || !charts[2]) return;
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Performance Trends');
  slide.addImage({ x: 1.0, y: 1.0, w: 8.0, h: 4.2, path: charts[2].url });
}

// ── Slide 4 — Meta Performance ────────────────────────────────────────────────
function addSlide4(pres, metaBullets) {
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Meta Performance');

  const lines = (metaBullets || '')
    .split('\n')
    .map(l => l.replace(/\*\*/g, '').replace(/^[•\-]\s*/, '').trim())
    .filter(Boolean);

  const lineHeight = 0.72;
  const startY = 1.1;

  lines.forEach((line, i) => {
    const dashIdx = line.indexOf(' — ');
    const boldPart = dashIdx >= 0 ? line.substring(0, dashIdx) : line;
    const restPart = dashIdx >= 0 ? line.substring(dashIdx) : '';
    const y = startY + (i * lineHeight);

    const runs = [
      { text: '• ' + boldPart, options: { bold: true, color: '333333', fontSize: 13, fontFace: 'Calibri' } },
    ];
    if (restPart) {
      runs.push({ text: restPart, options: { bold: false, color: '333333', fontSize: 13, fontFace: 'Calibri' } });
    }
    slide.addText(runs, { x: 0.5, y, w: 9.0, h: lineHeight, fontFace: 'Calibri', wrap: true });
  });

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 5.2, w: 10, h: 0.425,
    fill: { color: GREEN }, line: { width: 0, color: GREEN },
  });
}

// ── Slides 5 & 6 — Creative ───────────────────────────────────────────────────
function addCreativeSlide(pres, title, creators) {
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, title, 0.2);

  const cardXs = [0.3, 3.55, 6.8];
  const cy = 0.85;
  const cw = 2.85;
  const ch = 4.55;

  (creators || []).slice(0, 3).forEach((c, i) => {
    if (!c.name) return;
    const cx = cardXs[i];

    slide.addShape(pres.ShapeType.rect, {
      x: cx, y: cy, w: cw, h: ch,
      fill: makeCardFill(), shadow: makeShadow(), line: { width: 0, color: 'FFFFFF' },
    });

    slide.addShape(pres.ShapeType.rect, {
      x: cx + 0.12, y: cy + 0.12, w: 2.61, h: 1.85,
      fill: { color: GREEN }, line: { width: 0, color: GREEN },
    });

    slide.addText(c.adName || '—', {
      x: cx + 0.12, y: cy + 0.12, w: 2.61, h: 0.9,
      fontSize: 10, italic: true, color: 'FFFFFF',
      align: 'center', valign: 'middle', fontFace: 'Calibri',
    });
    slide.addText(c.name || '', {
      x: cx + 0.12, y: cy + 1.1, w: 2.61, h: 0.7,
      fontSize: 9, color: 'FFFFFF',
      align: 'center', valign: 'middle', fontFace: 'Calibri',
    });

    slide.addText(c.name, {
      x: cx + 0.15, y: cy + 2.1, w: 2.55, h: 0.35,
      fontSize: 13, bold: true, color: GREEN, fontFace: 'Calibri',
    });

    const isTraffic = c.type === 'traffic' || c.clicks != null;

    if (isTraffic) {
      // ── Traffic layout: CLICKS / CTR / CPM / SPEND ────────────────────────
      slide.addText('CLICKS', {
        x: cx + 0.15, y: cy + 2.52, w: 1.2, h: 0.22,
        fontSize: 8, color: '999999', fontFace: 'Calibri',
      });
      slide.addText(String(c.clicks || c.metricVal || '—'), {
        x: cx + 0.15, y: cy + 2.72, w: 2.55, h: 0.42,
        fontSize: 20, bold: true, color: GREEN, fontFace: 'Calibri',
      });

      slide.addText('CTR', {
        x: cx + 0.15, y: cy + 3.05, w: 0.6, h: 0.2,
        fontSize: 8, color: '999999', fontFace: 'Calibri',
      });
      slide.addText(String(c.ctr || c.roas || '—'), {
        x: cx + 0.75, y: cy + 3.18, w: 1.8, h: 0.25,
        fontSize: 12, color: '444444', fontFace: 'Calibri',
      });

      slide.addText('CPM', {
        x: cx + 0.15, y: cy + 3.38, w: 0.6, h: 0.2,
        fontSize: 8, color: '999999', fontFace: 'Calibri',
      });
      slide.addText(String(c.cpm || '—'), {
        x: cx + 0.75, y: cy + 3.51, w: 1.8, h: 0.25,
        fontSize: 12, color: '444444', fontFace: 'Calibri',
      });

      slide.addText('SPEND', {
        x: cx + 0.15, y: cy + 3.68, w: 0.6, h: 0.2,
        fontSize: 8, color: '999999', fontFace: 'Calibri',
      });
      slide.addText(String(c.spend || '—'), {
        x: cx + 0.75, y: cy + 3.81, w: 1.8, h: 0.25,
        fontSize: 12, color: '444444', fontFace: 'Calibri',
      });

    } else {
      // ── Purchase layout: PURCHASES / ROAS / SPEND ──────────────────────────
      slide.addText('PURCHASES', {
        x: cx + 0.15, y: cy + 2.52, w: 1.2, h: 0.22,
        fontSize: 8, color: '999999', fontFace: 'Calibri',
      });
      slide.addText(String(c.metricVal || '—'), {
        x: cx + 0.15, y: cy + 2.72, w: 2.55, h: 0.42,
        fontSize: 20, bold: true, color: GREEN, fontFace: 'Calibri',
      });

      slide.addText('ROAS', {
        x: cx + 0.15, y: cy + 3.22, w: 0.6, h: 0.2,
        fontSize: 8, color: '999999', fontFace: 'Calibri',
      });
      slide.addText(String(c.roas || '—'), {
        x: cx + 0.75, y: cy + 3.2, w: 1.8, h: 0.25,
        fontSize: 12, color: '444444', fontFace: 'Calibri',
      });

      slide.addText('SPEND', {
        x: cx + 0.15, y: cy + 3.78, w: 0.6, h: 0.2,
        fontSize: 8, color: '999999', fontFace: 'Calibri',
      });
      slide.addText(String(c.spend || '—'), {
        x: cx + 0.75, y: cy + 3.76, w: 1.8, h: 0.25,
        fontSize: 12, color: '444444', fontFace: 'Calibri',
      });
    }
  });
}

// ── Slide 7 — Influencer Partnerships ────────────────────────────────────────
function addSlide7(pres, partnerships) {
  const items = Array.isArray(partnerships) ? partnerships : [];
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Influencer Partnerships');

  const cols = [
    { x: 0.3,  label: 'Confirmed', bucket: 'confirmed'  },
    { x: 3.55, label: 'Offer Out', bucket: 'offer out'  },
    { x: 6.8,  label: 'In Talks',  bucket: 'in talks'   },
  ];
  const colW  = 2.9;
  const hdrY  = 1.0;
  const hdrH  = 0.42;
  const cardY = 1.42;
  const cardH = 3.95;

  cols.forEach(({ x, label, bucket }) => {
    // Column header bar
    slide.addShape(pres.ShapeType.rect, {
      x, y: hdrY, w: colW, h: hdrH,
      fill: { color: GREEN }, line: { width: 0, color: GREEN },
    });
    slide.addText(label, {
      x, y: hdrY, w: colW, h: hdrH,
      fontSize: 12, bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle', fontFace: 'Calibri',
    });

    // Column card background
    slide.addShape(pres.ShapeType.rect, {
      x, y: cardY, w: colW, h: cardH,
      fill: makeCardFill(), shadow: makeShadow(), line: { width: 0, color: 'FFFFFF' },
    });

    const entries = items.filter(p => (p.status || '').toLowerCase().trim() === bucket).slice(0, 4);

    if (entries.length === 0) {
      slide.addText('—', {
        x: x + 0.15, y: cardY + 1.8, w: 2.6, h: 0.4,
        fontSize: 11, color: '999999', align: 'center', fontFace: 'Calibri',
      });
    } else {
      entries.forEach((p, idx) => {
        const ey = cardY + 0.2 + (idx * 0.88);
        const deliverable = p.condensed || (p.deliverables ? p.deliverables.slice(0, 40) : '—');
        const goLive = (p.goLive || '').trim() || 'TBD';

        slide.addText(p.name || '—', {
          x: x + 0.15, y: ey, w: 2.6, h: 0.25,
          fontSize: 11, bold: true, color: GREEN, fontFace: 'Calibri',
        });
        slide.addText('Live: ' + goLive, {
          x: x + 0.15, y: ey + 0.27, w: 2.6, h: 0.2,
          fontSize: 9, color: '888888', fontFace: 'Calibri',
        });
        slide.addText(deliverable, {
          x: x + 0.15, y: ey + 0.49, w: 2.6, h: 0.28,
          fontSize: 9, italic: true, color: '555555', fontFace: 'Calibri',
        });
      });
    }
  });
}

// ── Slide 8 — Questions ───────────────────────────────────────────────────────
function addSlide8(pres) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.08, h: 5.625,
    fill: { color: GREEN }, line: { width: 0, color: GREEN },
  });

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 4.95, w: 10, h: 0.675,
    fill: { color: GREEN }, line: { width: 0, color: GREEN },
  });

  slide.addShape(pres.ShapeType.ellipse, {
    x: 4.55, y: 4.62, w: 0.28, h: 0.28,
    fill: { color: GREEN }, line: { width: 0, color: GREEN },
  });
  slide.addText('watertight', {
    x: 4.89, y: 4.63, w: 1.4, h: 0.26,
    fontSize: 13, bold: true, color: GREEN, fontFace: 'Calibri', valign: 'middle',
  });

  slide.addText('Questions?', {
    x: 0.5, y: 1.8, w: 9, h: 1.0,
    fontSize: 48, bold: true, color: GREEN, align: 'center', fontFace: 'Calibri',
  });

  slide.addText('Prepared by Watertight', {
    x: 0.5, y: 3.1, w: 9, h: 0.4,
    fontSize: 14, color: '888888', align: 'center', fontFace: 'Calibri',
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { weekRange, kpis = {}, contextBlurb, metaBullets, video, image, partnerships, clientConfig } = req.body || {};

    const clientName = clientConfig?.name       || 'SoWell';
    const coverColor = clientConfig?.coverColor || GREEN;
    const charts     = clientConfig?.charts     || [
      { url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ovkdAY2Ik5UMvvSHoRZ5thD3lvRxOo1sHuJ-KKcv32f4Ul0XyZ-oAJav_pZbSLdtS8l8GrjMcO9b/pubchart?oid=1654932759&format=image' },
      { url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ovkdAY2Ik5UMvvSHoRZ5thD3lvRxOo1sHuJ-KKcv32f4Ul0XyZ-oAJav_pZbSLdtS8l8GrjMcO9b/pubchart?oid=1601459520&format=image' },
      { url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ovkdAY2Ik5UMvvSHoRZ5thD3lvRxOo1sHuJ-KKcv32f4Ul0XyZ-oAJav_pZbSLdtS8l8GrjMcO9b/pubchart?oid=1946349077&format=image' },
    ];
    const kpiMetrics = clientConfig?.kpi?.metrics || null;

    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9';

    addSlide1(pres, weekRange || '', clientName, coverColor);
    addSlide2(pres, kpis, contextBlurb || '', kpiMetrics);
    addSlide3(pres, charts);
    addSlide3b(pres, charts);
    addSlide4(pres, metaBullets || '');
    const hasVideo = (video || []).some(c => c.name && c.name.trim() !== '');
    const hasImage = (image || []).some(c => c.name && c.name.trim() !== '');
    if (hasVideo) addCreativeSlide(pres, 'Creative Performance — Video',  video);
    if (hasImage) addCreativeSlide(pres, 'Creative Performance — Images', image);
    addSlide7(pres, partnerships || []);
    addSlide8(pres);

    const base64 = await pres.write({ outputType: 'base64' });
    const safeClient = clientName.replace(/\s+/g, '_');
    const safeDate   = (weekRange || '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    const safeName   = `${safeClient}_Weekly_${safeDate}.pptx`;

    return res.status(200).json({ pptx: base64, filename: safeName });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
