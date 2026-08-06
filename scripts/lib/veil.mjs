import sharp from 'sharp';
import { escapeXml, measureText } from './text.mjs';

/**
 * Build the tiled "pattern layer" — the overt half of the watermark.
 *
 * Two pieces:
 *   1. a full-canvas SVG of the phrase repeated on a rotated grid
 *   2. a radial alpha mask that fades that grid out toward the centre
 *
 * The mask is applied with `dest-in`, so the layer's own alpha is multiplied
 * by the gradient. Drawing the type at `edgeOpacity` and letting the mask
 * scale it *down* toward `centerOpacity` keeps the strongest ink at the frame
 * edge, where it costs the least — the subject in the middle stays clean.
 */
export async function buildVeil(width, height, cfg, rng, stats = null) {
  const long = Math.max(width, height);
  const fontSize = Math.max(9, Math.round(cfg.sizeRatio * long));
  const { color, edgeOpacity } = resolveInk(cfg, stats);

  const metrics = await measureText(cfg.text, {
    fontSize,
    fontFamily: cfg.fontFamily,
    fontWeight: cfg.fontWeight,
    letterSpacing: cfg.letterSpacing,
  });

  const stepX = metrics.width * (1 + cfg.gapRatio);
  const stepY = Math.max(fontSize * 1.2, metrics.height * cfg.rowGapRatio);

  // Rotating about the centre means the grid must cover the circumscribed
  // square of the canvas, otherwise corners come up bare.
  const diag = Math.ceil(Math.hypot(width, height));
  const cx = width / 2;
  const cy = height / 2;
  const x0 = cx - diag / 2;
  const y0 = cy - diag / 2;

  const rows = [];
  let rowIndex = 0;
  for (let y = y0; y <= cy + diag / 2; y += stepY) {
    // Half-step brick offset plus a little seeded jitter: a perfectly regular
    // lattice is trivial to model and subtract, an irregular one is not.
    const offset = (rowIndex % 2) * (stepX / 2) + rng.range(-0.12, 0.12) * stepX;
    for (let x = x0 - stepX + offset; x <= cx + diag / 2; x += stepX) {
      rows.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" xml:space="preserve">${escapeXml(cfg.text)}</text>`
      );
    }
    rowIndex++;
  }

  const layerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <g transform="rotate(${cfg.angle} ${cx.toFixed(1)} ${cy.toFixed(1)})"
     font-family="${escapeXml(cfg.fontFamily)}"
     font-size="${fontSize}"
     font-weight="${cfg.fontWeight}"
     letter-spacing="${(cfg.letterSpacing * fontSize).toFixed(3)}"
     fill="${color}"
     fill-opacity="${edgeOpacity}">
    ${rows.join('\n    ')}
  </g>
</svg>`;

  const maskSvg = buildVignetteMask(width, height, cfg);

  // density 72 makes one SVG user unit exactly one pixel; librsvg otherwise
  // treats the units as points and silently scales the layer by 96/72.
  const layer = await sharp(Buffer.from(layerSvg), { density: 72 })
    .ensureAlpha()
    .composite([{ input: Buffer.from(maskSvg), density: 72, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return { buffer: layer, glyphCount: rows.length, fontSize, color, edgeOpacity };
}

/**
 * Pick the veil's ink.
 *
 * With `color: "auto"` the layer flips to dark type on bright images. A fixed
 * white veil is simply not there on a white-background product shot — it
 * composites white over white — which is the one case where a portfolio most
 * needs it. Dark ink also reads stronger per unit of opacity than light ink
 * does, so the opacity is trimmed to keep both directions equally subtle.
 */
function resolveInk(cfg, stats) {
  if (cfg.color !== 'auto') {
    return { color: cfg.color, edgeOpacity: cfg.edgeOpacity };
  }
  const luma = stats?.luma ?? 0.5;
  if (luma > 0.55) {
    return { color: cfg.darkColor ?? '#000000', edgeOpacity: cfg.edgeOpacity * (cfg.darkOpacityScale ?? 0.72) };
  }
  return { color: cfg.lightColor ?? '#ffffff', edgeOpacity: cfg.edgeOpacity };
}

/**
 * Radial gradient in objectBoundingBox units, so on a non-square frame it
 * becomes an ellipse that follows the aspect ratio — the fade tracks the
 * frame instead of leaving a circular halo on wide crops.
 */
function buildVignetteMask(width, height, cfg) {
  const ratio = cfg.edgeOpacity > 0 ? cfg.centerOpacity / cfg.edgeOpacity : 0;
  const STOPS = 12;
  const stops = [];
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    const a = ratio + (1 - ratio) * Math.pow(t, cfg.falloff);
    stops.push(
      `<stop offset="${t.toFixed(4)}" stop-color="#ffffff" stop-opacity="${a.toFixed(5)}"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="vig" cx="50%" cy="50%" r="72%">
      ${stops.join('\n      ')}
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#vig)"/>
</svg>`;
}
