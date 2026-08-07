import sharp from 'sharp';
import { renderText, escapeXml } from './text.mjs';
import { contrastingColor } from './marks.mjs';

/**
 * Credit marks — the "leave accreditation in the image" half of the problem,
 * as distinct from the "make theft annoying" half the veil handles.
 *
 * The design constraint is different, and it is easy to get backwards: a mark
 * that hides from a thief also hides from someone who would happily credit
 * you. These are sized against the width the image is *displayed* at, not the
 * file's pixel width, because the realistic route out is a phone screenshot of
 * a tile rendered at a few hundred pixels.
 */

/** Fill {name}, {studio}, {site}, {instagram}, {year} from the identity block. */
export function fillTemplate(template, identity = {}) {
  return String(template).replace(/\{(\w+)\}/g, (whole, key) => {
    if (key === 'year') return String(new Date().getFullYear());
    return identity[key] ?? whole;
  });
}

/**
 * Size type so it is legible where the image is actually *seen*.
 *
 * `sizeRatio` alone is scale-invariant, so it cannot express "must still be
 * readable on screen" — a mark at 1% of the file is 20px in a 2000px master
 * and 4px once the browser has scaled that into a 400px tile.
 *
 * `minDisplayPx` is the floor that actually matters, and it is stated in CSS
 * pixels *as rendered*. It gets scaled into the file by however much the
 * browser will shrink it, so a narrow `displayWidth` produces larger type in
 * the file rather than an illegible mark.
 */
function legibleFontSize(fileWidth, cfg) {
  const displayWidth = cfg.displayWidth ?? 600;
  const scale = fileWidth / displayWidth;
  const fromRatio = (cfg.sizeRatio ?? 0.02) * fileWidth;
  const displayFloor = (cfg.minDisplayPx ?? 10) * scale;
  return Math.max(cfg.minPx ?? 8, Math.round(fromRatio), Math.round(displayFloor));
}

/**
 * A single discreet credit line inside the frame — a colophon.
 *
 * One mark, one corner, always the same place. Being predictable is the point:
 * it reads as a signature rather than as damage, and someone looking for the
 * author knows where to look. Colour is taken from the pixels underneath so it
 * sits a fixed perceptual distance from its background instead of glaring on a
 * dark frame and vanishing on a light one.
 */
export async function buildColophon(analyzer, width, height, cfg, identity) {
  const text = fillTemplate(cfg.text ?? '{studio}', identity);
  const fontSize = legibleFontSize(Math.max(width, height), cfg);
  const inset = Math.round((cfg.insetRatio ?? 0.028) * Math.max(width, height));

  const probe = await renderText(text, {
    fontSize,
    fontFamily: cfg.fontFamily,
    fontWeight: cfg.fontWeight ?? 500,
    letterSpacing: cfg.letterSpacing ?? 0.14,
    color: '#ffffff',
  });

  const pos = cornerPosition(cfg.corner ?? 'bottom-right', width, height, probe.width, probe.height, inset);
  if (!pos) return null;

  const stats = analyzer.region(pos.left, pos.top, probe.width, probe.height);
  const color = contrastingColor(stats, cfg.contrastDelta ?? 0.22);

  const mark = await renderText(text, {
    fontSize,
    fontFamily: cfg.fontFamily,
    fontWeight: cfg.fontWeight ?? 500,
    letterSpacing: cfg.letterSpacing ?? 0.14,
    color,
    opacity: cfg.opacity ?? 0.85,
  });

  return {
    composite: { input: mark.buffer, left: pos.left, top: pos.top, blend: 'over' },
    placement: { ...pos, width: mark.width, height: mark.height, text, color, fontSize },
  };
}

function cornerPosition(corner, width, height, markW, markH, inset) {
  const right = width - inset - markW;
  const bottom = height - inset - markH;
  if (right < 0 || bottom < 0) return null;
  switch (corner) {
    case 'top-left': return { left: inset, top: inset, corner };
    case 'top-right': return { left: right, top: inset, corner };
    case 'bottom-left': return { left: inset, top: bottom, corner };
    default: return { left: right, top: bottom, corner };
  }
}

/**
 * A plate: the image mounted on a margin, credited in the border.
 *
 * Nothing is drawn on the photograph at all — the credit lives in added space
 * beside it, the way a plate is captioned in a print book. It cannot distract
 * from the work because it is not on the work, and it survives a screenshot
 * because it is part of the delivered pixels.
 *
 * The cost is real and worth stating: it changes the aspect ratio, so a grid
 * built on the image's own proportions has to account for the margin.
 */
