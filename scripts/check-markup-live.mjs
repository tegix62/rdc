/*
  Print the markup a live page actually serves for a CSS selector.

  For the moments the question is "what did the page render", not "what is
  in the dataset" - which is the gap between the two that every recent bug
  here has lived in. Pages are fetched exactly as served (no browser), and
  each match is printed with its inner HTML, so an escaped tag, an empty
  element or a missing link is visible as text.

  READ-ONLY.

  Usage: node scripts/check-markup-live.mjs <base-url> <path,path> <selector-class> [only-if-containing]
         e.g. ... https://rumeaudesign.co /work/two-point-oh figcaption
*/
const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PATHS = (process.argv[3] ?? '/work/two-point-oh,/video').split(',')
const TAG = process.argv[4] ?? 'figcaption'

let found = 0
for (const p of PATHS) {
  const html = await fetch(`${BASE}${p}`).then((r) => r.text())
  // A tag name, or a class: <figcaption ...>...</figcaption>, or class="x".
  const re = /^[a-z][a-z0-9-]*$/.test(TAG)
    ? new RegExp(`<${TAG}\\b[^>]*>([\\s\\S]*?)</${TAG}>`, 'gi')
    : new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${TAG}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'gi')
  // An optional 4th argument keeps only the matches containing it - for a
  // tag like <script>, where the page has many and one of them is wanted.
  const ONLY = process.argv[5] ?? ''
  const hits = [...html.matchAll(re)]
    .map((m) => (m.length > 2 ? m[2] : m[1]))
    .filter((h) => !ONLY || h.includes(ONLY))
  console.log(`${p} - ${hits.length} <${TAG}>`)
  // The preview build carries Sanity's click-to-edit markers: long runs of
  // zero-width characters after every CMS string. Invisible on the page,
  // a wall of noise in a log - so they are dropped here, and only here.
  const unmark = (s) => s.replace(/[\u200B-\u200D\u2060\uFEFF]+/g, '')
  for (const h of hits) console.log(`    ${unmark(h).replace(/\s+/g, ' ').trim()}`)
  found += hits.length
  console.log('')
}
if (!found) {
  console.log('Nothing matched on any page.')
  process.exit(1)
}
