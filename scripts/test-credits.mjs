/*
  The one rich Credits field: what it renders, and what is read back out of it.

  The panel beside a project title became free text Chris links himself. Two
  things depended on it being structured, and neither is visible on the page:

    - the collaborators go into the structured data as `contributor` Person
      nodes, which is half the reason the credits exist
    - Principal Type feeds the derived meta description

  So the lines are parsed back - bold is the role, a link is a person - and
  this asserts that parse, the rendering, and that a page not yet moved to
  the new field still answers from the old ones.

  Usage: node scripts/test-credits.mjs
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
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  check(name, a === e, a === e ? a : `got ${a}, wanted ${e}`)
}

const outdir = path.join(root, 'node_modules', '.cache', 'credits-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'credits.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/credits.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  logLevel: 'error',
})
const {parseCreditLines, contributorsOf, principalTypeOf, creditsHtml, hasCreditsText} = await import(outfile)

let k = 0
const id = () => `k${k++}`
const span = (text, marks = []) => ({_type: 'span', _key: id(), text, marks})
const line = (children, markDefs = []) => ({_type: 'block', _key: id(), style: 'normal', markDefs, children})
const link = (key, href) => ({_type: 'link', _key: key, href})
const gap = () => line([span('')])

// The Two Point Oh panel from Chris's screenshot, typed the way he would.
const panel = [
  line([span('Producer', ['strong']), span(' - Henry Heissenbuttel')]),
  line([span('Audio Engineer', ['strong']), span(' - '), span('Adam Cichocki', ['a'])], [link('a', 'https://adam.example')]),
  line([span('Single Artwork', ['strong']), span(' – '), span('Frank Maddocks', ['f'])], [link('f', 'https://frank.example')]),
  gap(),
  line([span('Principal Type', ['strong']), span(' - '), span('Forevs by OhNo Type Co', ['t'])], [link('t', 'https://ohno.example')]),
]

// --- the parse ------------------------------------------------------------
eq('every line becomes a credit', parseCreditLines(panel), [
  {role: 'Producer', name: 'Henry Heissenbuttel'},
  {role: 'Audio Engineer', name: 'Adam Cichocki', url: 'https://adam.example'},
  {role: 'Single Artwork', name: 'Frank Maddocks', url: 'https://frank.example'},
  {role: 'Principal Type', name: 'Forevs by OhNo Type Co', url: 'https://ohno.example'},
])
eq(
  'the typeface line is NOT a contributor',
  contributorsOf({creditsText: panel}).map((c) => c.name),
  ['Henry Heissenbuttel', 'Adam Cichocki', 'Frank Maddocks'],
)
eq('Principal Type is read out for the meta description', principalTypeOf({creditsText: panel}), 'Forevs by OhNo Type Co')

eq(
  'two linked names on one line are two people with the same role',
  parseCreditLines([
    line([span('Photography', ['strong']), span(' - '), span('Luke', ['l']), span(' and '), span('Cole', ['c'])], [
      link('l', 'https://luke.example'),
      link('c', 'https://cole.example'),
    ]),
  ]),
  [
    {role: 'Photography', name: 'Luke', url: 'https://luke.example'},
    {role: 'Photography', name: 'Cole', url: 'https://cole.example'},
  ],
)
eq(
  'a colon works as well as a dash',
  parseCreditLines([line([span('Producer:', ['strong']), span(' Henry')])]),
  [{role: 'Producer', name: 'Henry'}],
)
eq(
  'a line with no bold is a name with no role',
  parseCreditLines([line([span('Thanks to Sam')])]),
  [{name: 'Thanks to Sam'}],
)
eq('a role with no name credits nobody', parseCreditLines([line([span('Producer', ['strong'])])]), [])
eq('a gap line credits nobody', parseCreditLines([gap()]), [])

// --- before the move: the old fields still answer --------------------------
const legacy = {
  credits: [
    {name: 'Henry', role: 'Producer'},
    {name: 'Adam', role: 'Audio Engineer', url: 'https://adam.example'},
    {role: 'Nobody'},
  ],
  principalType: 'Caslon',
}
eq('without the new field, contributors come from the old list', contributorsOf(legacy).map((c) => c.name), ['Henry', 'Adam'])
eq('and Principal Type from the old string', principalTypeOf(legacy), 'Caslon')
eq('the old fields have no rich text', hasCreditsText(legacy), false)

// --- a cleared rich field must not hide the fallback ----------------------
eq('an empty array is not credits', hasCreditsText({creditsText: []}), false)
eq('one empty block is not credits', hasCreditsText({creditsText: [gap()]}), false)
eq('so a cleared field falls back to the old list', contributorsOf({...legacy, creditsText: [gap()]}).length, 2)

// --- the rendering ----------------------------------------------------------
const html = creditsHtml(panel)
check('a bold role renders bold', html.includes('<strong>Producer</strong>'))
check(
  'a linked name renders as an external link',
  html.includes('<a href="https://adam.example" target="_blank" rel="noopener noreferrer">Adam Cichocki</a>'),
)
eq('the empty line becomes exactly one gap', (html.match(/credits__gap/g) ?? []).length, 1)
eq('five lines, five paragraphs', (html.match(/<p\b/g) ?? []).length, 5)
eq(
  'gaps at the start and end are trimmed, not drawn',
  (creditsHtml([gap(), line([span('Producer', ['strong'])]), gap()]).match(/credits__gap/g) ?? []).length,
  0,
)
eq('nothing renders for an empty field', creditsHtml([gap()]), '')
check(
  'a javascript: link loses its anchor here too',
  !/<a /.test(creditsHtml([line([span('x', ['j'])], [link('j', 'javascript:alert(1)')])])),
)

// --- the preview's editing markers ------------------------------------------
/*
  Found on the preview, not imagined: Sanity appends a run of zero-width
  characters to every CMS string there, including an empty one. The blank
  line between groups therefore arrived as invisible characters, the gap
  rendered as a plain empty <p>, and the parse credited a person called
  nothing. Same run of characters test-meta uses.
*/
const MARK = '\u200B\u200B\u200C\u200D'
const markedGap = line([span(MARK)])
const marked = [line([span(`Producer${MARK}`, ['strong']), span(` - Henry${MARK}`)]), markedGap, line([span('Principal Type', ['strong']), span(` - Caslon${MARK}`)])]
eq('a marked blank line still draws the gap', (creditsHtml(marked).match(/credits__gap/g) ?? []).length, 1)
eq('and credits nobody', parseCreditLines([markedGap]), [])
eq('names and roles come out without markers', parseCreditLines(marked), [
  {role: 'Producer', name: 'Henry'},
  {role: 'Principal Type', name: 'Caslon'},
])
eq('a field of only marked blank lines is empty', hasCreditsText({creditsText: [markedGap, markedGap]}), false)

