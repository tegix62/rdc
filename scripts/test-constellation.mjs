/*
  Expanding a tile lights its project and drops the rest back.

  WHY THIS EXISTS

  Three behaviours, and the two that do NOTHING are the ones worth testing.
  A reveal that fires everywhere is easy; the design is in where it refuses:

    FIRES     a project with four or more pieces - the lit tiles read as a
              set and the dimming means something
    SUPPRESSED a project with fewer - Chateau Seven is one piece plus its
              case study, and dimming eighty tiles to spotlight two looks
              like a fault rather than a reveal
    SUPPRESSED a standalone piece, which has no project at all

  Opacity is read from the computed style rather than from the class,
  because the question is what a visitor sees. A class can be present and
  styled by nothing, which this project has shipped twice.

  Usage: node scripts/test-constellation.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(2500)

/* What projects exist on the page, and how big each one is. */
const families = await page.evaluate(() => {
  const counts = {}
  for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
    const href = el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const key = href ?? '(standalone)'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
})

console.log(`${BASE}/portfolio\n`)
console.log('  project families:')
for (const [k, n] of Object.entries(families).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(3)}  ${k}`)
}

/*
  Click the nth tile matching a predicate and report what the grid looks
  like afterwards. Returns opacities so the assertions are about pixels
  rather than about class names.
*/
const clickAndRead = (mode) =>
  page.evaluate((mode) => {
    const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const sizes = {}
    for (const el of tiles) {
      const k = hrefOf(el) ?? '(standalone)'
      sizes[k] = (sizes[k] ?? 0) + 1
    }

    let target = null
    if (mode === 'big') target = tiles.find((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
    if (mode === 'small') target = tiles.find((el) => hrefOf(el) && sizes[hrefOf(el)] < 4)
    if (mode === 'solo') target = tiles.find((el) => !hrefOf(el))
    if (!target) return null

    const href = hrefOf(target)
    target.click()
    return new Promise((resolve) =>
      setTimeout(() => {
        const op = (el) => Number(getComputedStyle(el).opacity)
        const same = tiles.filter((el) => hrefOf(el) === href && href !== null)
        const other = tiles.filter((el) => hrefOf(el) !== href || href === null)
        resolve({
          href,
          familySize: href ? sizes[href] : 0,
          focused: document.querySelector('.pf-grid')?.classList.contains('has-focus') ?? false,
          litMin: same.length ? Math.min(...same.map(op)) : null,
          dimMax: other.length ? Math.max(...other.map(op)) : null,
          dimMin: other.length ? Math.min(...other.map(op)) : null,
        })
      }, 500),
    )
  }, mode)

/* ---------- a project big enough to be worth showing ---------- */
const big = await clickAndRead('big')
console.log('')
if (!big) {
  check('a project with four or more pieces exists to test', false)
} else {
  console.log(`  clicked a tile from ${big.href} (${big.familySize} tiles)`)
  check('the grid enters focus', big.focused)
  check('every piece from that project stays lit', big.litMin === 1, `dimmest sibling at ${big.litMin}`)
  check('everything else drops back', (big.dimMax ?? 1) < 0.5, `brightest outsider at ${big.dimMax}`)
}

/*
  THE LINES, AND THE MASK THAT KEEPS THEM OFF THE ARTWORK.

  Preview only, so this is reported rather than required when absent. What
  it asserts is the wiring that has gone wrong in this project before: a
  layer that is present, correct, and attached to nothing. A mask with no
  rects, or lines outside the masked group, both look exactly like a
  working feature in the DOM and put strokes straight across the pictures.
*/
const links = await page.evaluate(() => {
  const svg = document.querySelector('.pf-grid .pf-links')
  if (!svg) return null
  const mask = svg.querySelector('mask')
  const group = svg.querySelector('g[mask]')
  const tiles = document.querySelectorAll('.pf-grid .pf-item').length
  return {
    lines: svg.querySelectorAll('line').length,
    linesInsideMaskedGroup: group ? group.querySelectorAll('line').length : 0,
    maskRects: mask ? mask.querySelectorAll('rect').length : 0,
    tiles,
    firstChild: document.querySelector('.pf-grid')?.firstElementChild?.classList.contains('pf-links') ?? false,
  }
})

console.log('')
if (!links) {
  console.log('  (no line layer - expected on production, where lines are gated off)')
} else {
  console.log(`  line layer: ${links.lines} line(s), mask knocks out ${links.maskRects - 1} of ${links.tiles} pictures`)
  check('every line sits inside the masked group', links.lines > 0 && links.lines === links.linesInsideMaskedGroup)
  check(
    'the mask knocks out every tile, not just the lit ones',
    links.maskRects === links.tiles + 1,
    `${links.maskRects} rects for ${links.tiles} tiles plus the open field`,
  )
  check('the line layer is the first child, so tiles paint over it', links.firstChild)
}

/* Collapse by clicking the same tile again. */
await page.evaluate(() => document.querySelector('.pf-item.is-expanded')?.click())
await page.waitForTimeout(500)
const afterCollapse = await page.evaluate(() => ({
  focused: document.querySelector('.pf-grid')?.classList.contains('has-focus') ?? false,
  dimmest: Math.min(
    ...[...document.querySelectorAll('.pf-grid .pf-item')].map((el) => Number(getComputedStyle(el).opacity)),
  ),
}))
check('collapsing restores the whole grid', !afterCollapse.focused && afterCollapse.dimmest === 1, `dimmest tile at ${afterCollapse.dimmest}`)

/* ---------- too small to bother ---------- */
await page.reload({waitUntil: 'domcontentloaded'})
await page.waitForTimeout(2500)
const small = await clickAndRead('small')
console.log('')
if (!small) {
  console.log('  (no project with fewer than four tiles on the page; nothing to suppress)')
} else {
  console.log(`  clicked a tile from ${small.href} (${small.familySize} tiles)`)
  check(
    'a project too small to read as a set does not dim the grid',
    !small.focused && small.dimMin === 1,
    `focus ${small.focused}, dimmest ${small.dimMin}`,
  )
}

/* ---------- a standalone piece ---------- */
await page.reload({waitUntil: 'domcontentloaded'})
await page.waitForTimeout(2500)
const solo = await clickAndRead('solo')
console.log('')
if (!solo) {
  console.log('  (no standalone tiles on the page)')
} else {
  check(
    'a standalone piece dims nothing',
    !solo.focused && solo.dimMin === 1,
    `focus ${solo.focused}, dimmest ${solo.dimMin}`,
  )
}

await browser.close()
console.log(failures === 0 ? '\nThe constellation fires where it should and nowhere else.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
