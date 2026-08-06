/*
  Schema.org JSON-LD.

  The live Webflow site emits a `SchemaMarkupJSONLD` block and the port had
  none, which is the last piece of the SEO parity check that was never actually
  compared - the earlier pass covered meta, OG, canonical, sitemap and robots
  and stopped there.

  What this is for, concretely: it is the difference between a search result
  that says "rumeaudesign.co" and one that carries a name, a logo, and the
  links out to Instagram and the rest. For case studies it also states who made
  the work and who it was for, which is the claim the site is actually making.

  Everything below is built from what is in Sanity. Nothing is invented: a
  field that is empty produces no property rather than a plausible-looking
  default, because structured data that says something untrue about a business
  is worse than structured data that says less.
*/

/*
  Stega hides zero-width characters inside strings so Studio can map text on
  the page back to the field that produced it. JSON-LD is parsed by a machine,
  and those characters land inside JSON string values - which is exactly the
  class of bug that broke the Portfolio filters, except here the reader is
  Google rather than a click handler.

  On a production build stega is off and this is a no-op, so it costs nothing;
  it exists so the preview build's JSON-LD is also valid and can be pasted
  into a validator. Character set is @vercel/stega's: U+200B-200D, U+2060-2063,
  U+FEFF, U+1D173-1D17A, four or more in a row.
*/
const STEGA = /[​-‍⁠-⁣﻿\u{1D173}-\u{1D17A}]{4,}/gu;

export function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const stripped = value.replace(STEGA, '').trim();
  return stripped || undefined;
}

/** Drops keys whose value is undefined, so empty Sanity fields leave no trace. */
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

export interface SiteContext {
  /** Absolute origin, e.g. https://rumeaudesign.co */
  origin: string;
  /** This page's canonical URL. */
  canonical: string;
  title: string;
  description?: string;
  /** Absolute URL, already resolved by the page. */
  image?: string;
  /** Absolute URL for the site logo, resolved by the caller. */
  logoUrl?: string;
  settings?: Record<string, any> | null;
}

/*
  One @graph per page rather than several separate script tags, with stable
  @ids so the Organization and WebSite nodes are stated once and referenced
  everywhere else. Repeating the whole Organization on every page also works,
  but then a change to it has to be made consistently in several places or
  crawlers see conflicting claims about the same entity.
*/
export function buildGraph(ctx: SiteContext, extra: Record<string, unknown>[] = []) {
  const {origin, canonical, settings} = ctx;
  const orgId = `${origin}/#organization`;
  const siteId = `${origin}/#website`;
  const pageId = `${canonical}#webpage`;

  const name = clean(settings?.siteTitle) ?? 'Rumeau Design Co';

  /*
    socialLinks is a list of {platform, url}. Only the URLs go in - `sameAs`
    means "other pages that unambiguously identify this same entity", so the
    platform label has no place in it.
  */
  const sameAs = Array.isArray(settings?.socialLinks)
    ? settings.socialLinks
        .map((l: any) => clean(l?.url))
        .filter((u: string | undefined): u is string => Boolean(u && /^https?:\/\//.test(u)))
    : [];

  const organization = compact({
    '@type': 'Organization',
    '@id': orgId,
    name,
    url: `${origin}/`,
    description: clean(settings?.tagline),
    // Resolved by the caller, which is where the image URL builder lives.
    logo: ctx.logoUrl ? {'@type': 'ImageObject', url: ctx.logoUrl} : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  });

  const website = compact({
    '@type': 'WebSite',
    '@id': siteId,
    url: `${origin}/`,
    name,
    publisher: {'@id': orgId},
    inLanguage: 'en',
  });

  const webpage = compact({
    '@type': 'WebPage',
    '@id': pageId,
    url: canonical,
    name: clean(ctx.title),
    description: clean(ctx.description),
    isPartOf: {'@id': siteId},
    primaryImageOfPage: ctx.image ? {'@type': 'ImageObject', url: ctx.image} : undefined,
    inLanguage: 'en',
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [organization, website, webpage, ...extra],
  };
}

/*
  A case study is a CreativeWork rather than an Article: it is a record of a
  piece of design, not writing about one. `creator` is the studio, `about` is
  the client's brand when one is named.
*/
export function caseStudyNode(
  ctx: SiteContext,
  study: Record<string, any>,
): Record<string, unknown>[] {
  const {origin, canonical} = ctx;
  const orgId = `${origin}/#organization`;

  const client = clean(study.client);
  const category = clean(study.category);

  const work = compact({
    '@type': 'CreativeWork',
    '@id': `${canonical}#work`,
    name: clean(study.title),
    headline: clean(study.headline),
    description: clean(study.oneLineSummary) ?? clean(study.summary),
    url: canonical,
    image: ctx.image,
    creator: {'@id': orgId},
    // Named on the page as the client, so it is the subject of the work.
    about: client ? {'@type': 'Organization', name: client} : undefined,
    genre: category,
    mainEntityOfPage: {'@id': `${canonical}#webpage`},
  });

  return [work, breadcrumb(origin, [['Portfolio', `${origin}/portfolio`], [clean(study.title) ?? 'Project', canonical]])];
}

export function blogPostNode(
  ctx: SiteContext,
  post: Record<string, any>,
): Record<string, unknown>[] {
  const {origin, canonical} = ctx;
  const orgId = `${origin}/#organization`;
  const author = clean(post.author);

  const article = compact({
    '@type': 'BlogPosting',
    '@id': `${canonical}#post`,
    headline: clean(post.title),
    description: clean(post.metaDescription) ?? clean(post.excerpt),
    url: canonical,
    image: ctx.image,
    // Only stated when the field is filled. An invented date is a lie a
    // crawler will happily repeat.
    datePublished: clean(post.publishedAt),
    author: author ? {'@type': 'Person', name: author} : {'@id': orgId},
    publisher: {'@id': orgId},
    mainEntityOfPage: {'@id': `${canonical}#webpage`},
  });

  return [article, breadcrumb(origin, [['Blog', `${origin}/blog`], [clean(post.title) ?? 'Post', canonical]])];
}

/** Home is always the first crumb; callers pass the rest in order. */
export function breadcrumb(origin: string, trail: [string, string][]): Record<string, unknown> {
  const items = [['Home', `${origin}/`] as [string, string], ...trail];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item,
    })),
  };
}

/*
  Serialised by hand rather than with set:html on JSON.stringify alone, because
  a "</script>" inside any string value would end the script tag early and
  spill the rest of the JSON into the page as markup. Escaping the slash is the
  standard fix and leaves the JSON equivalent.
*/
export function serialise(graph: unknown): string {
  return JSON.stringify(graph).replace(/<\//g, '<\\/');
}
