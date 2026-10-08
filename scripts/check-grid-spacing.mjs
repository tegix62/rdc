/*
  Whether the SERVED grid actually alternates projects.

  The unit test proves the algorithm and the build warns when arithmetic
  forces a clump. Neither proves the ordering reached the page - this
  project has twice shipped a rule that was correct and unwired, once for
  the strip scroll indicator and once for the logomark inset class. So the
  tiles are read back out of the HTML in DOM order.

  The project a tile belongs to is read from its jump label, which carries
  the parent project's title, falling back to the tile's own alt text for
  a tile with no parent. That is exactly the relationship the rule is about
  - "a Hug a Mug piece next to a Hug a Mug piece" is about the parent, not
  the file.

  READ-ONLY.

  Usage: node scripts/check-grid-spacing.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'attached', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(2000)

const tiles = await page.evaluate(() => {
  const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '').trim()
  // DOM order, which is the order the build dealt - not visual order, which
  // masonry decides from heights.
  return [...document.querySelectorAll('.pf-grid .pf-item')].map((el) => ({
    project: strip(el.querySelector('.pf-item__jump-label')?.textContent) || null,
    alt: strip(el.querySelector('img')?.getAttribute('alt')) || '(no alt)',
    isCaseStudy: !!el.querySelector('.pf-item__jump') && false,
  }))
})

await browser.close()

if (!tiles.length) {
  console.log('no tiles found')
  process.exit(1)
}

// A tile with no jump label has no parent project, and is related to nothing.
const keyOf = (t, i) => t.project ?? `solo:${i}:${t.alt}`

const keys = tiles.map(keyOf)
const clashes = []
for (let i = 1; i < keys.length; i++) {
  if (keys[i] === keys[i - 1]) clashes.push({at: i, project: keys[i]})
}

console.log(`${BASE}/portfolio`)
console.log(`  ${tiles.length} tiles in DOM order`)

const counts = {}
for (const t of tiles) if (t.project) counts[t.project] = (counts[t.project] ?? 0) + 1
const bySize = Object.entries(counts).sort((a, b) => b[1] - a[1])
console.log(`\n  tiles per project:`)
for (const [p, n] of bySize) console.log(`    ${String(n).padStart(3)}  ${p}`)
const parented = bySize.reduce((n, [, c]) => n + c, 0)
console.log(`    ${String(tiles.length - parented).padStart(3)}  (no parent project)`)

/*
  The arithmetic that decides whether zero is even possible: a project can
  always be separated as long as it holds no more than half the tiles, give
  or take one.
*/
if (bySize.length) {
  const [biggest, n] = bySize[0]
  const ceiling = Math.ceil(tiles.length / 2)
  console.log(
    `\n  largest project is ${biggest} with ${n} of ${tiles.length} tiles` +
      ` (separable up to ${ceiling})`,
  )
}

console.log(`\n  adjacent same-project pairs: ${clashes.length}`)
for (const c of clashes) console.log(`    position ${c.at}: ${c.project}`)

if (clashes.length) {
  console.log('\nThe served grid puts tiles from one project side by side.')
  process.exit(1)
}
console.log('\nNo tile on the served page sits beside one from the same project.')
