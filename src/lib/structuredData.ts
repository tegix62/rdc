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
  Every string in here is stripped of stega markers first.

  JSON-LD is parsed by a machine, and those zero-width characters land inside
  JSON string values - exactly the class of bug that broke the Portfolio
  filters, except here the reader is Google rather than a click handler.

  On a production build stega is off and this is a no-op, so it costs nothing;
  it exists so the preview build's JSON-LD is also valid and can be pasted
  into a validator.

  Re-exported under the name this module has always used it by, so the ~20 call
  sites below read as they did. The implementation moved to lib/stega.ts when a
  third copy of it turned up.
*/
export { stripStega as clean } from './stega';
import { stripStega as clean } from './stega';

/** Drops keys whose value is undefined, so empty Sanity fields leave no trace. */
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

/** Where the site states what may and may not be done with its images. */
export const LICENCE_PATH = '/image-license-info';

/*
  An image, declared as licensable.

  This is the one piece of structured data on the site that exists for a reason
  other than search ranking. Google Images shows a "Licensable" badge on images
  that carry these two properties, linking to the terms - and the whole site is
  already built around the position that the work is not free to take: the
  right-click handler, the drag guard, the /image-license-info page.

  Those measures are all deterrents, and weak ones by their own admission. This
  is the opposite kind of thing: it makes no attempt to stop anybody, and instead
  attaches the terms to the image in the one place a person looking for an image
  to use will actually see them.

    license            the terms themselves.
    acquireLicensePage where to ask. The same page, which is where the contact
                       route is.

  Deliberately NOT applied to the wordmark. A logo is a trademark, not stock -
  marking it licensable invites exactly the use that trademark exists to refuse.
*/
export function licensableImage(
  url: string | undefined,
  origin: string,
  caption?: string,
): Record<string, unknown> | undefined {
  if (!url) return undefined;
  const licence = `${origin}${LICENCE_PATH}`;
  return compact({
    '@type': 'ImageObject',
    url,
    contentUrl: url,
    caption: clean(caption),
    license: licence,
    acquireLicensePage: licence,
  });
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

  /*
    The founder, as a Person with an @id of their own.

    For a one-person studio the designer's name is a search entity in its own
    right - people look for "Chris Rumeau" as readily as for the studio - and
    without this the two are unrelated strings that happen to appear on the same
    site. `founder` states the relationship, which is what lets a search engine
    show one when asked about the other.

    The About page is the Person's url because that is where the site actually
    talks about him. Falls back to the homepage if that page has been removed.
  */
  const founderName = clean(settings?.founderName);
  const founder = founderName
    ? compact({
        '@type': 'Person',
        '@id': `${origin}/#founder`,
        name: founderName,
        url: `${origin}/about`,
        jobTitle: clean(settings?.founderRole),
      })
    : undefined;

  /*
    Where the studio works from and who it serves.

    Both are plain strings rather than a full PostalAddress: a studio that takes
    remote clients has no counter to walk up to, and an address with a street in
    it is a claim about a place of business. `areaServed` is the honest version
    of what a design studio wants from a local search - "yes, this business
    covers you" - without inventing premises.
  */
  const locality = clean(settings?.locality);

  const organization = compact({
    '@type': 'Organization',
    '@id': orgId,
    name,
    // The name on the copyright line, when it differs from the trading name.
    legalName: clean(settings?.legalName),
    url: `${origin}/`,
    description: clean(settings?.tagline),
    email: clean(settings?.email),
    // Resolved by the caller, which is where the image URL builder lives.
    // Plain ImageObject, not licensable - see licensableImage.
    logo: ctx.logoUrl ? {'@type': 'ImageObject', url: ctx.logoUrl} : undefined,
    founder,
    address: locality ? compact({'@type': 'PostalAddress', addressLocality: locality}) : undefined,
    areaServed: clean(settings?.areaServed),
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
    primaryImageOfPage: licensableImage(ctx.image, origin, clean(ctx.title)),
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

  /*
    Contributors, as Person nodes with their own url.

    Chris credits collaborators partly for SEO, and a link in the markup is only
    half of that: it tells a crawler there is a link, not that the person
    CONTRIBUTED to this piece of work. `contributor` states the relationship, so
    the credit is legible as a credit rather than as an outbound link that
    happens to sit near a name.

    Only credits with a name; a role on its own describes nobody.
  */
  const contributors = (Array.isArray(study.credits) ? study.credits : [])
    .map((c: any) =>
      clean(c?.name)
        ? compact({
            '@type': 'Person',
            name: clean(c.name),
            url: clean(c.url),
            jobTitle: clean(c.role),
          })
        : null,
    )
    .filter(Boolean);

  const work = compact({
    '@type': 'CreativeWork',
    '@id': `${canonical}#work`,
    name: clean(study.title),
    headline: clean(study.headline),
    description: clean(study.seoDescription) ?? clean(study.oneLineSummary) ?? clean(study.summary),
    url: canonical,
    image: licensableImage(ctx.image, origin, clean(study.title)),
    creator: {'@id': orgId},
    // Named on the page as the client, so it is the subject of the work.
    about: client ? {'@type': 'Organization', name: client} : undefined,
    genre: category,
    contributor: contributors.length ? contributors : undefined,
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
    image: licensableImage(ctx.image, origin, clean(post.title)),
    // Only stated when the field is filled. An invented date is a lie a
    // crawler will happily repeat.
    datePublished: clean(post.publishedAt),
    /*
      Sanity's own _updatedAt, so an edited post says it was edited. Only
      emitted alongside a real publish date: dateModified on its own describes
      a revision to something that was apparently never published.
    */
    dateModified: clean(post.publishedAt) ? clean(post._updatedAt) : undefined,
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
