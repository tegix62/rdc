/*
  A CLUSTER OF RADICALLY DIFFERENT SIZES - for the Type tab.

  Chris, on the row-based cluster (lib/cluster.ts): "more variation in
  sizes ... if we can split it into more radical sizing, that would be
  pretty rad." Rows cannot do that: one big piece makes its whole row tall
  and leaves holes round the small ones.

  So pieces are placed the way a word cloud places words. The first piece
  sits in the middle. Every next one walks out from the middle along a
  spiral and takes the first spot where it touches nothing (at a hairline
  gap), so each lands as close to the centre as the pieces before it
  allow. The spiral is warped by noise - its radius stretched and shrunk
  with the angle, the same smooth noise as the lens's outline - so the
  outline is lumpy and organic rather than a neat ellipse, and different
  for every seed. Squashed vertically on a wide screen, so the shape suits
  the window.

  Sizes are AREAS: a piece of size 2 covers twice the area of a piece of
  size 1, whatever its shape, so a long wordmark and a square drawing of
  the same size weigh the same on the page. The unit is chosen so all the
  pieces together fill about half the space given, then the whole layout
  is scaled down if it came out wider than that space.

  Order is importance: the caller passes the pieces biggest or most
  important first, and the first ones end nearest the middle.

  Plain code, no DOM: scripts/test-spiral-cluster.mjs checks it in Node.
*/
// With the extension, so Node can run the test straight from the source.
import {noise1} from './cluster.ts';

export interface SpiralPiece {
  w: number;
  h: number;
  /** Area factor: 2 covers twice the area of 1. */
  size: number;
}

export interface SpiralOptions {
  width: number;
  /** The height the pieces are sized to fill about half of; the layout may come out taller or shorter. */
  height: number;
  gap: number;
  seed: number;
  /** How much the noise stretches the spiral, as a share of its radius. */
  wobble?: number;
  /** Vertical squash of the spiral: under 1 for a wide shape, over 1 for a tall one. */
  squash?: number;
  /** Share of width x height the pieces' areas add up to. */
  fill?: number;
}

export interface SpiralPlaced {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpiralLayout {
  placed: SpiralPlaced[];
  width: number;
  height: number;
}

export function layoutSpiral(pieces: SpiralPiece[], o: SpiralOptions): SpiralLayout {
  if (!pieces.length) return {placed: [], width: o.width, height: 0};
  const fill = o.fill ?? 0.5;
  const wobble = o.wobble ?? 0.35;
  const squash = o.squash ?? 1;
  const total = pieces.reduce((n, p) => n + Math.max(0.05, p.size), 0);
  const unit = (o.width * o.height * fill) / total;

  // Each piece's box at its area, no wider than the space.
  const dims = pieces.map((p) => {
    const ratio = p.w / p.h || 1;
    let h = Math.sqrt((unit * Math.max(0.05, p.size)) / ratio);
    let w = h * ratio;
    if (w > o.width * 0.92) {
      w = o.width * 0.92;
      h = w / ratio;
    }
    return {w, h};
  });

  const g = o.gap;
  const placed: SpiralPlaced[] = [];
  const free = (x: number, y: number, w: number, h: number) =>
    placed.every((q) => x + w + g <= q.x || q.x + q.w + g <= x || y + h + g <= q.y || q.y + q.h + g <= y);

  dims.forEach(({w, h}, i) => {
    if (i === 0) {
      placed.push({i, x: -w / 2, y: -h / 2, w, h});
      return;
    }
    // Out along the spiral; the step in angle shrinks as the radius grows,
    // so the walk moves about the same few pixels each time.
    let theta = 0;
    for (let n = 0; n < 60000; n++) {
      const r = 1.6 * theta;
      const stretch = 1 + wobble * noise1(o.seed, theta * 0.9);
      const cx = Math.cos(theta) * r * stretch;
      const cy = Math.sin(theta) * r * stretch * squash;
      const x = cx - w / 2;
      const y = cy - h / 2;
      if (free(x, y, w, h)) {
        placed.push({i, x, y, w, h});
        return;
      }
      theta += Math.max(0.02, Math.min(0.4, 5 / Math.max(r, 1)));
    }
    // Never expected; somewhere safe below everything rather than overlapping.
    const bottom = Math.max(...placed.map((q) => q.y + q.h));
    placed.push({i, x: -w / 2, y: bottom + g, w, h});
  });

  // To the space: shift to the origin, scale down if too wide, centre.
  const minX = Math.min(...placed.map((q) => q.x));
  const minY = Math.min(...placed.map((q) => q.y));
  const maxX = Math.max(...placed.map((q) => q.x + q.w));
  const maxY = Math.max(...placed.map((q) => q.y + q.h));
  const k = Math.min(1, o.width / (maxX - minX));
  const off = (o.width - (maxX - minX) * k) / 2;
  return {
    placed: placed.map((q) => ({i: q.i, x: off + (q.x - minX) * k, y: (q.y - minY) * k, w: q.w * k, h: q.h * k})),
    width: o.width,
    height: (maxY - minY) * k,
  };
}
