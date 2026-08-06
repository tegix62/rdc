import sharp from 'sharp';

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Render a single line of text to a tightly-cropped RGBA buffer.
 *
 * SVG gives no way to ask "how wide is this string?" up front, so we draw into
 * an oversized transparent canvas and trim back to the ink. The returned
 * width/height are then exact, which is what makes precise edge placement and
 * overlap-avoidance possible later.
 */
export async function renderText(text, opts = {}) {
  const {
    fontSize = 16,
    fontFamily = 'Liberation Sans, DejaVu Sans, sans-serif',
    fontWeight = 500,
    letterSpacing = 0, // em
    color = '#ffffff',
    opacity = 1,
    rotate = 0,
  } = opts;

  // Generous canvas: worst-case advance is ~1.2em/char plus tracking.
  const pad = Math.ceil(fontSize * 1.5);
  const w = Math.ceil(text.length * fontSize * (1.25 + letterSpacing) + pad * 2);
  const h = Math.ceil(fontSize * 2.4 + pad);
  const baseline = Math.round(h * 0.66);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <text x="${pad}" y="${baseline}"
        font-family="${escapeXml(fontFamily)}"
        font-size="${fontSize}"
        font-weight="${fontWeight}"
        letter-spacing="${(letterSpacing * fontSize).toFixed(3)}"
        fill="${color}"
        fill-opacity="${opacity}"
        xml:space="preserve">${escapeXml(text)}</text>
</svg>`;

  // density 72 == 1 SVG unit per pixel, so `fontSize` means what it says.
  let pipeline = sharp(Buffer.from(svg), { density: 72 }).trim({ threshold: 0 });
  if (rotate % 360 !== 0) {
    pipeline = pipeline.rotate(rotate, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  const { data, info } = await pipeline
    .png()
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info.width, height: info.height };
}

/**
 * Measure a string without keeping the pixels — used to work out the tile
 * pitch for the veil before we lay out hundreds of copies of it.
 */
export async function measureText(text, opts) {
  const { width, height } = await renderText(text, opts);
  return { width, height };
}
