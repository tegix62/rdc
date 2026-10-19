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

/** Every collage in the dataset, however it was filed. */
export const COLLAGE_FILTER =
  '(category == "Collage" || slug.current match "collage-*" || slug.current match "*-collage")';

/** Oldest first, by the year in the title, then by name. */
export function bySeriesOrder<T extends {title?: unknown}>(a: T, b: T): number {
  const A = collageName(a.title);
  const B = collageName(b.title);
  return (A.year || '9999').localeCompare(B.year || '9999') || A.name.localeCompare(B.name);
}
