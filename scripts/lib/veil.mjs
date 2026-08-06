import sharp from 'sharp';
import { escapeXml, measureText } from './text.mjs';

/**
 * Build the tiled "pattern layer" — the overt half of the watermark.
 *
 * Three pieces:
 *   1. a full-canvas SVG of the phrase repeated on a rotated grid
 *   2. a radial alpha mask that fades that grid out toward the centre
 *   3. in `auto` mode, a per-pixel ink colour chosen from local brightness
 *
 * The vignette is applied with `dest-in`, so the layer's own alpha is
 * multiplied by the gradient. Drawing the type at `edgeOpacity` and letting the
 * mask scale it *down* toward `centerOpacity` keeps the strongest ink at the
 * frame edge, where it costs the least — the subject in the middle stays clean.
 */
export async function buildVeil(width, height, cfg, rng, stats = null, base = null) {
  const long = Math.max(width, height);
  const fontSize = Math.max(9, Math.round(cfg.sizeRatio * long));

  const metrics = await measureText(cfg.text, {
    fontSize,
    fontFamily: cfg.fontFamily,
    fontWeight: cfg.fontWeight,
    letterSpacing: cfg.letterSpacing,
  });

  const layout = buildLayout(width, height, cfg, rng, fontSize, metrics);
  const maskSvg = buildVignetteMask(width, height, cfg);

  const render = (color, opacity) =>
    renderLayer(width, height, cfg, layout, fontSize, color, opacity, maskSvg);

  if (cfg.color === 'auto' && base) {
    const buffer = await paintByBrightness({
      width, height, cfg, base,
      // Full-strength stencil: opacity is applied per pixel later, because it
      // differs between the light and dark ink.
      stencil: await render('#ffffff', 1),
    });
    return { buffer, glyphCount: layout.length, fontSize, color: 'auto (per-region)' };
  }

  const { color, edgeOpacity } = resolveInk(cfg, stats);
  return {
    buffer: await render(color, edgeOpacity),
    glyphCount: layout.length,
    fontSize,
    color,
    edgeOpacity,
  };
}

/**
 * Lay the phrase out on a rotated grid covering the whole frame.
 *
 * Rotating about the centre means the grid must cover the circumscribed square
 * of the canvas, otherwise the corners come up bare.
 */
function buildLayout(width, height, cfg, rng, fontSize, metrics) {
  const stepX = metrics.width * (1 + cfg.gapRatio);
  const stepY = Math.max(fontSize * 1.2, metrics.height * cfg.rowGapRatio);

  const diag = Math.ceil(Math.hypot(width, height));
  const cx = width / 2;
  const cy = height / 2;

  const rows = [];
  let rowIndex = 0;
  for (let y = cy - diag / 2; y <= cy + diag / 2; y += stepY) {
    // Half-step brick offset plus a little seeded jitter: a perfectly regular
    // lattice is trivial to model and subtract, an irregular one is not.
    const offset = (rowIndex % 2) * (stepX / 2) + rng.range(-0.12, 0.12) * stepX;
    for (let x = cx - diag / 2 - stepX + offset; x <= cx + diag / 2; x += stepX) {
      rows.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" xml:space="preserve">${escapeXml(cfg.text)}</text>`
      );
    }
    rowIndex++;
  }
  return rows;
}

