/*
  One way to print a date, shared by the blog index and the post page.

  Two things were wrong with `new Date(iso).toLocaleDateString()`:

  LOCALE     There is no user at build time. `toLocaleDateString()` with no
             locale uses the locale of whatever machine ran the build - a
             GitHub Actions runner - so the format was decided by CI's default
             rather than by anyone's choice. It rendered "3/14/2025" and would
             have rendered "14/03/2025" if the runner image ever changed.

  TIME ZONE  `publishedAt` is a datetime, not a date. A post published at
             23:00 UTC formatted in a runner set to US time prints the
             PREVIOUS DAY. The published date is a fact about the post, not
             about where the build happened, so it is read in UTC.

  Long month names on purpose: "14 March 2025" cannot be misread, where
  "3/14/2025" and "14/3/2025" are the same nine characters meaning two
  different days depending on who is reading.

  Stega is stripped before parsing. `publishedAt` is a datetime that reads as
  prose to Sanity's marker filter, so on the preview build it came back with
  zero-width characters in it and `new Date()` returned an Invalid Date - which
  `toLocaleDateString()` printed onto the page as the literal words "Invalid
  Date". It is also excluded in lib/sanity.ts now; this is the belt to that
  braces.
*/
import { stripStegaKey } from './stega';

const FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Human-readable date, or null if the value is missing or unparseable. */
export function formatDate(value: unknown): string | null {
  const date = new Date(stripStegaKey(value));
  // An unparseable string yields an Invalid Date, and formatting one prints the
  // literal "Invalid Date" onto the page rather than throwing.
  return Number.isNaN(date.getTime()) ? null : FORMATTER.format(date);
}

/*
  The machine-readable half of the same date, for <time datetime="...">.

  Without the attribute the date is only ever a string in a paragraph - nothing
  can tell "14 March 2025" from any other text, so search results, reading-list
  apps and assistive tech have no publication date for the post even though it
  is printed right there.

  YYYY-MM-DD rather than the full timestamp: a date is what is being shown, and
  a datetime attribute that disagrees with the visible text is worse than a
  coarser one that matches it.
*/
export function dateAttr(value: unknown): string | null {
  const date = new Date(stripStegaKey(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
