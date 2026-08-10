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
eq('a post with only a title still gets one', blogPostDescription({title: 'On Hand Lettering'}), 'On Hand Lettering — notes from Rumeau Design Co.')
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
