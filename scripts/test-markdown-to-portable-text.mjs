/*
  Tests for the markdown -> Portable Text converter, and for the real policy.

  The load-bearing case is the last group: it converts the ACTUAL
  content/privacy-policy.md and checks nothing went missing. A converter that
  passes on toy fixtures and silently drops a paragraph of the live document
  would be worse than no converter, because the failure is invisible - the page
  renders, it just says less than it should.

  Usage: node scripts/test-markdown-to-portable-text.mjs
*/
import {readFileSync} from 'node:fs'
import {markdownToPortableText} from './lib/markdown-to-portable-text.mjs'

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures++
    console.log(`FAIL  ${name}`)
    console.log(`        expected  ${JSON.stringify(expected)}`)
    console.log(`        got       ${JSON.stringify(actual)}`)
  } else {
    console.log(`ok    ${name}`)
  }
}
const throws = (name, fn, match) => {
  try {
    fn()
    failures++
    console.log(`FAIL  ${name} - expected a throw, got none`)
  } catch (err) {
    const ok = String(err.message).includes(match)
    if (!ok) {
      failures++
      console.log(`FAIL  ${name}`)
      console.log(`        message did not contain ${JSON.stringify(match)}`)
      console.log(`        got  ${err.message}`)
    } else {
      console.log(`ok    ${name}`)
    }
  }
}

const text = (b) => b.children.map((c) => c.text).join('')

// --- structure -------------------------------------------------------------
check(
  'a paragraph becomes one normal block',
  markdownToPortableText('Hello there.').map((b) => [b.style, text(b)]),
  [['normal', 'Hello there.']],
)

check(
  'wrapped lines join into one paragraph',
  markdownToPortableText('One two\nthree four.').map((b) => text(b)),
  ['One two three four.'],
)

check(
  'a blank line starts a new paragraph',
  markdownToPortableText('First.\n\nSecond.').map((b) => text(b)),
  ['First.', 'Second.'],
)

check(
  'headings map to h2 and h3',
  markdownToPortableText('## Two\n\n### Three').map((b) => [b.style, text(b)]),
  [
    ['h2', 'Two'],
    ['h3', 'Three'],
  ],
)

// The double-h1 bug, already fixed once on /style-guide. The template renders
// the page's own h1, so the body must not carry one.
check(
  'the leading h1 is dropped, because the template renders it',
  markdownToPortableText('# Privacy Policy\n\nBody text.').map((b) => [b.style, text(b)]),
  [['normal', 'Body text.']],
)
check(
  'a later h1 is kept, since it is not the title',
  markdownToPortableText('# Title\n\n# Another').map((b) => [b.style, text(b)]),
  [['h1', 'Another']],
)

check(
  'bullets become list items',
  markdownToPortableText('- one\n- two').map((b) => [b.listItem, text(b)]),
  [
    ['bullet', 'one'],
    ['bullet', 'two'],
  ],
)

check(
  'a wrapped bullet stays one list item',
  markdownToPortableText('- one that runs\n  onto the next line').map((b) => [b.listItem, text(b)]),
  [['bullet', 'one that runs onto the next line']],
)

// --- inline marks ----------------------------------------------------------
const marks = (md) => {
  const [b] = markdownToPortableText(md)
  return b.children.map((c) => [c.text, c.marks.length ? (c.marks[0].startsWith('k') ? 'link' : c.marks[0]) : ''])
}

check('bold', marks('a **b** c'), [
  ['a ', ''],
  ['b', 'strong'],
  [' c', ''],
])
check('inline code', marks('a `b` c'), [
  ['a ', ''],
  ['b', 'code'],
  [' c', ''],
])
check('a link becomes an annotated span', marks('see [here](https://x.com) now'), [
  ['see ', ''],
  ['here', 'link'],
  [' now', ''],
])

check(
  'the link href lands in markDefs',
  markdownToPortableText('[a](https://x.com)')[0].markDefs.map((d) => [d._type, d.href]),
  [['link', 'https://x.com']],
)

check(
  'an asterisk in prose is not bold',
  marks('2 * 3 is 6'),
  [['2 * 3 is 6', '']],
)

