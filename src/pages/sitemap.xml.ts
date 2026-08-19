/*
  Hand-rolled rather than via @astrojs/sitemap: this needs to enumerate the
  Sanity-driven routes anyway, and the project commits no lockfile, so every
  added dependency is one more thing that can float to an incompatible
  version on a clean CI install (which is exactly what broke two deploys
  earlier).

  Omitted on preview builds, where robots.txt disallows everything anyway.

  Two things beyond the URL list, both of which matter more here than they
  would on a text site:

  LASTMOD, from Sanity's own _updatedAt. A crawler uses it to decide what to
  re-fetch, and without it every URL looks equally stale on every visit - so a
  case study that was rewritten yesterday queues behind twenty that have not
  changed in a year. It is only worth stating because it is real: a hardcoded
  build timestamp would claim the whole site changed every deploy, which is the
  reason crawlers learned to distrust the field in the first place.

  IMAGE ENTRIES. Google Images is a search surface a design portfolio should
  care about at least as much as web results, and it is the one place the work
  itself is the result rather than a page about the work. The <image:image>
  extension is how a page's images are declared for it.
*/
import type { APIRoute } from 'astro';
import { sanityClient } from '../lib/sanity';
import { imageUrl } from '../lib/image';

const IS_PREVIEW = import.meta.env.PUBLIC_IS_PREVIEW === 'true';

/*
  Routes that exist as files, paired with the Sanity `page` document each one
  reads - which is where its lastmod comes from.

  Deliberately excludes /style-guide (internal), /404, and /ms-paint (removed at
  Chris's request; its Sanity document is retained).

  /image-license-info is included, and was NOT before. It is thin Webflow
  boilerplate, which was the reason to leave it out - but the JSON-LD now points
  every image on the site at it as the licence terms and the place to ask about
  them. Google requires that page to be crawlable for the licensable-image
  markup to count at all, and more plainly: a licence nobody can reach is not a
  licence. Its copy now carries weight, so it is worth a read.
*/
const STATIC_PATHS: [path: string, pageSlug: string | null][] = [
  ['/', 'home'],
  ['/portfolio', 'portfolio'],
  ['/about', 'about'],
  ['/video', 'video'],
  ['/collage', 'collage'],
  ['/merchfolio', 'merchfolio'],
  ['/blog', 'blog'],
  ['/blog/category/brand-identity', null],
  ['/blog/category/merch-apparel', null],
  ['/blog/category/typography', null],
  ['/blog/category/illustration', null],
  ['/blog/category/process', null],
  ['/privacy-policy', 'privacy-policy'],
  ['/image-license-info', 'image-license-info'],
  ['/contact', 'contact'],
];

interface Entry {
  path: string;
  lastmod?: string;
  images?: {loc: string; title?: string}[];
}

/*
  XML has five characters that cannot appear literally in text, and this file
  interpolates titles written by hand in Studio. "Hug a Mug Coffeehouse &
  Ceramics Studio" contains one of them: emitted raw, the ampersand makes the
  whole sitemap a parse error rather than a sitemap with one odd title in it.

  The URLs need it too - Sanity's image URLs carry query strings, so `&` between
  parameters would break the document in exactly the same way.
*/
const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/*
  W3C datetime, which is the format the sitemap protocol specifies. Sanity
  returns a full ISO timestamp; the date alone is the honest resolution for
  "when did this page's content last change", and it keeps the file readable.

  Returns undefined rather than today's date for anything unparseable - a
  fabricated lastmod is worse than none.
*/
const lastmodOf = (updatedAt: unknown): string | undefined => {
  if (typeof updatedAt !== 'string') return undefined;
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
};

/*
  The images declared for a case study: its hero and its tile, whichever exist,
  deduplicated.

  Capped at the two lead images rather than every image in the body. The
  extension permits up to 1,000 per URL, but a case study's gallery runs to
  dozens of process shots, and listing them all makes the sitemap mostly
  boilerplate while telling Google nothing about which image REPRESENTS the
  project. These two are the ones chosen to stand for the work.

  These go through the transform pipeline rather than the pass-through that
  Img.astro uses for animated sources, and that is deliberate rather than an
  oversight of the rule. Pass-through exists to stop a visitor downloading a
  re-encoded 10 MB animation; nothing here is served to a visitor. What a
  crawler wants is one stable, reasonably-sized still, which is exactly what a
  w=1600 transform produces - and pointing Google Images at the original
  animated file instead would be worse for both sides.
*/
const caseStudyImages = (study: Record<string, any>): {loc: string; title?: string}[] => {
  const title = typeof study.title === 'string' ? study.title : undefined;
  const urls = [study.mainImage, study.thumbnail]
    .map((source) => imageUrl(source)?.width(1600).url())
    .filter((url): url is string => Boolean(url));
  return [...new Set(urls)].map((loc) => ({loc, title}));
};

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.href ?? 'https://rumeaudesign.co/';

  const entries: Entry[] = [];

  if (IS_PREVIEW) {
    // No network call on a preview build: robots.txt disallows everything, so
    // the file exists only so its absence isn't mistaken for a broken route.
    entries.push(...STATIC_PATHS.map(([path]) => ({path})));
  } else {
    const [pages, caseStudies, posts] = await Promise.all([
      sanityClient.fetch<{slug: string; _updatedAt: string}[]>(
        `*[_type == "page" && defined(slug.current)]{"slug": slug.current, _updatedAt}`,
      ),
      sanityClient.fetch<Record<string, any>[]>(
        `*[_type == "caseStudy" && pageType == "Case Study" && defined(slug.current)]{
          "slug": slug.current, title, _updatedAt, mainImage, thumbnail
        }`,
      ),
      sanityClient.fetch<{slug: string; _updatedAt: string}[]>(
        `*[_type == "blogPost" && defined(slug.current)]{"slug": slug.current, _updatedAt}`,
      ),
    ]);

    const pageUpdatedAt = new Map(pages.map((p) => [p.slug, p._updatedAt]));

    for (const [path, pageSlug] of STATIC_PATHS) {
      entries.push({
        path,
        lastmod: pageSlug ? lastmodOf(pageUpdatedAt.get(pageSlug)) : undefined,
      });
    }
    for (const study of caseStudies) {
      entries.push({
        path: `/work/${study.slug}`,
        lastmod: lastmodOf(study._updatedAt),
        images: caseStudyImages(study),
      });
    }
    for (const post of posts) {
      entries.push({path: `/blog/${post.slug}`, lastmod: lastmodOf(post._updatedAt)});
    }
  }

  const urls = entries
    .map(({path, lastmod, images}) => {
      const parts = [`    <loc>${xmlEscape(new URL(path, origin).href)}</loc>`];
      if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      for (const image of images ?? []) {
        parts.push(
          '    <image:image>',
          `      <image:loc>${xmlEscape(image.loc)}</image:loc>`,
          ...(image.title ? [`      <image:title>${xmlEscape(image.title)}</image:title>`] : []),
          '    </image:image>',
        );
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
