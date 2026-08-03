import { sanityClient } from './sanity';

export function getPage(slug: string) {
  return sanityClient.fetch(
    `*[_type == "page" && slug.current == $slug][0]`,
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
    `*[_type == "caseStudy" && pageType == "Case Study" && slug.current == $slug][0]`,
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
export function getAllGridItems() {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Grid Item"]{
      title, slug, thumbnail, mainImage, category,
      "parentSlug": parentBrand->slug.current,
      "parentTitle": parentBrand->title,
      "parentType": parentBrand->pageType
    } | order(title asc)`,
  );
}