async function renderLayer(width, height, cfg, rows, fontSize, color, opacity, maskSvg) {
  const cx = width / 2;
  const cy = height / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <g transform="rotate(${cfg.angle} ${cx.toFixed(1)} ${cy.toFixed(1)})"
     font-family="${escapeXml(cfg.fontFamily)}"
     font-size="${fontSize}"
     font-weight="${cfg.fontWeight}"
     letter-spacing="${(cfg.letterSpacing * fontSize).toFixed(3)}"
     fill="${color}"
     fill-opacity="${opacity}">
    ${rows.join('\n    ')}
  </g>
</svg>`;

  // density 72 makes one SVG user unit exactly one pixel; librsvg otherwise
  // treats the units as points and silently scales the layer by 96/72.
  return sharp(Buffer.from(svg), { density: 72 })
    .ensureAlpha()
    .composite([{ input: Buffer.from(maskSvg), density: 72, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/**
 * Colour a single veil stencil per pixel, according to how bright the
 * photograph is underneath.
 *
 * A single ink chosen from the frame's *average* brightness fails on any image
 * with real dynamic range. Measured on a photo of a white cumulus against a
 * dark sky: the frame averages 0.21, so a global decision picks white ink,
 * which then lands at a peak delta of 21-24 on the sky but only 11-13 on the
 * cloud - half the strength precisely where the subject is, and a bright
 * background needs more delta to read, not less.
 *
 * The obvious fix - render a light copy and a dark copy and crossfade between
 * them - does not work: wherever both are partly visible their strokes overlap,
 * one lightening and the other darkening the same pixels, and they cancel. On a
 * mid-grey frame that measured a peak of 8 against 19 for a single ink.
 *
 * So there is exactly one stencil and each of its pixels is painted a single
 * colour. Nothing overlaps, so nothing can cancel.
 */
async function paintByBrightness({ width, height, cfg, base, stencil }) {
  const { data: rgba } = await sharp(stencil)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const brightness = await brightnessMask(base, width, height, cfg);

  const light = hexToRgb(cfg.lightColor ?? '#ffffff');
  const dark = hexToRgb(cfg.darkColor ?? '#000000');
  const lightOp = cfg.edgeOpacity;
  const darkOp = cfg.edgeOpacity * (cfg.darkOpacityScale ?? 0.72);

  const out = Buffer.allocUnsafe(width * height * 4);
  for (let p = 0, i = 0; p < brightness.length; p++, i += 4) {
    const t = brightness[p] / 255;
    out[i] = light.r + (dark.r - light.r) * t;
    out[i + 1] = light.g + (dark.g - light.g) * t;
    out[i + 2] = light.b + (dark.b - light.b) * t;
    // The stencil carries glyph coverage and the vignette falloff; ink opacity
    // is folded in here because it differs between the light and dark inks.
    out[i + 3] = rgba[i + 3] * (lightOp + (darkOp - lightOp) * t);
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * A soft map of where the image is bright, as a single-channel buffer.
 *
 * Computed small and blurred, then scaled up: the mask has to follow broad
 * regions — sky versus cloud — not individual branches and wires. Chasing fine
 * detail would make the ink flicker between light and dark along every edge.
 */
async function brightnessMask(base, width, height, cfg) {
  const SMALL = 220;
  const long = Math.max(width, height);
  const sw = Math.max(8, Math.round((width / long) * SMALL));
  const sh = Math.max(8, Math.round((height / long) * SMALL));

  const centre = cfg.autoSwitch ?? 0.55;
  const band = Math.max(0.02, cfg.autoBand ?? 0.06);
  const lo = (centre - band) * 255;
  const hi = (centre + band) * 255;
  // Contrast-stretch so the switch happens across a narrow band and is flat
  // outside it. The band stays narrow on purpose: mid-band pixels get an ink
  // halfway between light and dark, which is exactly the tone with no contrast
  // against a mid-tone background. Better to commit to one side quickly and let
  // the mask's own blur keep the boundary smooth in space.
  const a = 255 / (hi - lo);
  const b = -lo * a;

  const small = await sharp(base)
    .greyscale()
    .resize({ width: sw, height: sh, fit: 'fill' })
    .blur(3)
    .linear(a, b)
    .toBuffer();

  const { data } = await sharp(small)
    .resize({ width, height, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return data;
}


/**
 * Ink for the non-adaptive paths: an explicit colour, or a single global
 * choice when there is no image to measure against.
 */
function resolveInk(cfg, stats) {
  if (cfg.color !== 'auto') {
    return { color: cfg.color, edgeOpacity: cfg.edgeOpacity };
  }
  const luma = stats?.luma ?? 0.5;
  if (luma > (cfg.autoSwitch ?? 0.55)) {
    return {
      color: cfg.darkColor ?? '#000000',
      edgeOpacity: cfg.edgeOpacity * (cfg.darkOpacityScale ?? 0.72),
    };
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
