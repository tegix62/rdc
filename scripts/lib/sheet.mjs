import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { processImage } from './process.mjs';
import { escapeXml } from './text.mjs';

const BG = '#141418';
const INK = '#e8e8ea';
const MUTED = '#9a9aa4';
const ACCENT = '#7d9bd8';

/**
 * Presets to compare. The point of a contact sheet is deciding how heavy the
 * watermark should be, so these bracket the current setting rather than
 * showing unrelated looks.
 */
export const PRESETS = [
  { id: 'original', label: 'Original', note: 'no watermark', mutate: (c) => ({
      ...c, veil: { ...c.veil, enabled: false }, marks: { ...c.marks, enabled: false } }) },
  { id: 'subtle', label: 'Subtle', note: 'veil ×0.55', mutate: (c) => ({
      ...c, veil: { ...c.veil, edgeOpacity: c.veil.edgeOpacity * 0.55, centerOpacity: c.veil.centerOpacity * 0.55 } }) },
  { id: 'current', label: 'Current settings', note: 'as configured', mutate: (c) => c },
  { id: 'strong', label: 'Stronger', note: 'veil ×1.6', mutate: (c) => ({
      ...c, veil: { ...c.veil, edgeOpacity: c.veil.edgeOpacity * 1.6, centerOpacity: c.veil.centerOpacity * 1.6 } }) },
  { id: 'marks-only', label: 'Marks only', note: 'no veil', mutate: (c) => ({
      ...c, veil: { ...c.veil, enabled: false } }) },
  { id: 'veil-only', label: 'Veil only', note: 'no edge marks', mutate: (c) => ({
      ...c, marks: { ...c.marks, enabled: false } }) },
];

/**
 * Render one image under every preset and lay the results out in a labelled
 * grid, followed by 100% detail crops of each covert mark.
 *
 * The detail strip is the part that matters: the marks are meant to be hard to
 * spot, so a downscaled contact sheet cannot show whether one is legible,
 * correctly placed, or accidentally sitting somewhere it will be cropped off.
 */
