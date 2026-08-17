/*
  The <head> strings and the dates - the two things on this site whose output
  nobody ever looks at.

  A wrong <h1> is obvious the moment you load the page. These are not:

    - a <title> reading "Rumeau Design Co | Rumeau Design Co"
    - 13 project pages sharing one meta description
    - a date printed as "Invalid Date" only on the preview build
    - a date printed a day early because the build machine was not in UTC

  Every one of those ships silently, looks fine in review, and turns up months
  later in a search result. So the composition is pure functions in lib/meta.ts
  and lib/date.ts, and this asserts what they produce.

  Pure logic, no network and no build, so it runs in front of every push - which
  matters because the sandbox this was written in cannot reach Sanity at all,
  and a full render therefore cannot be verified locally.

  Usage: node scripts/test-meta.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}
const eq = (name, actual, expected) =>
  check(name, actual === expected, actual === expected ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`)

/*
  Bundled through esbuild rather than imported, the same way test-image-guards
  does it: these are .ts, and Node will not load TypeScript. Nothing here reads
  import.meta.env, so no `define` is needed.
*/
const outdir = path.join(root, 'node_modules', '.cache', 'meta-test')
await mkdir(outdir, {recursive: true})
const bundleOf = async (entry, name) => {
  const outfile = path.join(outdir, name)
  await build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'error',
  })
  return import(outfile)
}

const meta = await bundleOf('src/lib/meta.ts', 'meta.mjs')
const dates = await bundleOf('src/lib/date.ts', 'date.mjs')
const stega = await bundleOf('src/lib/stega.ts', 'stega.mjs')

// The character sequence Sanity's stega encoding actually emits: a run of
// zero-width characters. Four is the minimum length the prose stripper treats
// as a marker rather than as content.
const MARK = '​​‌‍'

// --- titles -----------------------------------------------------------------
const {pageTitle, bareTitle} = meta

eq('a page title gets the site name appended', pageTitle('About', 'Rumeau Design Co'), 'About | Rumeau Design Co')

/*
  The homepage's title IS the site name. Appending unconditionally would print
  it twice on the first page anyone sees, which is the failure this check
  exists for.
*/
eq('a title that is already the site name is left alone', pageTitle('Rumeau Design Co', 'Rumeau Design Co'), 'Rumeau Design Co')
eq('a title that contains the site name is left alone', pageTitle('Rumeau Design Co — Portfolio', 'Rumeau Design Co'), 'Rumeau Design Co — Portfolio')

// A stega-marked title would never match the site name, so the suffix would be
// appended to a title that already carried it. This is the Portfolio-filter bug
// in a different costume.
eq(
  'stega markers do not cause the site name to be printed twice',
  pageTitle(`Rumeau Design Co${MARK}`, 'Rumeau Design Co'),
  'Rumeau Design Co',
)
check(
  'a stega-marked title carries no zero-width characters into <title>',
  !/[​-‏⁠-⁤﻿]/.test(pageTitle(`About${MARK}`, `Rumeau Design Co${MARK}`)),
  JSON.stringify(pageTitle(`About${MARK}`, `Rumeau Design Co${MARK}`)),
)

eq('an empty title falls back to the site name', pageTitle('', 'Rumeau Design Co'), 'Rumeau Design Co')
eq('a missing title falls back to the site name', pageTitle(undefined, 'Rumeau Design Co'), 'Rumeau Design Co')
eq('a missing site name falls back to the default', pageTitle('About', ''), 'About | Rumeau Design Co')

// og:title sits directly above og:site_name in every social card.
eq('the share title carries no suffix', bareTitle('About', 'Rumeau Design Co'), 'About')

/*
  The real finding from test-head.mjs's first run against built output: three page
  titles in Sanity already END with the site name, migrated from Webflow where
  the title field was the whole <title>. So /collage, /merchfolio and /video
  shared as "Collage | Rumeau Design Co" above a site_name of the same thing.

  Nothing in the composition functions could have caught that - they were doing
  exactly what they were told. It took reading the artefact.
*/
eq('a pipe suffix in the content is stripped', bareTitle('Collage | Rumeau Design Co', 'Rumeau Design Co'), 'Collage')
eq('an em-dash suffix is stripped', bareTitle('Collage — Rumeau Design Co', 'Rumeau Design Co'), 'Collage')
eq('an en-dash suffix is stripped', bareTitle('Collage – Rumeau Design Co', 'Rumeau Design Co'), 'Collage')
eq('a hyphen suffix is stripped', bareTitle('Collage - Rumeau Design Co', 'Rumeau Design Co'), 'Collage')
eq('a trailing full stop is stripped with it', bareTitle('Collage | Rumeau Design Co.', 'Rumeau Design Co'), 'Collage')
// Not a suffix - a real title that happens to contain a pipe. Testing for the
// pipe rather than for the site name is what made the first version of the
// built-HTML check fail on something that was fine.
eq('a pipe that is not the site name is left alone', bareTitle('Video | Motion Work', 'Rumeau Design Co'), 'Video | Motion Work')
// The homepage's title IS the site name; stripping would leave nothing.
eq('a title that is only the site name survives', bareTitle('Rumeau Design Co', 'Rumeau Design Co'), 'Rumeau Design Co')
eq('a title that is only a separator and the name survives', bareTitle('| Rumeau Design Co', 'Rumeau Design Co'), '| Rumeau Design Co')
// The suffix <title> adds is stripped too, since it is the same shape.
eq('the suffix this module adds is stripped back off', bareTitle(pageTitle('About', 'Rumeau Design Co'), 'Rumeau Design Co'), 'About')

