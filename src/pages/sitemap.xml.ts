/*
  Hand-rolled rather than via @astrojs/sitemap: this needs to enumerate the
  Sanity-driven routes anyway, and the project commits no lockfile, so every
  added dependency is one more thing that can float to an incompatible
  version on a clean CI install (which is exactly what broke two deploys
  earlier).

  Omitted on preview builds, where robots.txt disallows everything anyway.
*/
import type { APIRoute } from 'astro';
import { sanityClient } from '../lib/sanity';

const IS_PREVIEW = import.meta.env.PUBLIC_IS_PREVIEW === 'true';

// Routes that exist as files. Deliberately excludes /style-guide (internal),
// /404, /image-license-info (unedited Webflow boilerplate), and /ms-paint
// (removed at Chris's request; its Sanity document is retained).
const STATIC_PATHS = [
  '/',
  '/portfolio',
  '/about',
  '/video',
  '/collage',
  '/merchfolio',
  '/blog',
  '/privacy-policy',
];

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.href ?? 'https://rumeaudesign.co/';

  let paths = [...STATIC_PATHS];
  if (!IS_PREVIEW) {
    const [caseStudies, posts] = await Promise.all([
      sanityClient.fetch<string[]>(
        `*[_type == "caseStudy" && pageType == "Case Study" && defined(slug.current)].slug.current`,
      ),
      sanityClient.fetch<string[]>(`*[_type == "blogPost" && defined(slug.current)].slug.current`),
    ]);
    paths.push(...caseStudies.map((s) => `/work/${s}`), ...posts.map((s) => `/blog/${s}`));
  }

  const urls = paths
    .map((p) => `  <url><loc>${new URL(p, origin).href}</loc></url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