export async function applyPlate(image, width, height, cfg, identity) {
  const long = Math.max(width, height);
  const text = fillTemplate(cfg.text ?? '{studio} · {site}', identity);
  const fontSize = legibleFontSize(long, cfg);

  // Rounded, not just floored: sharp rejects fractional canvas dimensions, and
  // `fontSize * 2.6` is very rarely a whole number.
  const band = Math.round(Math.max(fontSize * 2.6, (cfg.captionRatio ?? 0.075) * long));
  const side = cfg.style === 'mat' ? Math.round((cfg.matRatio ?? 0.035) * long) : 0;

  const canvasW = width + side * 2;
  const canvasH = height + side + band;
  const paper = cfg.paper ?? '#ffffff';
  const ink = cfg.ink ?? '#002885';

  const caption = await renderText(text, {
    fontSize,
    fontFamily: cfg.fontFamily,
    fontWeight: cfg.fontWeight ?? 500,
    letterSpacing: cfg.letterSpacing ?? 0.22,
    color: ink,
    opacity: cfg.opacity ?? 1,
  });

  // Optically centre the caption in the band rather than centring its bounding
  // box: trimmed type has no consistent leading, so a box-centred line sits
  // visibly high.
  const bandTop = side + height;
  const capTop = Math.round(bandTop + (band - caption.height) / 2);
  const capLeft =
    cfg.align === 'left'
      ? side
      : cfg.align === 'right'
        ? canvasW - side - caption.width
        : Math.round((canvasW - caption.width) / 2);

  const layers = [
    { input: image, left: side, top: side },
    { input: caption.buffer, left: Math.max(0, capLeft), top: capTop },
  ];

  // A hairline between plate and caption, if asked for — the one piece of
  // ornament that reads as typographic rather than decorative.
  if (cfg.rule) {
    const y = bandTop + Math.round(band * 0.06);
    const ruleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="2">
  <rect x="${side}" y="0" width="${canvasW - side * 2}" height="1" fill="${ink}" fill-opacity="0.25"/>
</svg>`;
    layers.splice(1, 0, { input: Buffer.from(ruleSvg), density: 72, left: 0, top: y });
  }

  const buffer = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: paper },
  })
    .composite(layers)
    // The caption is RGBA, so compositing it turns the whole plate RGBA. The
    // paper is opaque, so that alpha channel is pure overhead in the output.
    .removeAlpha()
    .png({ compressionLevel: 0 })
    .toBuffer();

  return { buffer, width: canvasW, height: canvasH, text, fontSize };
}

/**
 * A blind deboss: the credit pressed into the image rather than printed on it.
 *
 * Renders the line twice, one step lighter and one step darker, offset by a
 * pixel — the same trick as an emboss in print. It reads as an impression in
 * the surface instead of ink sitting on top, which is far less distracting at
 * a given legibility than flat type, because the eye reads it as texture until
 * it looks directly at it.
 */
export async function buildDeboss(analyzer, width, height, cfg, identity) {
  const text = fillTemplate(cfg.text ?? '{studio}', identity);
  const fontSize = legibleFontSize(Math.max(width, height), cfg);
  const inset = Math.round((cfg.insetRatio ?? 0.028) * Math.max(width, height));

  const probe = await renderText(text, {
    fontSize, fontFamily: cfg.fontFamily,
    fontWeight: cfg.fontWeight ?? 600,
    letterSpacing: cfg.letterSpacing ?? 0.14,
    color: '#ffffff',
  });

  const pos = cornerPosition(cfg.corner ?? 'bottom-right', width, height, probe.width, probe.height, inset);
  if (!pos) return null;

  const stats = analyzer.region(pos.left, pos.top, probe.width, probe.height);
  const depth = cfg.depth ?? 0.09;
  const shadow = contrastingColor({ ...stats, luma: Math.min(0.98, stats.luma + depth) }, depth);
  const light = contrastingColor({ ...stats, luma: Math.max(0.02, stats.luma - depth) }, depth);

  const step = Math.max(1, Math.round(fontSize * 0.045));
  const opts = {
    fontSize, fontFamily: cfg.fontFamily,
    fontWeight: cfg.fontWeight ?? 600,
    letterSpacing: cfg.letterSpacing ?? 0.14,
    opacity: cfg.opacity ?? 0.9,
  };

  const [dark, bright] = await Promise.all([
    renderText(text, { ...opts, color: shadow }),
    renderText(text, { ...opts, color: light }),
  ]);

  return {
    composites: [
      { input: bright.buffer, left: pos.left, top: pos.top + step, blend: 'over' },
      { input: dark.buffer, left: pos.left, top: pos.top, blend: 'over' },
    ],
    placement: { ...pos, width: dark.width, height: dark.height, text, fontSize },
  };
}
