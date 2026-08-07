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
  opposite of the presence this is for. Cropping to landscape is what makes it
  read as a spread: a wide thing among vertical ones.

  Two ratios, because the two grids need different amounts of it.

  Isotope's masonry quantises width to whole columns - a tile is 1, 2 or 3
  columns and nothing between - so "a bit wider" is not available on the
  Portfolio grid. A 1.25-column tile makes Isotope reserve two columns and paint
  into one and a quarter, leaving a hole beside it, which on a grid this dense
  reads as a bug rather than as air.

  So the Portfolio hero keeps its two columns and gets SHALLOW instead. At 12:5
  it is the same width as before and about a third of the height it was, which
  drops it from roughly twice a normal tile's area to roughly a third more -
  still plainly the widest thing on screen, no longer the only thing.

  The homepage grid is a fixed CSS grid with no masonry and only eight tiles, so
  a 3:2 hero there is a proportion of a small set rather than one loud tile in
  sixty. Chris likes it as it is; it keeps 3:2.
*/
export const HERO_RATIO = {w: 3, h: 2};

/*
  The Portfolio hero's shape, and the only knob for how much presence it has.
  Change this one line; the homepage is separate and is not affected.

    {w: 3,  h: 2}   2.13x a typical tile - what it was, a full spread
    {w: 2,  h: 1}   1.60x
    {w: 12, h: 5}   1.33x - current
    {w: 14, h: 5}   1.14x - barely more than its neighbours

  Measured against a 4:5 portrait as "typical"; real tiles keep their natural
  aspect, so the exact figure varies per tile.
*/
export const HERO_RATIO_PORTFOLIO = {w: 12, h: 5};

/** Height for a hero tile rendered at `width`, preserving the given crop. */
export const heroHeight = (width: number, ratio: {w: number; h: number} = HERO_RATIO) =>
  Math.round((width * ratio.h) / ratio.w);

/*
  Where a tile goes when clicked.

  A Case Study IS the project, so it links to its own page. A Grid Item is a
  piece of one and has no route of its own, so it links to its parent - and
  only when that parent is a Case Study, because linking to a Grid Item's slug
  produces a 404 that reads as a broken site.

  The Case Study branch matters now that both types share the grid: without it
  every project tile would be unclickable, which is the opposite of the reason
  they were added.
*/
export function tileHref(item: {
  slug?: {current?: string} | string;
  pageType?: unknown;
  parentSlug?: string;
  parentType?: unknown;
}): string | null {
  if (cleanKey(item?.pageType) === 'Case Study') {
    const own = typeof item.slug === 'string' ? item.slug : item.slug?.current;
    return own ? `/work/${cleanKey(own)}` : null;
  }
  return item?.parentSlug && cleanKey(item.parentType) === 'Case Study'
    ? `/work/${item.parentSlug}`
    : null;
}