// --- every block and span needs a _key -------------------------------------
{
  const blocks = markdownToPortableText('## H\n\n- a **b** [c](https://d.e)\n\nText.')
  const missing = []
  for (const b of blocks) {
    if (!b._key) missing.push('block')
    for (const c of b.children) if (!c._key) missing.push('span')
    for (const d of b.markDefs) if (!d._key) missing.push('markDef')
  }
  check('every block, span and markDef has a _key', missing, [])

  const keys = blocks.flatMap((b) => [b._key, ...b.children.map((c) => c._key)])
  check('keys are unique', keys.length - new Set(keys).size, 0)
}

// --- what must fail loudly rather than vanish ------------------------------
throws('a table throws and says why', () => markdownToPortableText('| a | b |'), 'tables cannot be represented')
throws('a blockquote throws', () => markdownToPortableText('> quoted'), 'unsupported markdown')
throws('a numbered list throws', () => markdownToPortableText('1. first'), 'unsupported markdown')
throws('an image throws', () => markdownToPortableText('![alt](x.png)'), 'unsupported markdown')

// --- the real document -----------------------------------------------------
/*
  Nothing above proves the policy survives the trip. This does: convert the
  file that will actually be loaded, and account for its content.
*/
const md = readFileSync(new URL('../content/privacy-policy.md', import.meta.url), 'utf8')
const blocks = markdownToPortableText(md)

check('the real policy converts without throwing', blocks.length > 0, true)

// Every heading in the file is present in the output, in order.
const mdHeadings = md
  .split('\n')
  .map((l) => /^(#{2,6})\s+(.*)$/.exec(l))
  .filter(Boolean)
  .map((m) => m[2])
const outHeadings = blocks.filter((b) => /^h[1-6]$/.test(b.style)).map(text)
check('every heading survives, in order', outHeadings, mdHeadings)

// The specific facts that must not go missing. If a future edit to the policy
// removes one of these, that should be a decision, not an accident.
const all = blocks.map(text).join('\n')
for (const phrase of [
  'chris@rumeaudesign.co',
  '_fbp',
  'rdc-ink',
  'two years',
  'We do not sell your personal information',
  'Cloudflare',
  'Tally',
]) {
  check(`the output still contains ${JSON.stringify(phrase)}`, all.includes(phrase), true)
}

// No block may be empty: an empty block renders as a blank gap on the page.
check('no empty blocks', blocks.filter((b) => text(b).trim() === '').length, 0)

/*
  Exact counts, not a word-count ratio.

  This started as "the output keeps at least 85% of the words", which sounds
  like a truncation guard and is not one: I checked, and dropping EVERY bullet
  in the policy still leaves 912 words against a threshold of 874, so it passes
  while a third of the document goes missing. A guard that survives the failure
  it exists to catch is worse than none, because it reads as coverage.

  Counting the bullets cannot be fooled that way, and checking each one's text
  is present catches a bullet that converts to an empty block.
*/
const mdBullets = md.split('\n').filter((l) => /^[-*]\s+\S/.test(l))
const outBullets = blocks.filter((b) => b.listItem === 'bullet')
check(`every bullet survives (${mdBullets.length} of them)`, outBullets.length, mdBullets.length)

const droppedBullets = mdBullets
  .map((l) => l.replace(/^[-*]\s+/, '').replace(/[*`[\]]/g, '').trim().slice(0, 30))
  .filter((snippet) => !all.replace(/[*`[\]]/g, '').includes(snippet))
check('no bullet lost its text', droppedBullets, [])

// Same idea for prose: every paragraph-starting line must appear in the output.
const droppedProse = md
  .split('\n')
  .filter((l) => l.trim() && !/^[-*#\s]/.test(l))
  .map((l) => l.replace(/[*`[\]]/g, '').trim().slice(0, 30))
  .filter((snippet) => !all.replace(/[*`[\]]/g, '').includes(snippet))
check('no paragraph lost its opening line', droppedProse, [])

console.log()
if (failures) {
  console.error(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All converter checks pass.')
