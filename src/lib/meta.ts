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

/*
  The un-suffixed title, for og:title - which sits directly above og:site_name in
  every social card, so restating the studio's name there prints it twice.

  It is not enough to skip the suffix this file adds. Three page titles in Sanity
  END with the site name already - migrated from Webflow, where the title field
  was the whole <title> - so /collage, /merchfolio and /video shared as
  "Collage | Rumeau Design Co" above a site_name of "Rumeau Design Co". Found by
  scripts/test-head.mjs reading the built HTML; nothing in the composition
  functions could have caught it, because the composition was doing what it was
  told.

  So a trailing separator plus the site name is stripped wherever it came from.
  <title> keeps it: there the name belongs.
*/
export function bareTitle(title: unknown, siteName: string = DEFAULT_SITE_NAME): string {
  const name = stripStega(siteName) ?? DEFAULT_SITE_NAME;
  const bare = stripStega(title) ?? name;
  // The homepage's title IS the site name. Stripping it there would leave nothing.
  if (bare === name) return bare;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trimmed = bare.replace(new RegExp(`\\s*[|–—·:-]\\s*${escaped}\\.?\\s*$`, 'i'), '').trim();
  return trimmed || bare;
}

/*
  Caps length at 160 characters - roughly where Google stops rendering a
  description - and does nothing else.

  WHAT THIS IS AND IS NOT FOR

  Used on text the CODE assembled, or on page copy being repurposed. NOT on a
  line somebody wrote for the search result.

  The distinction matters more than it looks. Over-length descriptions are not
  penalised; Google truncates them for display and, since the head now sends
  max-snippet:-1, may show more than 160 characters in some contexts. So
  truncating here does not avoid a penalty - it permanently discards a tail that
  the author wrote and that might otherwise have been shown.

  For assembled text that trade is fine: nobody chose those words, and a clean
  cut beats a ragged one. For a written line it is the wrong call, and it is the
  call the first version of this made. Written fields now pass through whole and
  the SEO audit reports their length instead, which puts the decision with the
  person who wrote the sentence.
*/
export function clamp(text: string, limit = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  /*
    Break on a word boundary rather than mid-word. Slicing at exactly the limit
    produces "...brand identity for herit…", which reads as a rendering fault
    rather than as a truncation.
  */
  const cut = trimmed.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Guard the pathological case of a single 160-character word.
  const body = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[,;:.\s]+$/, '')}…`;
}

/*
  Trims to the first sentence, then caps length.

  For prose that was written to be READ ON THE PAGE - a summary paragraph, an
  excerpt - where sentence two carries on a thought that a search result has no
  room to finish.
*/
export function firstSentence(text: string, limit = 160): string {
  const match = text.match(/^.*?[.!?](\s|$)/);
  return clamp(match ? match[0] : text, limit);
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
  A blog post's, same idea. metaDescription, else the excerpt - and only then
  something derived, because a post always has a title even when nothing else is
  filled in.

  The two written fields are treated differently on purpose. metaDescription was
  written for the search result, so it is passed through untouched; the excerpt is
  page copy, so it gets cut at its first sentence and capped.
*/
export function blogPostDescription(post: {
  metaDescription?: unknown;
  excerpt?: unknown;
  title?: unknown;
}): string {
  const forSearch = stripStega(post?.metaDescription);
  if (forSearch) return forSearch.trim();

  const written = stripStega(post?.excerpt);
  if (written) return firstSentence(written);
  const title = stripStega(post?.title);
  return title ? `${title} - notes from ${DEFAULT_SITE_NAME}.` : `Notes from ${DEFAULT_SITE_NAME}.`;
}

/*
  The @handle for twitter:site, dug out of the social links.

  X reads twitter:site to attribute the card, and without it the card renders
  with no account line at all. It could have been a new field in Studio, but the
  handle is already there inside the X/Twitter social link - asking for it a
  second time invites the two copies to disagree, and the one in the footer is
  the one anybody would notice was wrong.

  Matches x.com and twitter.com only. Deliberately narrow: an Instagram URL also
  ends in a username, and putting that in twitter:site attributes the card to
  whoever happens to hold the same name on X.
*/
export function twitterHandle(socialLinks: unknown): string | undefined {
  if (!Array.isArray(socialLinks)) return undefined;
  for (const link of socialLinks) {
    const url = stripStega((link as {url?: unknown})?.url);
    if (!url) continue;
    const match = url.match(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/@?([A-Za-z0-9_]{1,15})\/?(?:[?#].*)?$/i);
    // Reserved paths that are not accounts, so an /i/... or /share link
    // doesn't become "@i".
    if (match && !/^(i|share|home|intent|search|explore)$/i.test(match[1])) {
      return `@${match[1]}`;
    }
  }
  return undefined;
}

interface CaseStudyMeta {
  title?: unknown;
  category?: unknown;
  client?: unknown;
  principalType?: unknown;
  seoDescription?: unknown;
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

  Four levels, in descending order of how much a person wrote:

    seoDescription  written for search, and for nothing else. The only one of
                    these that can be tuned without changing what the page says
                    - the others all appear on the page too, so rewriting one
                    to read better in Google changes the design.
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
  // Whole, not clamped: see the note on clamp() about why truncating a line
  // written for search is the wrong trade.
  const forSearch = stripStega(study?.seoDescription);
  if (forSearch) return forSearch.trim();

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
