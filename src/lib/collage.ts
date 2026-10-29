/*
  A collage's name and year, from the title Chris gives it in Studio.

  The documents are titled "Collage - Magnesium Mildness 2025", with one
  "Anatomy of Melancholy Collage" - the word and the year are part of the
  title, and every page that shows a collage wants them apart: the name as
  the caption, the year beside it, "Collage" said once by the page itself.
  Parsed in one place so the series page, About and a piece's own page
  agree on what a collage is called.
*/
import {stripStegaKey} from './stega';

export interface CollageName {
  name: string;
  year: string;
}

export function collageName(title: unknown): CollageName {
  const clean = stripStegaKey(title);
  const year = clean.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? '';
  const name =
    clean
      .replace(/^collage\s*[-–—:]\s*/i, '')
      .replace(/\s*[-–—:]?\s*collage\s*$/i, '')
      .replace(/\s*\b(?:19|20)\d{2}\b\s*$/, '')
      .trim() || 'Collage';
  return {name, year};
}

/** The URL slug a collage's own page uses: collage-magnesium-mildness-2025 -> magnesium-mildness. */
export function collagePath(slug: string): string {
  return slug
    .replace(/^collage-/, '')
    .replace(/-collage$/, '')
    .replace(/-\d{4}$/, '');
}

/*
  The collages themselves, not everything that says "collage".

  Chris: the Collage page "lists everything collage related rather than,
  say, just the collages". The old filter matched the slug with GROQ's
  `match`, which matches WORDS, so "collage-*" took any slug with the word in
  it: the six Red Kettle close-ups and the Sun & Moon Collage Stamp beside the
  nine collages. Now a collage is a piece whose title starts or ends with the
  word - "Collage - Red Kettle 2025", "Anatomy of Melancholy Collage" - and
  that is not filed under another piece (the close-ups have Red Kettle as
  their parent). Category "Collage" still counts, should Chris file one so.
  Never a sketch, even one whose title names its collage (see NOT_SKETCH in
  queries.ts). scripts/diagnose-collage-page.mjs lists what it keeps.
*/
export const COLLAGE_FILTER =
  '((category == "Collage" || string::startsWith(lower(title), "collage") || string::split(lower(title), " ")[-1] == "collage") && !defined(parentBrand) && !(category == "Sketch"))';

/** Oldest first, by the year in the title, then by name. */
export function bySeriesOrder<T extends {title?: unknown}>(a: T, b: T): number {
  const A = collageName(a.title);
  const B = collageName(b.title);
  return (A.year || '9999').localeCompare(B.year || '9999') || A.name.localeCompare(B.name);
}
