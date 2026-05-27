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

// ── Slide 1 — Cover ───────────────────────────────────────────────────────────
function addSlide1(pres, weekRange) {
  const slide = pres.addSlide();
  slide.background = { color: GREEN };

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.08, h: 5.625,
    fill: { color: DARK_GREEN }, line: { width: 0, color: DARK_GREEN },
  });

  slide.addText('SoWell', {
    x: 0.5, y: 1.6, w: 9, h: 0.9,
    fontSize: 52, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
  });

  slide.addText('Weekly Paid Media Performance', {
    x: 0.5, y: 2.65, w: 9, h: 0.5,
    fontSize: 18, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
  });

  slide.addText(weekRange || '', {
    x: 0.5, y: 3.2, w: 9, h: 0.4,
    fontSize: 14, italic: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
  });

  slide.addText('Watertight', {
    x: 7.5, y: 5.1, w: 2, h: 0.3,
    fontSize: 11, color: 'FFFFFF', fontFace: 'Calibri',
  });
}

// ── Slide 2 — Weekly Summary ──────────────────────────────────────────────────
function addSlide2(pres, kpis, contextBlurb) {
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Weekly Summary');

  const tileY = 0.95;
  const tileW = 2.9;
  const tileH = 1.5;
  const tiles = [
    { x: 0.35, fill: GREEN,  label: 'Shopify Sales', kpi: kpis.sales    || {} },
    { x: 3.55, fill: ORANGE, label: 'Blended ROAS',  kpi: kpis.roas     || {} },
    { x: 6.75, fill: SAGE,   label: 'Meta Spend',    kpi: kpis.spend    || {} },
  ];

  tiles.forEach(({ x, fill, label, kpi }) => {
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: tileY, w: tileW, h: tileH,
      rectRadius: 0.12,
      fill: { color: fill }, line: { width: 0, color: fill },
    });
    slide.addText(kpi.val || '—', {
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

  // Meta ROAS smaller tile
  const mr = kpis.metaroas || {};
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.35, y: 2.6, w: 2.0, h: 0.65,
    rectRadius: 0.08,
    fill: makeCardFill(), shadow: makeShadow(), line: { width: 0, color: 'FFFFFF' },
  });
  slide.addText('Meta ROAS', {
    x: 0.5, y: 2.65, w: 1.2, h: 0.25,
    fontSize: 9, bold: true, color: GREEN, fontFace: 'Calibri',
  });
  slide.addText(mr.val || '—', {
    x: 1.7, y: 2.63, w: 0.5, h: 0.3,
    fontSize: 14, bold: true, color: GREEN, fontFace: 'Calibri',
  });
  slide.addText(wowText(mr), {
    x: 0.5, y: 2.9, w: 1.7, h: 0.25,
    fontSize: 10, color: '666666', fontFace: 'Calibri',
  });

  slide.addText(contextBlurb || '', {
    x: 0.35, y: 3.45, w: 9.3, h: 1.9,
    fontSize: 11, italic: true, color: '555555', fontFace: 'Calibri',
  });
}

// ── Slide 3 — Performance Charts ─────────────────────────────────────────────
function addSlide3(pres) {
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Performance Trends');

  slide.addImage({ x: 0.3, y: 1.0, w: 4.5, h: 2.7, path: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ovkdAY2Ik5UMvvSHoRZ5thD3lvRxOo1sHuJ-KKcv32f4Ul0XyZ-oAJav_pZbSLdtS8l8GrjMcO9b/pubchart?oid=1654932759&format=image' });
  slide.addImage({ x: 5.2, y: 1.0, w: 4.5, h: 2.7, path: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ovkdAY2Ik5UMvvSHoRZ5thD3lvRxOo1sHuJ-KKcv32f4Ul0XyZ-oAJav_pZbSLdtS8l8GrjMcO9b/pubchart?oid=1601459520&format=image' });
  slide.addImage({ x: 2.5, y: 3.9, w: 5.0, h: 1.5, path: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ovkdAY2Ik5UMvvSHoRZ5thD3lvRxOo1sHuJ-KKcv32f4Ul0XyZ-oAJav_pZbSLdtS8l8GrjMcO9b/pubchart?oid=1946349077&format=image' });
}

// ── Slide 4 — Meta Performance ────────────────────────────────────────────────
function addSlide4(pres, metaBullets) {
  const slide = pres.addSlide();
  slide.background = { color: BG };
  slideTitle(slide, 'Meta Performance');

  const lines = (metaBullets || '')
    .split('\n')
    .map(l => l.replace(/^[•\-]\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);

  const runs = [];
  lines.forEach(line => {
    const sep = line.indexOf(' — '); // em-dash with spaces
    if (sep !== -1) {
      runs.push({ text: line.slice(0, sep),        options: { bold: true,  breakLine: false } });
      runs.push({ text: ' — ' + line.slice(sep + 3), options: { bold: false, breakLine: true  } });
    } else {
      runs.push({ text: line, options: { bold: true, breakLine: true } });
    }
  });

  if (runs.length > 0) {
    slide.addText(runs, {
      x: 0.5, y: 1.1, w: 9.0, h: 3.8,
      fontSize: 13, color: '333333', fontFace: 'Calibri',
      bullet: true, paraSpaceAfter: 10,
    });
  }

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 5.2, w: 10, h: 0.425,
    fill: { color: DARK_GREEN }, line: { width: 0, color: DARK_GREEN },
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
  slide.background = { color: GREEN };

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.08, h: 5.625,
    fill: { color: DARK_GREEN }, line: { width: 0, color: DARK_GREEN },
  });

  slide.addText('Questions?', {
    x: 0.5, y: 1.8, w: 9, h: 1.0,
    fontSize: 48, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
  });

  slide.addText('Watertight', {
    x: 0.5, y: 3.1, w: 9, h: 0.4,
    fontSize: 14, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { weekRange, kpis = {}, contextBlurb, metaBullets, video, image, partnerships } = req.body || {};

    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9';

    addSlide1(pres, weekRange || '');
    addSlide2(pres, kpis, contextBlurb || '');
    addSlide3(pres);
    addSlide4(pres, metaBullets || '');
    addCreativeSlide(pres, 'Creative Performance — Video',  video  || []);
    addCreativeSlide(pres, 'Creative Performance — Images', image  || []);
    addSlide7(pres, partnerships || []);
    addSlide8(pres);

    const base64 = await pres.write({ outputType: 'base64' });
    const safeName = 'SoWell_Weekly_' + (weekRange || '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_') + '.pptx';

    return res.status(200).json({ pptx: base64, filename: safeName });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
