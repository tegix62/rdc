/*
  Stripping the invisible characters visual editing adds to strings.

  Sanity's stega encoding hides zero-width characters inside string values so
  Studio can map text on the page back to the field that produced it. That is
  harmless in prose and ruinous everywhere else: the string is no longer the
  string, so a comparison fails, a lookup misses, or a parse returns garbage -
  with nothing visible in the data, the markup, or the page. It is what silently
  broke the Portfolio filters, and it cost several rounds of debugging because
  there is nothing to see.

  src/lib/sanity.ts keeps a list of fields that must never be marked in the
  first place, which is the real fix. This is the second line of defence, for
  anything that list misses.

  It lives in its own module because there were three near-copies of it - here,
  in structuredData.ts and in tiles.ts - with three slightly different character
  classes. Three copies of a security-blanket function is how you end up with
  one of them being the wrong one.

  Two functions, because the right amount of stripping genuinely differs:

    stripStega     runs of four or more, the length stega actually emits. Safe
                   for prose, because it leaves a single deliberate zero-width
                   character alone - an emoji family like 👨‍👩‍👧 is joined by
                   U+200D, and stripping those would break the emoji.

    stripStegaKey  every zero-width character, no matter how few. For values
                   compared against a literal or used as a lookup key or a CSS
                   class, where one stray character is already fatal and no
                   legitimate key contains one.
*/

// @vercel/stega's character set: U+200B-200D, U+2060-2063, U+FEFF, and the
// musical-symbol range U+1D173-1D17A.
const STEGA_RUN = /[​-‍⁠-⁣﻿\u{1D173}-\u{1D17A}]{4,}/gu;
const ZERO_WIDTH = /[​-‏⁠-⁤﻿]/g;

/** Prose. Returns undefined for a non-string or an empty result. */
export function stripStega(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const stripped = value.replace(STEGA_RUN, '').trim();
  return stripped || undefined;
}

/** Lookup keys, CSS class names, and anything compared against a literal. */
export const stripStegaKey = (value: unknown): string =>
  typeof value === 'string' ? value.replace(ZERO_WIDTH, '').trim() : '';