export async function buildContactSheet({ input, name, config, outDir, panelWidth = 620, presets = PRESETS }) {
  const work = await fs.mkdtemp(path.join(outDir, 'panels-'));

  const panels = [];
  let detailSource = null;

  for (const preset of presets) {
    const cfg = {
      ...preset.mutate(config),
      output: { ...config.output, widths: [panelWidth * 2], formats: ['png'], lqip: false },
    };
    const result = await processImage({
      key: name, slug: preset.id, input, config: cfg, outDir: work,
    });
    const rendered = path.join(work, result.variants[0].file);
    const buf = await sharp(rendered).resize({ width: panelWidth }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    panels.push({ ...preset, buffer: buf, width: meta.width, height: meta.height });

    // Detail crops come from the "current settings" pass at full preview size,
    // so they show what the real output looks like, not a resized panel.
    if (preset.id === 'current' && result.marks.length) {
      detailSource = { file: rendered, marks: result.marks };
    }
  }

  const cols = panels.length >= 6 ? 3 : 2;
  const rows = Math.ceil(panels.length / cols);
  const panelH = Math.max(...panels.map((p) => p.height));
  const PAD = 26;
  const LABEL = 40;
  const HEADER = 92;

  const cellW = panelWidth + PAD;
  const cellH = panelH + LABEL + PAD;
  const gridW = cols * cellW + PAD;

  const details = detailSource ? await buildDetailStrip(detailSource, gridW - PAD * 2) : null;
  const detailH = details ? details.height + LABEL + PAD * 2 : 0;

  const canvasW = gridW;
  const canvasH = HEADER + rows * cellH + PAD + detailH;

  const composites = [];
  const labels = [];

  panels.forEach((p, i) => {
    const cx = PAD + (i % cols) * cellW;
    const cy = HEADER + Math.floor(i / cols) * cellH;
    composites.push({ input: p.buffer, left: cx, top: cy });
    labels.push(
      `<text x="${cx}" y="${cy + p.height + 24}" font-size="15" font-weight="600" fill="${p.id === 'current' ? ACCENT : INK}">${escapeXml(p.label)}</text>`,
      `<text x="${cx + textWidth(p.label, 15) + 10}" y="${cy + p.height + 24}" font-size="13" fill="${MUTED}">${escapeXml(p.note)}</text>`
    );
  });

  if (details) {
    const dy = HEADER + rows * cellH + PAD;
    composites.push({ input: details.buffer, left: PAD, top: dy + LABEL });
    labels.push(
      `<text x="${PAD}" y="${dy + 24}" font-size="15" font-weight="600" fill="${INK}">${details.scale < 1 ? 'Edge marks' : 'Edge marks at 100%'}</text>`,
      `<text x="${PAD + 190}" y="${dy + 24}" font-size="13" fill="${MUTED}">${escapeXml(
        details.scale < 1
          ? `shown at ${Math.round(details.scale * 100)}% to fit — larger in the delivered file`
          : 'actual size in the delivered file — this is what a careful eye would have to catch'
      )}</text>`
    );
  }

  const header = `
    <text x="${PAD}" y="38" font-size="21" font-weight="700" fill="${INK}">${escapeXml(name)}</text>
    <text x="${PAD}" y="64" font-size="13" fill="${MUTED}">${escapeXml(
      `veil ${config.veil.centerOpacity}→${config.veil.edgeOpacity} · falloff ${config.veil.falloff} · ${config.marks.count} marks · contrast ${config.marks.contrastDelta}`
    )}</text>`;

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
  <style>text { font-family: "Liberation Sans", "DejaVu Sans", sans-serif; }</style>
  ${header}
  ${labels.join('\n  ')}
</svg>`;

  const sheet = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: BG },
  })
    .composite([...composites, { input: Buffer.from(overlay), density: 72, left: 0, top: 0 }])
    .png()
    .toBuffer();

  await fs.rm(work, { recursive: true, force: true });
  return sheet;
}

/** 100% crops around each placed mark, laid out in a row with a hairline box. */
async function buildDetailStrip({ file, marks }, maxWidth) {
  const img = sharp(file);
  const meta = await img.metadata();
  const PAD = 14;
  const H = 96;

  const crops = [];
  for (const m of marks) {
    const padX = Math.round(m.width * 0.35) + 12;
    const padY = Math.round(m.height * 0.9) + 12;
    const left = Math.max(0, m.left - padX);
    const top = Math.max(0, m.top - padY);
    const width = Math.min(meta.width - left, m.width + padX * 2);
    const height = Math.min(meta.height - top, m.height + padY * 2);
    if (width < 4 || height < 4) continue;

    let crop = await sharp(file).extract({ left, top, width, height }).png().toBuffer();

    // Marks on the left and right edges are drawn rotated, so their crop comes
    // out as a tall unreadable sliver. Turn it back to horizontal — the whole
    // point of this strip is being able to read what the mark says.
    const unrotate = m.edge === 'left' ? 90 : m.edge === 'right' ? -90 : 0;
    if (unrotate) crop = await sharp(crop).rotate(unrotate).png().toBuffer();

    // Normalise every crop to the same height so the strip reads as a row.
    crop = await sharp(crop).resize({ height: H, fit: 'contain', background: BG }).png().toBuffer();
    const cm = await sharp(crop).metadata();
    crops.push({ buffer: crop, width: cm.width, height: H, text: m.text, edge: m.edge });
  }

  if (!crops.length) return null;

  const cellWidth = (c) => Math.max(c.width, textWidth(`${c.edge} · ${c.text}`, 12));
  const totalW = crops.reduce((s, c) => s + cellWidth(c) + PAD, 0) - PAD;
  const scale = totalW > maxWidth ? maxWidth / totalW : 1;

  const composites = [];
  const boxes = [];
  let x = 0;
  for (const c of crops) {
    const w = Math.max(1, Math.round(c.width * scale));
    const h = Math.max(1, Math.round(c.height * scale));
    const buf = scale < 1 ? await sharp(c.buffer).resize({ width: w, height: h }).png().toBuffer() : c.buffer;
    composites.push({ input: buf, left: x, top: 0 });
    // Reserve enough room for the caption too, or two narrow crops sitting
    // side by side end up with overlapping labels.
    const cellW = Math.round(cellWidth(c) * scale);
    boxes.push(
      `<rect x="${x + 0.5}" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#3a3a44" stroke-width="1"/>`,
      `<text x="${x}" y="${h + 16}" font-size="12" fill="${MUTED}">${escapeXml(`${c.edge} · ${c.text}`)}</text>`
    );
    x += cellW + PAD;
  }

  const stripH = Math.round(H * scale) + 22;
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${stripH}">
  <style>text { font-family: "Liberation Sans", "DejaVu Sans", sans-serif; }</style>
  ${boxes.join('\n  ')}
</svg>`;

  const buffer = await sharp({
    create: { width: Math.max(1, x), height: stripH, channels: 3, background: BG },
  })
    .composite([...composites, { input: Buffer.from(overlay), density: 72, left: 0, top: 0 }])
    .png()
    .toBuffer();

  return { buffer, height: stripH, scale };
}

/** Rough advance width, only used to position a secondary label after a primary one. */
function textWidth(s, size) {
  return Math.round(s.length * size * 0.55);
}