// --- case study descriptions -------------------------------------------------
const {caseStudyDescription, firstSentence} = meta

eq(
  'a written one-line summary wins',
  caseStudyDescription({oneLineSummary: 'A heritage mark for a Hudson Valley winery.', category: 'Brand Identity', client: 'Chateau Seven'}),
  'A heritage mark for a Hudson Valley winery.',
)

eq(
  'the full summary is used when the short blurb is empty',
  caseStudyDescription({summary: 'Chateau Seven needed a mark that read as old. We drew it by hand over six weeks.', client: 'Chateau Seven'}),
  'Chateau Seven needed a mark that read as old.',
)

eq(
  'with neither, one is derived from the fields that are set',
  caseStudyDescription({category: 'Brand Identity', client: 'Chateau Seven', principalType: 'Caslon'}),
  'Brand Identity work for Chateau Seven by Rumeau Design Co. Principal type: Caslon.',
)

eq(
  'principal type is dropped when it is not set',
  caseStudyDescription({category: 'Merch & Apparel', client: 'Hug a Mug'}),
  'Merch & Apparel work for Hug a Mug by Rumeau Design Co.',
)

eq(
  'the title stands in for a missing client',
  caseStudyDescription({category: 'Typography', title: 'Two Point Oh'}),
  'Typography work for Two Point Oh by Rumeau Design Co.',
)

eq(
  'an empty document still produces something rather than nothing',
  caseStudyDescription({}),
  'Selected work by Rumeau Design Co.',
)

/*
  The point of the whole fallback chain: no two project pages may ship the same
  description. Thirteen documents with no summaries at all is the state the
  dataset is actually in, so that is what gets asserted.
*/
const bare = [
  {title: 'Chateau Seven', category: 'Brand Identity'},
  {title: 'Hug a Mug', category: 'Merch & Apparel'},
  {title: 'Adelante Barbell Club', category: 'Brand Identity'},
  {title: 'Two Point Oh', category: 'Typography'},
  {title: 'Golden Coast', category: 'Illustration'},
].map((d) => caseStudyDescription(d))
check(
  'documents with no written summary still get distinct descriptions',
  new Set(bare).size === bare.length,
  `${new Set(bare).size} distinct out of ${bare.length}`,
)

// Every one has to be a real sentence, not a fragment ending mid-word.
check(
  'every derived description is a complete sentence',
  bare.every((d) => d.endsWith('.') && d.length > 20),
  bare[0],
)

eq('stega markers never reach a description', caseStudyDescription({oneLineSummary: `A heritage mark.${MARK}`}), 'A heritage mark.')

// 160 characters is roughly where Google stops rendering a description.
const long = `${'x'.repeat(400)}.`
check('an over-long description is trimmed', firstSentence(long).length <= 160, `${firstSentence(long).length} chars`)
check('a trimmed description says it was trimmed', firstSentence(long).endsWith('…'))
eq('a short sentence is not touched', firstSentence('Short one.'), 'Short one.')
// No sentence-ending punctuation at all - must not return empty.
eq('text with no full stop is still returned', firstSentence('no punctuation here'), 'no punctuation here')

/*
  --- clamp vs firstSentence --------------------------------------------------

  These two exist to treat two different kinds of text differently, and the
  distinction is the whole point:

    firstSentence  page copy, and text the code assembled. Sentence two carries
                   on a thought a search result has no room to finish, so it is
                   cut, then capped.
    clamp          the cap on its own, for assembled text that is already one
                   sentence.

  Before this split, every written description went through firstSentence - so a
  deliberate two-sentence line lost its second half, silently, and the only
  place that would ever have shown up is a Google result months later.

  A line written FOR search goes through NEITHER. It is passed through whole:
  truncating it discards a tail the author wrote, which the head now explicitly
  invites Google to show in full via max-snippet:-1. The audit reports its
  length instead, leaving the decision with the person who wrote the sentence.
*/
const {clamp} = meta

