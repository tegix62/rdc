/*
  How a work tile is presented, shared by every grid that renders one.

  Extracted because there are now two: the Portfolio page's masonry grid and
  the homepage's miniature. These have to agree about what counts as a
  logomark, or the same piece of work gets inset on one page and bled to the
  edge on the other - a difference nobody would notice in review and everybody
  would notice on the site.
*/

/*
  Strips zero-width characters before a value is used as a lookup key.

  Belt and braces on top of the stega exclusion list in lib/sanity.ts. Visual
  editing embeds invisible markers in strings, and a contaminated key fails a
  lookup with no visible symptom anywhere - which is exactly how the Portfolio
  filters silently matched nothing and cost several rounds of debugging.
*/
export const cleanKey = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[​-‏﻿⁠]/g, '').trim() : '';

/*
  Asset types that are a standalone mark rather than a photograph.

  This is the one idea Chris's Adobe Portfolio gallery actually rests on: a
  logomark strong enough to carry itself gets room and no caption, while a
  photograph fills its frame. Used as the fallback when `tileTreatment` has not
  been set explicitly, which is why `assetType` turned out to be worth keeping
  after I had it filed for deletion - it already carries this signal on 43
  tagged items.
*/
export const MARK_ASSET_TYPES = new Set(['Identity / Brand Sheet', 'Vinyl / Record']);

export type Treatment = 'mark' | 'bleed';

export function treatmentOf(item: {tileTreatment?: unknown; assetType?: unknown}): Treatment {
  const explicit = cleanKey(item?.tileTreatment);
  if (explicit === 'mark' || explicit === 'bleed') return explicit;
  return MARK_ASSET_TYPES.has(cleanKey(item?.assetType)) ? 'mark' : 'bleed';
}

/*
  A hero tile spans two columns AND crops to landscape.

  The span alone would be wrong. Most tiles are portrait, so doubling a portrait
  tile's width produces an enormous TALL tile that dominates by height - the
  opposite of the presence this is for. Cropping to 3:2 is what makes it read as
  a spread: a wide thing among vertical ones.

  3:2 rather than 16:9, because 16:9 across two columns is a thin band that
  loses too much of a portrait source.
*/
export const HERO_RATIO = {w: 3, h: 2};

/** Height for a hero tile rendered at `width`, preserving the 3:2 crop. */
export const heroHeight = (width: number) => Math.round((width * HERO_RATIO.h) / HERO_RATIO.w);

/*
  Only link to a parent that actually has a page. A Grid Item's own slug has no
  route, so linking to one produces a 404 that reads as a broken site.
*/
export function tileHref(item: {parentSlug?: string; parentType?: unknown}): string | null {
  return item?.parentSlug && cleanKey(item.parentType) === 'Case Study'
    ? `/work/${item.parentSlug}`
    : null;
}
