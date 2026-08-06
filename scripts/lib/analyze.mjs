import sharp from 'sharp';

const GRID = 192; // long-edge resolution of the analysis thumbnail

/**
 * Cheap local-region analysis.
 *
 * Rather than running sharp.stats() once per candidate position (dozens of
 * decodes per image), we decode a single small RGB thumbnail and answer every
 * region query from that buffer in plain JS. At GRID=192 a region query is a
 * few hundred array reads.
 */
export async function createAnalyzer(input, width, height) {
  const long = Math.max(width, height);
  const gw = Math.max(8, Math.round((width / long) * GRID));
  const gh = Math.max(8, Math.round((height / long) * GRID));

  const { data } = await sharp(input)
    .resize({ width: gw, height: gh, fit: 'fill' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const at = (gx, gy) => {
    const i = (gy * gw + gx) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };

  /**
   * Stats for a rectangle given in *full-resolution* pixel coordinates.
   * Returns mean RGB (0–255), mean luminance and luminance stdev (both 0–1).
   */
  function region(x, y, w, h) {
    const gx0 = Math.max(0, Math.min(gw - 1, Math.floor((x / width) * gw)));
    const gy0 = Math.max(0, Math.min(gh - 1, Math.floor((y / height) * gh)));
    const gx1 = Math.max(gx0 + 1, Math.min(gw, Math.ceil(((x + w) / width) * gw)));
    const gy1 = Math.max(gy0 + 1, Math.min(gh, Math.ceil(((y + h) / height) * gh)));

    let n = 0, sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
    for (let gy = gy0; gy < gy1; gy++) {
      for (let gx = gx0; gx < gx1; gx++) {
        const [r, g, b] = at(gx, gy);
        // Rec.709 luma — matches how the eye weights the channels, so the
        // contrast delta we pick later lands where it looks like it should.
        const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sr += r; sg += g; sb += b; sl += l; sl2 += l * l;
        n++;
      }
    }
    const mean = sl / n;
    const variance = Math.max(0, sl2 / n - mean * mean);
    return {
      rgb: [sr / n, sg / n, sb / n],
      luma: mean,
      stdev: Math.sqrt(variance),
      samples: n,
    };
  }

  /** Stats over the whole frame — used to pick the veil's ink colour. */
  function global() {
    return region(0, 0, width, height);
  }

  return { region, global, gridWidth: gw, gridHeight: gh };
}

/**
 * Score a candidate spot for a covert mark.
 *
 * We want busy, mid-tone areas. Visual masking means fine detail hides small
 * low-contrast type from a casual look far better than flat areas do, and
 * textured regions are also the ones inpainting-based removers reconstruct
 * least convincingly. Extremes of luminance are penalised because there is no
 * headroom left to place the mark either side of the local tone.
 */
export function scoreRegion({ luma, stdev }) {
  const texture = Math.min(1, stdev / 0.18);
  const midtone = Math.max(0.12, 1 - Math.abs(luma - 0.5) * 1.7);
  return texture * 0.65 + midtone * 0.35;
}
