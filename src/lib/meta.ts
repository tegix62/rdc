/*
  The strings in <head> that are composed rather than copied.

  This lived inline in Layout.astro and work/[slug].astro. It moved here for one
  reason: it is the only logic on the site whose output nobody ever looks at.
  A wrong <h1> is obvious on the page; a <title> that reads "Rumeau Design Co |
  Rumeau Design Co", or 13 project pages sharing one meta description, is
  invisible until it shows up in a search result months later. So it is pure
  functions with a test in front of them - see scripts/test-meta.mjs.
*/
import { stripStega } from './stega';

export const DEFAULT_SITE_NAME = 'Rumeau Design Co';
export const DEFAULT_LEGAL_NAME = 'Rumeau Design LLC';

/*
  What goes in <title>.

  Every page shipped a bare title - "About", "Blog", "Chateau Seven" - so a
  search result or a bookmark said nothing about whose site it is, and Google
  appended the bare domain rather than the studio's name.

  The `includes` check is what stops the suffix doubling up. The homepage's
  title IS the site name, and several pages are titled things like "Rumeau
  Design Co — Portfolio", so appending unconditionally would print the name
  twice on exactly the pages people see first.
*/
export function pageTitle(title: unknown, siteName: string = DEFAULT_SITE_NAME): string {
  const name = stripStega(siteName) ?? DEFAULT_SITE_NAME;
  const bare = stripStega(title) ?? name;
  return bare.includes(name) ? bare : `${bare} | ${name}`;
}

/** The un-suffixed title, for og:title - which sits directly above og:site_name. */
export const bareTitle = (title: unknown, siteName: string = DEFAULT_SITE_NAME): string =>
  stripStega(title) ?? stripStega(siteName) ?? DEFAULT_SITE_NAME;

/*
  Trims to the first sentence, and to 160 characters - roughly where Google
  stops rendering a description.
*/
export function firstSentence(text: string, limit = 160): string {
  const match = text.match(/^.*?[.!?](\s|$)/);
  const candidate = (match ? match[0] : text).trim();
  return candidate.length > limit ? `${candidate.slice(0, limit - 1).trimEnd()}…` : candidate;
}

/*
  A static page's meta description.

  Every one of the nine static pages passed `page.seoDescription` straight
  through, and that field is empty on most of them - so they all fell back to
  the layout's default and shipped the string "Rumeau Design Co" as the
  description of the homepage, Portfolio, About, Video, Collage, Merch, Blog,
  the privacy policy and the licence page alike. Nine pages, one description.

  So each page now names its own fallback. `?? fallback` on its own would not be
  enough: an empty string in Studio is not null, and stripStega returns undefined
  for one, which is what makes this work.

  Anything written into Studio still wins. These are the floor, not the copy.
*/
export const pageDescription = (
  page: {seoDescription?: unknown} | null | undefined,
  fallback: string,
): string => stripStega(page?.seoDescription) ?? fallback;

/*
  A blog post's, same idea. metaDescription, else the excerpt, else the first
  sentence of the body - and only then something derived, because a post always
  has a title even when nothing else is filled in.
*/
export function blogPostDescription(post: {
  metaDescription?: unknown;
  excerpt?: unknown;
  title?: unknown;
}): string {
  const written = stripStega(post?.metaDescription) ?? stripStega(post?.excerpt);
  if (written) return firstSentence(written);
  const title = stripStega(post?.title);
  return title ? `${title} — notes from ${DEFAULT_SITE_NAME}.` : `Notes from ${DEFAULT_SITE_NAME}.`;
}

interface CaseStudyMeta {
  title?: unknown;
  category?: unknown;
  client?: unknown;
  principalType?: unknown;
  oneLineSummary?: unknown;
  summary?: unknown;
}

/*
  A project page's meta description.

  It used to be `oneLineSummary` and nothing else. That field is empty on most
  of the 13 projects, so those pages fell through to the layout's default and
  shipped the string "Rumeau Design Co" as the description of every one of them.
  Duplicate meta descriptions across a site are the one SEO fault Google names
  outright, and the search result then says nothing about the project either.

  Three levels, in descending order of how much a person wrote:

    oneLineSummary  the field whose stated job this is.
    summary         the longer paragraph shown on the page. Its first sentence
                    is a real description; better than anything generated.
    derived         assembled from category, client and principal type. Not as
                    good as a written line, but true, and different per page:
                    "Brand Identity work for Chateau Seven by Rumeau Design Co.
                    Principal type: Caslon."

  Nothing here invents a fact. Every clause is a field, dropped when empty -
  the same rule the JSON-LD follows, and for the same reason.
*/
export function caseStudyDescription(
  study: CaseStudyMeta,
  siteName: string = DEFAULT_SITE_NAME,
): string {
  const written = stripStega(study?.oneLineSummary);
  if (written) return firstSentence(written);

  const paragraph = stripStega(study?.summary);
  if (paragraph) return firstSentence(paragraph);

  const name = stripStega(siteName) ?? DEFAULT_SITE_NAME;
  const category = stripStega(study?.category);
  const subject = stripStega(study?.client) ?? stripStega(study?.title);
  const type = stripStega(study?.principalType);

  const opener = category
    ? `${category} work${subject ? ` for ${subject}` : ''} by ${name}.`
    : `${subject ?? 'Selected work'} by ${name}.`;

  return type ? `${opener} Principal type: ${type}.` : opener;
}