eq('clamp keeps a deliberate second sentence', clamp('A heritage mark. Drawn by hand.'), 'A heritage mark. Drawn by hand.')
eq('firstSentence cuts the same string', firstSentence('A heritage mark. Drawn by hand.'), 'A heritage mark.')
eq('clamp trims surrounding whitespace', clamp('  spaced out  '), 'spaced out')

// Long text breaks at a word boundary, not mid-word: "...for herit…" reads as a
// rendering fault rather than as a truncation.
const longProse = `${'word '.repeat(60)}end.`
const clamped = clamp(longProse)
check('clamp caps at 160', clamped.length <= 160, `${clamped.length} chars`)
check('clamp marks the cut', clamped.endsWith('…'))
/*
  Cutting at a word boundary, stated precisely: strip the ellipsis, and what is
  left must be a prefix of the source that ENDS where a space begins. That is
  what distinguishes "...brand identity" from "...brand ident".
*/
const body = clamped.slice(0, -1)
check(
  'clamp cuts at a word boundary, not mid-word',
  longProse.startsWith(body) && /^\s/.test(longProse.slice(body.length)),
  `ends "${body.slice(-12)}" then "${longProse.slice(body.length, body.length + 3)}"`,
)
check('clamp leaves no dangling punctuation before the ellipsis', !/[,;:.\s]…$/.test(clamped), clamped.slice(-12))

// The pathological case the word-boundary logic has to survive: one long word,
// where there is no boundary to break on.
const oneWord = 'x'.repeat(400)
check('a single over-long word is still capped', clamp(oneWord).length <= 160, `${clamp(oneWord).length} chars`)

/*
  seoDescription on a case study: the override that appears nowhere on the page.

  It sits above oneLineSummary because the two answer different questions - what
  belongs on the page, and what pulls a stranger in - and those are not always
  the same sentence.
*/
eq(
  'a case study search description outranks the on-page blurb',
  caseStudyDescription({seoDescription: 'Written for Google.', oneLineSummary: 'Written for the page.'}),
  'Written for Google.',
)
eq(
  'and it is kept whole rather than cut at the first full stop',
  caseStudyDescription({seoDescription: 'A heritage mark for a winery. Hand-drawn over six weeks.'}),
  'A heritage mark for a winery. Hand-drawn over six weeks.',
)
/*
  A written line is not truncated even when it is long.

  This is the opposite of what the first version did, and the reason is
  max-snippet:-1 in the head: the site now tells Google there is no limit on the
  snippet it may show. Cutting the field at 160 with an ellipsis would throw away
  a tail that Google was just invited to display - and over-length descriptions
  carry no penalty, so the truncation bought nothing in exchange.

  The audit reports the length instead. That keeps the choice with whoever wrote
  it, which is the only place a judgement about their own sentence belongs.
*/
const longWritten = `${'A written sentence about the work. '.repeat(8)}End.`
eq(
  'a long written search description is passed through untouched',
  caseStudyDescription({seoDescription: longWritten}),
  longWritten.trim(),
)
eq(
  'a long written post description is passed through untouched',
  meta.blogPostDescription({metaDescription: longWritten}),
  longWritten.trim(),
)
eq(
  'an empty search description falls through to the blurb',
  caseStudyDescription({seoDescription: '', oneLineSummary: 'The blurb.'}),
  'The blurb.',
)

/*
  --- twitter:site ------------------------------------------------------------

  Derived from the X link already in the footer rather than asked for twice.
  The narrowness is the point: an Instagram URL also ends in a username, and
  putting that in twitter:site attributes the card to whoever holds the same
  name on X.
*/
const {twitterHandle} = meta

eq('an x.com link becomes a handle', twitterHandle([{platform: 'X', url: 'https://x.com/rumeaudesign'}]), '@rumeaudesign')
eq('twitter.com works too', twitterHandle([{platform: 'Twitter', url: 'https://twitter.com/rumeaudesign'}]), '@rumeaudesign')
eq('www and a trailing slash are tolerated', twitterHandle([{url: 'https://www.x.com/rumeaudesign/'}]), '@rumeaudesign')
eq('a query string is ignored', twitterHandle([{url: 'https://x.com/rumeaudesign?s=20'}]), '@rumeaudesign')
eq('an instagram link is NOT read as a handle', twitterHandle([{platform: 'Instagram', url: 'https://instagram.com/rumeaudesign'}]), undefined)
eq('a share link does not become @intent', twitterHandle([{url: 'https://x.com/intent/tweet'}]), undefined)
eq('an /i/ link does not become @i', twitterHandle([{url: 'https://x.com/i/flow/login'}]), undefined)
eq('the X link is found among others', twitterHandle([{url: 'https://instagram.com/a'}, {url: 'https://x.com/b'}]), '@b')
eq('no social links at all is undefined, not a crash', twitterHandle(undefined), undefined)
eq('an empty list is undefined', twitterHandle([]), undefined)
eq('a link with no url is skipped', twitterHandle([{platform: 'X'}]), undefined)
eq('stega markers do not leak into the handle', twitterHandle([{url: `https://x.com/rumeaudesign${MARK}`}]), '@rumeaudesign')

