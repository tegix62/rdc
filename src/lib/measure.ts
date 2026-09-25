/*
  WILL THIS BLOCK REACH ITS MEASURE?

  The thing that makes a page of varied imagery read as one grid is that
  nearly every block comes out the same width. Measured across every block
  type and every source shape at 1512x900, this site's do not - and the reason
  is arithmetic rather than taste:

                                width   % of measure
    single plate  4:5  poster     547        38%
    single plate  3:2  landscape 1026        71%
    two-up        4:5            1003        69%
    two-up        3:2            1448       100%
    three-up      4:5            1387        96%
    three-up      3:2            1448       100%

  Every picture block is bounded by a HEIGHT: --plate-fit for a single plate,
  --row-max for a row. A level row is (sum of ratios) x that height wide, so
  the width a block can reach is decided by the shapes in it and nothing else.
  Below about 1.4:1 a lone picture cannot fill its measure at any size, and
  portrait work cannot fill it at any count.

  That is invisible while authoring. Studio shows the block filled in, the
  page builds, nothing errors, and the shortfall only turns up as "the widths
  look mixed up" in a screenshot weeks later. So the build says it instead.

  WHAT THESE NUMBERS ARE

  A prediction, at ONE reference viewport, from the tokens in global.css. They
  are not read from the stylesheet - nothing at build time has a layout - so
  they are a second copy of numbers that live somewhere else, which is exactly
  how two mechanisms for one job drift apart.

  scripts/test-media-row-slots.mjs closes that: it renders the real pages in a
  real browser and asserts the predicted width matches the rendered one. If a
  token here stops matching global.css, that check fails and names it. Change
  one, change both.
*/

/*
  1512x900 - the laptop this project has measured at throughout, and the
  viewport every figure in the comment above comes from. A prediction has to
  name its viewport or it means nothing: --plate-fit is 76vh, so the same
  block is a different width on a different screen.
*/
export const REFERENCE = {width: 1512, height: 900};

const REM = 16;
const vh = (n: number) => (REFERENCE.height * n) / 100;
const vw = (n: number) => (REFERENCE.width * n) / 100;

/* --space-3 and --space-4 in global.css. */
const SPACE_3 = 1.5 * REM;
const SPACE_4 = 2 * REM;

/*
  --wide-room: min(100vw - 2 * var(--space-4), 100rem), from 64rem up. The
  imagery measure - what a row is allowed before its own cap has a say, and
  the width every block here is being judged against.
*/
export const ROOM = Math.min(vw(100) - 2 * SPACE_4, 100 * REM);

/* --plate-fit: the ceiling on a picture standing on its own. */
const PLATE_FIT = vh(76);

/*
  --row-max, by count - see rowMaxFor() in Sections.astro, which writes these
  same three values into the style attribute. Two plates get a taller ceiling
  than three, having half the row each rather than a third.
*/
const rowMax = (count: number): number => {
  if (count < 2) return Math.min(vh(74), 48 * REM);
  if (count === 2) return Math.min(vh(68), 44 * REM);
  return Math.min(vh(62), 40 * REM);
};

export interface Fill {
  /** How wide the block comes out, in CSS pixels at the reference viewport. */
  width: number;
  /** The measure it is being judged against. */
  room: number;
  /** width / room, as a percentage. */
  pct: number;
  /** The per-image ratio that WOULD fill the measure at this count. */
  neededRatio: number;
  /** How many images of the current shape it would take to fill. */
  neededCount: number;
}

/*
  A row of plates, or a single plate, which is the same arithmetic with one
  item and a different ceiling.

  A level row solves for a common height k: every plate is k x its own ratio
  wide, so the row is k x (sum of ratios) plus the gaps. k is capped by the
  ceiling, and the whole row is capped by the room - so the width is the
  smaller of "what the shapes allow" and "what there is".
*/
export function rowFill(ratios: number[], ceiling: number, gap = SPACE_3, room = ROOM): Fill {
  const n = ratios.length;
  const sum = ratios.reduce((total, r) => total + r, 0);
  const gaps = Math.max(0, n - 1) * gap;
  const width = Math.min(room, sum * ceiling + gaps);
  // What each image would have to be, at this count, to reach the measure.
  const neededRatio = n > 0 ? (room - gaps) / ceiling / n : 0;
  /*
    And how many of the CURRENT shape it would take instead. Solved against
    the ceiling for that count, because adding an image lowers the ceiling -
    a three-up is capped shorter than a two-up, so the answer is not simply
    "room divided by one plate's width".
  */
  const mean = n > 0 ? sum / n : 0;
  let neededCount = n;
  while (neededCount < 8 && mean > 0) {
    const c = rowMax(neededCount);
    if (mean * neededCount * c + (neededCount - 1) * gap >= room) break;
    neededCount += 1;
  }
  return {width, room, pct: (width / room) * 100, neededRatio, neededCount};
}

/** A row of n plates, using the ceiling that count actually gets. */
export const plateRowFill = (ratios: number[]): Fill => rowFill(ratios, rowMax(ratios.length));

/** One picture standing on its own, which is bounded by --plate-fit instead. */
export const singlePlateFill = (ratio: number): Fill => rowFill([ratio], PLATE_FIT);

/*
  A full-bleed plate, whose measure is the VIEWPORT rather than the imagery
  measure - it is a deliberately different register, so judging it against the
  narrower one would call a correct block wrong.

  Still worth checking, because the height cap applies here too and that is
  the one place it bites on landscape work: a 3:2 photo at full bleed comes
  out 1026px of a 1512px screen, which is neither full-bleed nor on the
  measure. `plateFit: 'fill'` in Studio is the opt-out.
*/
export const fullPlateFill = (ratio: number): Fill =>
  rowFill([ratio], PLATE_FIT, SPACE_3, REFERENCE.width);

/*
  Below this, a block reads as an island rather than as part of the grid.

  90%, not 100%. A three-up of 4:5 posters comes out at 96% and looks
  perfectly deliberate; a lone 4:5 comes out at 38% and does not. The line is
  drawn where the shortfall stops being a rounding difference and starts being
  visible as space around the picture - measured, that is the gap between the
  90% case (3:4 in a three-up, reads fine) and the 86% case (a square pair,
  which already shows band at the edges).
*/
export const FILLS = 90;

/*
  How to say it. One line, naming the block, what it reaches, and the two ways
  out - a different shape at this count, or more images of this shape - since
  which one is available is a question only Chris can answer.
*/
export function fillWarning(where: string, fill: Fill, ratios: number[]): string {
  const shapes = ratios.map((r) => r.toFixed(2)).join(', ');
  const more =
    fill.neededCount > ratios.length && fill.neededCount <= 4
      ? `, or ${fill.neededCount} images of this shape`
      : '';
  return (
    `[layout] ${where} reaches ${fill.pct.toFixed(0)}% of the imagery measure ` +
    `(${fill.width.toFixed(0)}px of ${fill.room.toFixed(0)}px at ${REFERENCE.width}x${REFERENCE.height}), ` +
    `so it sits as an island with space either side. Its images are ${shapes}:1; ` +
    `filling the measure at this count needs ${fill.neededRatio.toFixed(2)}:1 each${more}. ` +
    `A picture block is bounded by its HEIGHT, so width follows the shapes in it - ` +
    `portrait work cannot fill a wide measure at any size.`
  );
}
