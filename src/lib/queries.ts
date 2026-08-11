import { sanityClient } from './sanity';

/*
  Uploaded video files have to be projected explicitly.

  A bare `*[_type == "x"][0]` returns a file field as an unresolved reference -
  `{_type: 'file', asset: {_ref: 'file-abc-mp4'}}` - with no URL anywhere in it.
  Nothing errors; the video simply never plays, which is the worst kind of bug
  because the page still looks fine. So every video-bearing field gets `asset->`.

  `items[]` reaches inside a Media Row, whose slots each carry their own video.
  Sections with no `items` array just come back without one.
*/
const VIDEO_FILES = `videoFile{asset->{url}}, videoWebm{asset->{url}}`;

const SECTIONS = `sections[]{
  ...,
  ${VIDEO_FILES},
  items[]{ ..., ${VIDEO_FILES} }
}`;

export function getPage(slug: string) {
  return sanityClient.fetch(
    `*[_type == "page" && slug.current == $slug][0]{ ..., ${SECTIONS} }`,
    { slug },
  );
}

export function getCaseStudies() {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Case Study"] | order(title asc)`,
  );
}

export function getCaseStudy(slug: string) {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Case Study" && slug.current == $slug][0]{
      ...,
      heroVideoFile{asset->{url}},
      heroVideoWebm{asset->{url}},
      ${SECTIONS}
    }`,
    { slug },
  );
}

export function getOtherCaseStudies(excludeId: string) {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Case Study" && _id != $excludeId]{
      title, slug, thumbnail, mainImage, client
    } | order(title asc)[0...4]`,
    { excludeId },
  );
}

export function getGridItems(caseStudyId: string) {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Grid Item" && parentBrand._ref == $id] | order(title asc)`,
    { id: caseStudyId },
  );
}

/*
  `parentType` is projected alongside `parentSlug` because tileHref refuses to
  link to a parent that is not itself a Case Study - a Grid Item has no page at
  /work/<slug>, so linking to one produces a 404. Without this field every merch
  tile linked to /portfolio instead, including the ones that do have a project
  page to go to.
*/
export function getMerchItems() {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && category == "Merch & Apparel"]{
      ...,
      "parentSlug": parentBrand->slug.current,
      "parentType": parentBrand->pageType
    } | order(title asc)`,
  );
}

export function getBlogPosts() {
  return sanityClient.fetch(
    `*[_type == "blogPost"] | order(publishedAt desc)`,
  );
}

export function getBlogPost(slug: string) {
  return sanityClient.fetch(
    `*[_type == "blogPost" && slug.current == $slug][0]`,
    { slug },
  );
}

export function getSiteSettings() {
  return sanityClient.fetch(`*[_type == "siteSettings"][0]`);
}

/*
  `parentType` is fetched alongside the slug because only "Case Study"
  documents get a page at /work/<slug>. Linking a Grid Item to its own slug
  would produce a 404 that reads as a broken site, so a tile only links to a
  parent that is a real case study - or, for a Case Study tile, to itself.
*/
// Everything a tile needs to render, wherever it is rendered. Shared so the
// homepage grid and the Portfolio grid cannot drift into showing different
// things about the same piece of work.
const TILE = `
  _id,
  title, slug, pageType, thumbnail, mainImage, category, archiveMark, heroTile,
  tileTreatment, assetType,
  "parentSlug": parentBrand->slug.current,
  "parentTitle": parentBrand->title,
  "parentType": parentBrand->pageType
`;

/*
  Every tile on the Portfolio grid: the projects themselves AND the pieces that
  make them up.

  It used to be Grid Items only, which meant Chris's 13 actual projects were
  absent from the page most people browse. Chateau Seven simply was not on the
  Portfolio grid, and the only route to a project page was the jump button on
  one of its derivative tiles - so a visitor reached "Adelante Barbell Club"
  by way of a photo of a hoodie. That is backwards.

  Case studies sort first. The grid is shuffleable and the order is not sacred,
  but the first screenful is what most people see, and it should be the work
  rather than its offcuts.
*/
export function getAllGridItems() {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
       && (defined(thumbnail) || defined(mainImage))]{${TILE}}
     | order(pageType asc, title asc)`,
  );
}

