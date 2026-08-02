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
export function getAllGridItems() {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Grid Item"]{
      title, slug, thumbnail, mainImage, category
    } | order(title asc)`,
  );
}

export function getClientLogos(slugs: string[]) {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && slug.current in $slugs]{title, slug, clientLogo, thumbnail, mainImage}`,
    { slugs },
  );
}
