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

export function getMerchItems() {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && category == "Merch & Apparel"]{
      ..., "parentSlug": parentBrand->slug.current
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
export async function getFeaturedWork(limit = 8) {
  const curated: any[] | null = await sanityClient.fetch(
    `*[_type == "siteSettings"][0].featuredWork[]->{${TILE}}`,
  );
  const picked = (curated ?? []).filter((item) => item && (item.thumbnail || item.mainImage));
  if (picked.length) return picked;

  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Case Study"
       && (defined(thumbnail) || defined(mainImage))]
      | order(title asc)[0...$limit]{${TILE}}`,
    { limit },
  );
}