// --- the round trip --------------------------------------------------------
/*
  The migration and the site's parser were written separately, and the SEO
  depends on them agreeing: whatever the migration writes has to parse back
  into the same collaborators and the same typeface the old fields held. So
  the old fields go in one end and come out the other, and must match.
*/
const {toCreditsBlocks} = await import(path.join(root, 'scripts', 'migrate-credits-to-rich-text.mjs'))
const old = {
  credits: [
    {name: 'Henry Heissenbuttel', role: 'Producer'},
    {name: 'Adam Cichocki', role: 'Audio Engineer', url: 'https://adam.example'},
    {name: 'Sam', url: 'https://sam.example'},
  ],
  principalType: 'Forevs by OhNo Type Co',
  principalTypeUrl: 'https://ohno.example',
}
const moved = {creditsText: toCreditsBlocks(old)}
// Key order is not meaning: sorted, so only names, roles and URLs are compared.
const norm = (list) => list.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined).sort()))
eq('round trip: the same collaborators come back', norm(contributorsOf(moved)), norm(contributorsOf(old)))
eq('round trip: the same typeface comes back', principalTypeOf(moved), principalTypeOf(old))
eq('round trip: and the gap is drawn once', (creditsHtml(moved.creditsText).match(/credits__gap/g) ?? []).length, 1)

console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('All credits checks pass.')
