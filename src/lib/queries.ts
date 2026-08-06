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

// The real Portfolio page's shuffle/resize grid: every Grid Item in the
// Work collection (thumbnail tiles that link back to a parent brand),
// not just featured Case Studies.
/*
  Every Grid Item tile on the Portfolio page, plus its parent brand.

  `parentType` is fetched alongside the slug because only "Case Study"
  documents get a page at /work/<slug>. Linking a tile to a Grid Item's own
  slug would produce a 404 that reads as a broken site, so the Portfolio page
  only renders the jump button when the parent is a real case study.
*/
// Everything a tile needs to render, wherever it is rendered. Shared so the
// homepage grid and the Portfolio grid cannot drift into showing different
// things about the same piece of work.
const TILE = `
  title, slug, thumbnail, mainImage, category, archiveMark, heroTile,
  tileTreatment, assetType,
  "parentSlug": parentBrand->slug.current,
  "parentTitle": parentBrand->title,
  "parentType": parentBrand->pageType
`;

export function getAllGridItems() {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Grid Item"]{${TILE}} | order(title asc)`,
  );
}

/*
  The homepage work grid.

  Curated first: whatever is in Site Settings → Homepage Work Grid, in that
  order. "Most recent" is a decent default and a poor showcase - it puts
  whatever was uploaded last in front of a client rather than whatever is
  strongest - so recency is only the fallback, and only while the picker is
  empty. That way the grid is never blank on a fresh dataset but is never
  automatic once Chris has chosen.

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
    `*[_type == "caseStudy" && pageType == "Grid Item" && defined(thumbnail)]
      | order(_createdAt desc)[0...$limit]{${TILE}}`,
    { limit },
  );
}