/*
  The homepage work grid.

  Curated first: whatever is in Site Settings → Homepage Work Grid, in that
  order. The picker is the point; everything below is only what happens while
  it is empty.

  The fallback is the CASE STUDIES, not the most recent tiles. Recency was a
  bad default and it showed: with the picker empty the homepage led with a
  DoomWoken GIF standing in for DumpStat and an unfinished Terremoto, because
  those happened to be uploaded last. The projects are the work; a derivative
  tile is a detail from one. If the homepage has to guess, it should guess at
  the projects.

  The filter on the curated list matters: a reference to a deleted document
  resolves to null, and one stale pick would otherwise blow up the map in the
  template.
*/
/*
  How many columns the homepage grid has. Mirrors `.peek__grid` in global.css,
  which is `repeat(4, 1fr)` with a 2-column phone breakpoint - and 4 is a
  multiple of 2, so filling whole rows at 4 fills them at 2 as well.
*/
export const PEEK_COLUMNS = 4;

/** A hero tile occupies two cells, here exactly as on the Portfolio grid. */
export const cellsUsedBy = (items: any[]) =>
  items.reduce((n, item) => n + (item?.heroTile ? 2 : 1), 0);

/*
  Make a list of tiles fill whole rows.

  Pure, exported and tested (scripts/test-peek-grid.mjs) because it is
  arithmetic whose only symptom when wrong is a homepage that looks slightly
  off - nobody opens a bug for "the grid feels ragged", they just think the site
  is a bit amateur.

  Tops up from `filler` first, since a full grid beats a short one. Falls back to
  trimming to the last complete row when there is not enough filler, because a
  shorter tidy grid still beats a ragged full one.
*/
export function fitToRows(items: any[], filler: any[] = [], columns = PEEK_COLUMNS) {
  const cells = cellsUsedBy(items);
  const shortfall = (columns - (cells % columns)) % columns;
  if (shortfall === 0) return items;

  // Hero tiles are never used as filler: two cells would overshoot the row they
  // are meant to complete.
  const usable = filler.filter((f) => f && !f.heroTile).slice(0, shortfall);
  if (usable.length === shortfall) return [...items, ...usable];

  const keep = cells - (cells % columns);
  if (keep === 0) return items;
  const trimmed: any[] = [];
  for (const item of items) {
    if (cellsUsedBy([...trimmed, item]) > keep) break;
    trimmed.push(item);
  }
  return trimmed.length ? trimmed : items;
}

export async function getFeaturedWork(limit = 8) {
  const curated: any[] | null = await sanityClient.fetch(
    `*[_type == "siteSettings"][0].featuredWork[]->{${TILE}}`,
  );
  const picked = (curated ?? []).filter((item) => item && (item.thumbnail || item.mainImage));
  // A curated list is a decision, so it is shown exactly as picked - ragged
  // last row included. Only the automatic fallback gets tidied below.
  if (picked.length) return picked;

  const studies: any[] = await sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Case Study"
       && (defined(thumbnail) || defined(mainImage))]
      | order(title asc)[0...$limit]{${TILE}}`,
    { limit },
  );

  /*
    Fill the last row.

    The grid is four columns, and there are now five case studies - Chris
    deleted "More Kilos, Less Egos", which was a placeholder shirt for Adelante
    Barbell Club. Five tiles in four columns is a full row and then one orphan
    sitting alone against three empty cells, which reads as a broken grid rather
    than as a short one.

    Topped up with GRID ITEMS BELONGING TO THE PROJECTS ALREADY SHOWN, not with
    whatever is newest. That matters: the last time this fell back to recency it
    led the homepage with a DoomWoken GIF standing in for DumpStat. Children of
    the projects on screen are thematically the same work - the project, then
    details from it - so the row fills with something that belongs there.

    If there is nothing to top up with, the list is TRIMMED to a whole number of
    rows instead. A shorter tidy grid beats a full ragged one, and the Portfolio
    link sits right beside the heading for anyone wanting the rest.
  */
  const shortfall =
    (PEEK_COLUMNS - (cellsUsedBy(studies) % PEEK_COLUMNS)) % PEEK_COLUMNS;
  if (shortfall === 0) return studies;

  const children: any[] = await sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Grid Item"
       && (defined(thumbnail) || defined(mainImage))
       && parentBrand._ref in $parents]
      | order(title asc)[0...$take]{${TILE}}`,
    { parents: studies.map((s) => s._id).filter(Boolean), take: shortfall },
  );

  return fitToRows(studies, children ?? []);
}
