/*
  Picking readable text for a colour chosen in Studio.

  The case study sections band takes its background from each project's
  `accentColor`. Nothing set a matching text colour, so the copy inherited the
  site's default near-black - which is fine on a pale accent and unreadable on
  a dark one. Adelante Barbell Club's accent is #333333, and its whole body
  section shipped as #1a1a1a text on a #333333 background.

  That is not a one-off to hand-patch. Chris picks these colours himself, per
  project, in Studio, so the band has to work for any colour he can choose.
  Hence luminance rather than a per-project override.
*/

/** #rgb, #rrggbb, or #rrggbbaa -> [r, g, b] 0-255. Null if unparseable. */
export function parseHex(input: unknown): [number, number, number] | null {
  if (typeof input !== 'string') return null;
  const hex = input.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.length === 6 || hex.length === 8
        ? hex.slice(0, 6)
        : null;
  if (!full || !/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/*
  WCAG relative luminance. Not the naive (r+g+b)/3 average: the eye is far more
  sensitive to green than to blue, and the sRGB transfer curve is not linear.
  Getting this wrong picks black text on a saturated blue, which is the exact
  failure being fixed.

  https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
*/
export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two luminances, 1 (identical) to 21 (black/white). */
function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = 1;
const INK = relativeLuminance([0x1a, 0x1a, 0x1a]);

/**
 * Readable foreground for a background colour: the site's ink or white,
 * whichever contrasts more. Returns null when the colour can't be parsed, so
 * the caller can leave the existing behaviour alone rather than guess.
 */
export function readableOn(background: unknown): '#ffffff' | '#1a1a1a' | null {
  const rgb = parseHex(background);
  if (!rgb) return null;
  const bg = relativeLuminance(rgb);
  // Whichever of the two gives the better ratio. On a mid-tone where both are
  // mediocre this still picks the less bad one, which is all that can be done
  // without changing the colour Chris chose.
  return contrast(bg, WHITE) >= contrast(bg, INK) ? '#ffffff' : '#1a1a1a';
}
