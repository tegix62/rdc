import { renderText } from './text.mjs';
import { scoreRegion } from './analyze.mjs';

/**
 * Place the covert marks — the hand-tucked signatures along the edges.
 *
 * For each mark we generate candidate positions along one edge, ask the
 * analyzer what the image actually looks like underneath each, and keep the
 * best-scoring one. The colour is then derived from that specific region
 * rather than fixed in config, so the mark sits a fixed *perceptual* distance
 * from its background instead of glaring on a dark frame and vanishing on a
 * light one.
 */
export async function buildMarks(analyzer, width, height, cfg, rng) {
  const long = Math.max(width, height);
  const fontSize = Math.max(cfg.minPx, Math.round(cfg.sizeRatio * long));
  const inset = Math.round(cfg.insetRatio * long);

  const edges = rng.shuffle(cfg.edges);
  const variants = rng.shuffle(cfg.variants);
  const placed = [];
  const composites = [];

  for (let i = 0; i < cfg.count; i++) {
    const edge = edges[i % edges.length];
    const text = variants[i % variants.length];
    const vertical = cfg.followEdge && (edge === 'left' || edge === 'right');
    const rotate = vertical ? (edge === 'left' ? -90 : 90) : 0;

    // Render once to learn the true footprint, then shop for somewhere to put it.
    const probe = await renderText(text, {
      fontSize,
      fontFamily: cfg.fontFamily,
      fontWeight: cfg.fontWeight,
      letterSpacing: cfg.letterSpacing,
      color: '#ffffff',
      rotate,
    });

    const spot = chooseSpot({
      analyzer, width, height, edge, inset,
      markW: probe.width, markH: probe.height,
      candidates: cfg.candidatesPerEdge, placed, rng,
    });
    if (!spot) continue;

    const stats = analyzer.region(spot.left, spot.top, probe.width, probe.height);
    const color = contrastingColor(stats, cfg.contrastDelta);

    const mark = await renderText(text, {
      fontSize,
      fontFamily: cfg.fontFamily,
      fontWeight: cfg.fontWeight,
      letterSpacing: cfg.letterSpacing,
      color,
      rotate,
    });

    composites.push({ input: mark.buffer, left: spot.left, top: spot.top, blend: 'over' });
    placed.push({
      left: spot.left, top: spot.top,
      width: mark.width, height: mark.height,
      text, edge, color,
    });
  }

  return { composites, fontSize, count: composites.length, placed };
}

function chooseSpot({ analyzer, width, height, edge, inset, markW, markH, candidates, placed, rng }) {
  const options = [];

  for (let c = 0; c < candidates; c++) {
    let left, top;
    if (edge === 'top' || edge === 'bottom') {
      const span = width - inset * 2 - markW;
      if (span <= 0) continue;
      left = Math.round(inset + rng.next() * span);
      top = edge === 'top' ? inset : height - inset - markH;
    } else {
      const span = height - inset * 2 - markH;
      if (span <= 0) continue;
      top = Math.round(inset + rng.next() * span);
      left = edge === 'left' ? inset : width - inset - markW;
    }

    if (left < 0 || top < 0 || left + markW > width || top + markH > height) continue;
    if (overlaps({ left, top, width: markW, height: markH }, placed, Math.max(markW, markH) * 0.25)) continue;

    const stats = analyzer.region(left, top, markW, markH);
    options.push({ left, top, score: scoreRegion(stats) });
  }

  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score);
  return options[0];
}

function overlaps(rect, placed, pad) {
  return placed.some(
    (p) =>
      rect.left < p.left + p.width + pad &&
      rect.left + rect.width + pad > p.left &&
      rect.top < p.top + p.height + pad &&
      rect.top + rect.height + pad > p.top
  );
}

/**
 * Shift the local mean colour to sit exactly `delta` in luminance away from
 * its background, moving away from whichever extreme is nearer.
 *
 * Solving for the target luminance (rather than blending a fraction toward
 * black or white) is what makes `contrastDelta` mean the same thing on a
 * near-black frame and a near-white one — otherwise the same setting produces
 * an invisible mark on one image and an obvious one on the next.
 */
export function contrastingColor({ rgb, luma }, delta) {
  const dir = luma < 0.5 ? 1 : -1;
  const targetLuma = clamp01(luma + dir * delta);

  let ch;
  if (luma > 0.08) {
    // Multiplicative keeps the region's hue, so the mark reads as part of the
    // image's own texture instead of a grey overlay.
    const factor = targetLuma / luma;
    ch = rgb.map((v) => v * factor);
  } else {
    // Near black there is no hue left to preserve and scaling explodes, so
    // step the channels up additively instead.
    const lift = (targetLuma - luma) * 255;
    ch = rgb.map((v) => v + lift);
  }

  return `#${ch
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

const clamp01 = (n) => Math.min(0.98, Math.max(0.02, n));
