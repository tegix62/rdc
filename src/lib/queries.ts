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

// Homepage "Selected Work" grid: featured items (case studies or grid items),
// falling back to all case studies if nothing has been marked featured yet.
export async function getFeaturedWork() {
  const featured = await sanityClient.fetch(
    `*[_type == "caseStudy" && featured == true]{
      ..., "parentSlug": parentBrand->slug.current
    } | order(title asc)`,
  );
  if (featured.length > 0) return featured;
  return sanityClient.fetch(
    `*[_type == "caseStudy" && pageType == "Case Study"]{
      ..., "parentSlug": parentBrand->slug.current
    } | order(title asc)`,
  );
}

export function getClientLogos(slugs: string[]) {
  return sanityClient.fetch(
    `*[_type == "caseStudy" && slug.current in $slugs]{title, slug, clientLogo, thumbnail, mainImage}`,
    { slugs },
  );
}