// --- page and post descriptions ----------------------------------------------
const {pageDescription, blogPostDescription} = meta
const FALLBACK = 'Apparel and merchandise design.'

eq('a written seoDescription wins', pageDescription({seoDescription: 'Real copy.'}, FALLBACK), 'Real copy.')

/*
  The reason `?? fallback` on its own is not enough. An empty string in Studio is
  not null, and nine pages sharing the layout's default description is what
  actually shipped.
*/
eq('an EMPTY seoDescription falls back', pageDescription({seoDescription: ''}, FALLBACK), FALLBACK)
eq('whitespace-only falls back', pageDescription({seoDescription: '   '}, FALLBACK), FALLBACK)
eq('a missing field falls back', pageDescription({}, FALLBACK), FALLBACK)
eq('a null page falls back', pageDescription(null, FALLBACK), FALLBACK)
eq('stega markers never reach a page description', pageDescription({seoDescription: `Real copy.${MARK}`}, FALLBACK), 'Real copy.')

eq('a post uses its metaDescription', blogPostDescription({metaDescription: 'Written for search.', excerpt: 'x', title: 'T'}), 'Written for search.')
eq('a post falls back to its excerpt', blogPostDescription({excerpt: 'The opening line. And more.', title: 'T'}), 'The opening line.')
// Hyphen, not an em dash. Chris's house style, applied across the site's copy
// - see scripts/fix-text-in-sanity.mjs for the Sanity-side pass. This assertion
// held the old convention and is the reason a style change shows up as a test
// failure rather than silently disagreeing with everything else.
eq('a post with only a title still gets one', blogPostDescription({title: 'On Hand Lettering'}), 'On Hand Lettering - notes from Rumeau Design Co.')
eq('an empty post still gets one', blogPostDescription({}), 'Notes from Rumeau Design Co.')

// --- dates -------------------------------------------------------------------
const {formatDate, dateAttr} = dates

/*
  23:00 UTC. Formatted in a runner set to US Eastern this is still the 14th in
  UTC and the 14th at 18:00 locally - but 01:00 UTC on the 15th would print the
  14th locally, which is the bug. Pinning the zone is what fixes it; this
  asserts the pin is in place by checking a time that would shift.
*/
eq('a late-UTC datetime keeps its own day', formatDate('2025-03-14T23:30:00.000Z'), '14 March 2025')
eq('an early-UTC datetime keeps its own day', formatDate('2025-03-15T00:30:00.000Z'), '15 March 2025')

// The format must not be decided by the build machine's locale.
eq('the month is spelled out, so the format cannot be misread', formatDate('2025-11-01T12:00:00.000Z'), '1 November 2025')

eq('the datetime attribute agrees with the visible text', dateAttr('2025-03-14T23:30:00.000Z'), '2025-03-14')

// Stega-marked datetimes came back from the preview build and printed the
// literal words "Invalid Date" onto the page.
eq('a stega-marked datetime still parses', formatDate(`2025-03-14T23:30:00.000Z${MARK}`), '14 March 2025')

// Null rather than "Invalid Date", so the template can omit the whole element.
eq('an unparseable date yields null, not the words "Invalid Date"', formatDate('not a date'), null)
eq('a missing date yields null', formatDate(undefined), null)
eq('an empty date yields null', formatDate(''), null)
eq('a non-string date yields null', formatDate(12345), null)
eq('dateAttr agrees about unparseable input', dateAttr('not a date'), null)

// --- the strippers themselves ------------------------------------------------
const {stripStega, stripStegaKey} = stega

eq('the prose stripper removes a marker run', stripStega(`Brand Identity${MARK}`), 'Brand Identity')

/*
  The one real difference between the two strippers, and the reason there are
  two. U+200D joins an emoji family; the prose stripper has to leave a lone one
  alone or it breaks the emoji, while the key stripper has to remove even one
  because a single stray character already fails a lookup.
*/
eq('the prose stripper leaves a lone joiner alone', stripStega('a‍b'), 'a‍b')
eq('the key stripper removes even a single character', stripStegaKey('Brand Identity​'), 'Brand Identity')
eq('the key stripper returns a string for non-strings', stripStegaKey(undefined), '')
eq('the prose stripper returns undefined for non-strings', stripStega(undefined), undefined)
eq('the prose stripper returns undefined for whitespace', stripStega('   '), undefined)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
