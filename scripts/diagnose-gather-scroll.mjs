/*
  Where the gathered set lands on a phone, and where it leaves you.

  WHY THIS EXISTS

  Chris: "the gathering on mobile will persistently gather at a certain
  point on the screen where you kind of have to scroll down a bit, and
  then if you click on something else on that gather, it'll do the same
  thing... so it kind of feels like a perpetual scrolling down."

  The scroll anchor is built to hold the CLICKED TILE still, and by that
  measure it works - there is a convergent loop and a test for it. But
  holding one tile still says nothing about where the other seventeen
  went. The family is inserted immediately after the clicked tile, so the
  set runs DOWNWARD from wherever that tile happened to be; tap something
  halfway down the screen and most of its project is below the fold by
  construction.

  So this measures the set, not the tile: how far down the viewport it
  starts, how much of it you can see without moving, and whether three
  taps in a row march the page downwards.

  READ-ONLY. It changes nothing; it reports.

  Usage: node scripts/diagnose-gather-scroll.mjs [base-url] [viewport-width]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const WIDTH = Number(process.argv[3] ?? 390)
const HEIGHT = 844

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: {width: WIDTH, height: HEIGHT},
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  reducedMotion: 'no-preference',
})

await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
// Let the once-per-session demo finish, so its threads are not mistaken for
// the state under test and its own dropPreview does not land mid-measure.
await page.waitForTimeout(4000)

/*
  Start where a visitor would be: a little way into the grid, not pinned
  at the top. Tapping the first tile on a freshly loaded page is the one
  case where "the set runs downward from here" happens to be fine, and
  testing only that would miss the complaint entirely.
*/
await page.evaluate(() => window.scrollTo(0, 900))
await page.waitForTimeout(400)

const probe = async (skip) =>
  page.evaluate((skipHrefs) => {
    const grid = document.querySelector('#pf-grid')
    const tiles = Array.from(grid.querySelectorAll('.pf-item'))
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const sizes = new Map()
    for (const el of tiles) {
      const h = hrefOf(el)
      if (h) sizes.set(h, (sizes.get(h) ?? 0) + 1)
    }
    /*
      A tile the thumb could actually reach: on screen, in a project big
      enough to gather, and not one already used in this run.
    */
    const pick = tiles.find((el) => {
      const h = hrefOf(el)
      if (!h || skipHrefs.includes(h) || (sizes.get(h) ?? 0) < 4) return false
      const r = el.getBoundingClientRect()
      return r.top > 80 && r.top < window.innerHeight - 80
    })
    if (!pick) return null
    const href = hrefOf(pick)
    return {
      href,
      familySize: sizes.get(href),
      tileTop: Math.round(pick.getBoundingClientRect().top),
      scrollY: Math.round(window.scrollY),
    }
  }, skip)

const measure = async (href) =>
  page.evaluate((h) => {
    const grid = document.querySelector('#pf-grid')
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const fam = Array.from(grid.querySelectorAll('.pf-item')).filter((el) => hrefOf(el) === h)
    const rects = fam.map((el) => el.getBoundingClientRect())
    const chrome = document.querySelector('.pf-controls')?.getBoundingClientRect().bottom ?? 0
    const vh = window.innerHeight
    /*
      "Visible" means a person can see enough of the piece to read it as
      part of a set - half its height, clear of the toolbar. A one-pixel
      sliver at the bottom edge is not a piece you have been shown.
    */
    const visible = rects.filter((r) => {
      const top = Math.max(r.top, Math.max(chrome, 0))
      const bottom = Math.min(r.bottom, vh)
      return bottom - top > r.height / 2
    }).length
    const setTop = Math.round(Math.min(...rects.map((r) => r.top)))
    const setBottom = Math.round(Math.max(...rects.map((r) => r.bottom)))
    const clicked = grid.querySelector('.pf-item.is-expanded')
    return {
      scrollY: Math.round(window.scrollY),
      clickedTop: clicked ? Math.round(clicked.getBoundingClientRect().top) : null,
      setTop,
      setBottom,
      visible,
      total: fam.length,
      belowFold: Math.max(0, setBottom - vh),
      chromeBottom: Math.round(chrome),
      viewport: vh,
    }
  }, href)

const tap = async (href) => {
  await page.evaluate((h) => {
    const grid = document.querySelector('#pf-grid')
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const tiles = Array.from(grid.querySelectorAll('.pf-item'))
    const el = tiles.find((t) => {
      if (hrefOf(t) !== h) return false
      const r = t.getBoundingClientRect()
      return r.top > 80 && r.top < window.innerHeight - 80
    })
    // From the image, because the grid's click handler ignores taps on links.
    el?.querySelector('img')?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
  }, href)
  // Past the 1600ms cap on the anchor's hold loop.
  await page.waitForTimeout(2200)
}

console.log(`${BASE}/portfolio at ${WIDTH}x${HEIGHT} - three gathers in a row\n`)

const rounds = []
const used = []
for (let i = 0; i < 3; i++) {
  const before = await probe(used)
  if (!before) {
    console.log(`  round ${i + 1}: no reachable tile in an unused project - stopping`)
    break
  }
  used.push(before.href)
  await tap(before.href)
  const after = await measure(before.href)
  rounds.push({before, after})

  console.log(`  round ${i + 1}: ${before.familySize} pieces`)
  console.log(`    tapped a tile ${before.tileTop}px down the screen, page at y=${before.scrollY}`)
  console.log(
    `    after: page at y=${after.scrollY} (moved ${after.scrollY - before.scrollY}px), ` +
      `tapped tile now ${after.clickedTop}px down`,
  )
  console.log(
    `    the set spans ${after.setTop}..${after.setBottom} in a ${after.viewport}px window; ` +
      `${after.belowFold}px of it is below the fold`,
  )
  console.log(`    you can see ${after.visible} of ${after.total} pieces without moving\n`)
}

await browser.close()

if (!rounds.length) {
  console.log('  nothing was measured')
  process.exit(1)
}

/*
  The verdict, in the two terms Chris's complaint is actually in.
*/
const seen = rounds.map((r) => `${r.after.visible}/${r.after.total}`)
const fractions = rounds.map((r) => r.after.visible / r.after.total)
const worst = Math.min(...fractions)
const scrolls = rounds.map((r) => r.after.scrollY)

console.log(`  pieces visible per gather: ${seen.join(', ')}`)
console.log(`  page position after each:  ${scrolls.join(' -> ')}`)

const marching = scrolls.every((y, i) => i === 0 || y >= scrolls[i - 1])
console.log(
  marching && scrolls[scrolls.length - 1] > scrolls[0]
    ? `  Each gather left the page further down than the last - ${scrolls[0]} to ${scrolls[scrolls.length - 1]}.`
    : `  The page did not march downwards.`,
)
console.log(
  worst < 0.5
    ? `  At worst you were shown ${Math.round(worst * 100)}% of a set you asked to see.`
    : `  Every gather showed at least ${Math.round(worst * 100)}% of its set.`,
)
