/*
  A PIECE'S LABEL, AS A MUSEUM WOULD WRITE IT.

  Chris's idea: treat irreverent work with reverence. A D&D podcast's skull
  tee, captioned the way a museum captions a painting - the title, then
  what it is and when - is a small joke and a real respect for the craft
  at once. Sober type around audacious work.

  Only facts already in Studio: the Medium field when Chris has filled it,
  otherwise the Asset Type ("Apparel"), otherwise the category; the Year
  field, or nothing. Never a guess - "Screenprint on cotton" on a piece
  that was embroidered would be worse than no label.

  The title keeps whatever editing markers the preview gives it, so the
  label can still be clicked through to Studio; the fallbacks are compared
  clean.
*/
import {stripStegaKey} from './stega';

export interface MuseumLabel {
  title: unknown;
  /** "Screenprint on cotton, 2024", or "Apparel", or "" when there is nothing. */
  detail: string;
}

export function museumLabel(item: any, extra: string[] = []): MuseumLabel | null {
  const clean = stripStegaKey(item?.title);
  if (!clean) return null;
  /*
    The piece's own name, without its project in front. Studio titles a
    piece "DumpStat - Fantasy Keth Tee", which the grid needs (the tiles
    are told apart by it), but the label sits beside the project's block,
    which already names the project. So a leading "Project - " goes when
    the project's own title starts with it. The prefix is cut from the
    clean title, so this label loses its click-to-edit marker on the
    preview; the tile's own title still carries one.
  */
  const project = stripStegaKey(item?.parentTitle).toLowerCase();
  const m = clean.match(/^(.+?)\s+[-–—:]\s+(.+)$/);
  const own = m && project && project.startsWith(m[1].toLowerCase()) ? m[2] : null;
  const title = own ?? item.title;
  const titleText = (own ?? clean).toLowerCase();
  /*
    Then what it is. The Medium field as written; the fallbacks only when
    they add something - "Aries Tarot Illustration" followed by
    "Illustration" says the word twice.
  */
  const medium =
    stripStegaKey(item?.medium) ||
    [stripStegaKey(item?.assetType), stripStegaKey(item?.category)].find(
      (w) => w && !titleText.includes(w.toLowerCase()),
    ) ||
    '';
  const year = Number.isInteger(item?.year) ? String(item.year) : '';
  const detail = [medium, ...extra, year].filter(Boolean).join(', ');
  return {title, detail};
}

/*
  A collage's real size. The scans are 600 DPI (see fullScan in the
  caseStudy schema), so pixels across / 600 is inches; Real Width in Studio
  overrides it. Rounded to the quarter inch, which is as close as a hand
  cuts a square.
*/
export const SCAN_DPI = 600;

export function realSize(scan: {w?: number; h?: number} | null | undefined, realWidth?: number) {
  if (!scan?.w || !scan?.h) return null;
  const w = realWidth && realWidth > 0 ? realWidth : scan.w / SCAN_DPI;
  const h = (w * scan.h) / scan.w;
  const q = (x: number) => Math.round(x * 4) / 4;
  return {w: q(w), h: q(h)};
}

const inches = (x: number) => {
  const whole = Math.floor(x);
  const frac = x - whole;
  const part = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  return `${whole || ''}${part}` || '0';
};

/** "13 × 13 in" */
export function sizeText(size: {w: number; h: number}): string {
  return `${inches(size.w)} × ${inches(size.h)} in`;
}
