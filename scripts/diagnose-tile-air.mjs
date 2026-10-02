/*
  Does the logomark inset actually reach the tiles that asked for it?

  WHY THIS EXISTS

  Three documents had Tile Layout set to "Logomark" by hand, so three tiles
  should have gained air on the Portfolio grid. Chris can see it on exactly
  one of them - Two Point Oh - and not on Adelante Barbell Club Wordmark or
  Hug a Mug.

  That is the kind of report that invites a guess, and a guess here has three
  plausible candidates that look identical from a browser:

    1. the CLASS is missing on those two, so the data never reached the markup
    2. the class is there and the CSS is not applying (specificity, or a rule
       further down the sheet resetting padding)
    3. both are correct and the effect is simply hard to SEE, because a
       wordmark that already carries whitespace of its own gains little from
       another 10%, while a square mark that fills its frame gains a lot

  Those need different fixes, and only the third means nothing is wrong. So
  this measures rather than reasons: for every tile on the page it reports the
  classes, the padding the browser actually computed, and - the number that
  settles case 3 - how much of the tile's box the artwork ends up occupying.

  Measured in real Chromium against the built page, because "the CSS looks
  right" has been wrong twice on this grid already.

  Usage: node scripts/diagnose-tile-air.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const URL = `${BASE}/portfolio`

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})

const problems = []

await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60_000})
// Isotope hides the grid while it lays out and a timeout reveals it either
// way, so wait for the tiles to be visible rather than for the network.
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(2500)

const build = await page.getAttribute('meta[name="build-commit"]', 'content').catch(() => null)

const tiles = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
    const img = el.querySelector('img')
    if (!img) {
      out.push({alt: '(no img)', classes: el.className, padding: null})
      continue
    }
    const cs = getComputedStyle(img)
    const box = img.getBoundingClientRect()
    /*
      The share of the tile the artwork actually covers. Padding is a
      percentage of WIDTH on all four sides, so the horizontal and vertical
      losses differ on a non-square tile and one number per axis is the only
      honest way to report it.
    */
    const padL = parseFloat(cs.paddingLeft) || 0
    const padT = parseFloat(cs.paddingTop) || 0
    out.push({
      alt: img.getAttribute('alt') ?? '',
      classes: el.className,
      air: el.classList.contains('pf-item--air'),
      mark: el.classList.contains('pf-item--mark'),
      padding: cs.padding,
      padL: Math.round(padL),
      padT: Math.round(padT),
      boxW: Math.round(box.width),
      boxH: Math.round(box.height),
      natW: img.naturalWidth,
      natH: img.naturalHeight,
      // What fraction of the tile's width the artwork spans.
      coverW: box.width ? Math.round(((box.width - padL * 2) / box.width) * 100) : 0,
    })
  }
  return out
})

console.log(`${URL}`)
console.log(`  build-commit  ${build ?? '(none stated)'}`)
console.log(`  tiles         ${tiles.length}`)

const air = tiles.filter((t) => t.air)
const marks = tiles.filter((t) => t.mark)
console.log(`  .pf-item--mark  ${marks.length}  (inferred or explicit; ink mode only)`)
console.log(`  .pf-item--air   ${air.length}  (explicit only; should be inset HERE)`)

if (!air.length) {
  problems.push('No tile carries .pf-item--air, so no explicit Logomark reached the markup.')
}

console.log('\n  Tiles carrying .pf-item--air:')
for (const t of air) {
  const ok = t.padL > 0 ? 'inset' : 'NO PADDING APPLIED'
  console.log(`    ${ok}  ${t.alt}`)
  console.log(
    `      padding ${t.padding}  (${t.padL}px sides, ${t.padT}px top)   ` +
      `tile ${t.boxW}x${t.boxH}   source ${t.natW}x${t.natH}`,
  )
  console.log(`      artwork spans ${t.coverW}% of the tile's width`)
  if (t.padL === 0) problems.push(`${t.alt}: has .pf-item--air but the browser computed no padding.`)
}

/*
  The ratio is the thing that decides whether 10% READS as air. A square mark
  loses 10% off each side of both axes; a 3:1 wordmark loses the same pixels
  sideways but, because the tile is short, those same pixels are a far larger
  share of its height - so the two look nothing alike at one setting.
*/
if (air.length) {
  console.log('\n  How much the inset changes each one, by shape:')
  for (const t of air) {
    const ratio = t.natH ? t.natW / t.natH : 0
    const shape = ratio > 1.8 ? 'wide wordmark' : ratio < 0.8 ? 'portrait' : 'square-ish'
    const vShare = t.boxH ? Math.round((t.padT / t.boxH) * 100) : 0
    console.log(
      `    ${t.alt}\n      ${ratio.toFixed(2)}:1 ${shape} - the inset is ${vShare}% of the tile's HEIGHT`,
    )
  }
}

console.log('\n  Every tile whose Tile Layout reached the page as a mark:')
for (const t of marks) {
  console.log(`    ${t.air ? 'explicit' : 'inferred'}  ${t.alt}`)
}

await browser.close()

if (problems.length) {
  console.log('\nProblems:')
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log('\nEvery explicit Logomark reached the page and is inset.')
