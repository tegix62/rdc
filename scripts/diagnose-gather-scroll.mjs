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

  FIRST RUN DISPROVED THAT STORY, SO READ THE SECOND SHAPE OF IT

  At 390x844, tapping whichever tile sat nearest the top of the screen,
  every set landed whole: 9/9, 6/6, 18/18 visible, nothing below the
  fold, and the page moved UP each time rather than down. The structural
  account above is not what Chris is hitting.

  Two things about that run do not match a phone in a hand:

    - 844px is the viewport of an iPhone with no browser chrome. Safari
      spends roughly 200px on a URL bar and a toolbar, so the window is
      closer to 650. A set 477px tall fits in 844 and does not fit in
      650 once anything is above it.
    - it tapped the topmost tile on screen every time. A person taps
      what they are looking at, which after scrolling is as often the
      bottom of the screen as the top - and a set runs downward from the
      tile you tapped.

  So the run now sweeps where on the screen the tap lands, at a height a
  phone actually has. Both are measured rather than argued, because the
  first version of this argued and was wrong.

  READ-ONLY. It changes nothing; it reports.

  Usage: node scripts/diagnose-gather-scroll.mjs [base-url] [width] [height]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const WIDTH = Number(process.argv[3] ?? 390)
/*
  664, not 844. Safari's URL bar and toolbar are not optional furniture -
  they are on screen for the whole first visit, which is the visit this
  whole page is designed for.
*/
const HEIGHT = Number(process.argv[4] ?? 664)

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

const probe = async (skip, band) =>
  page.evaluate(
    ({skipHrefs, band}) => {
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
      const vh = window.innerHeight
      const candidates = tiles.filter((el) => {
        const h = hrefOf(el)
        if (!h || skipHrefs.includes(h) || (sizes.get(h) ?? 0) < 4) return false
        const r = el.getBoundingClientRect()
        return r.top > 60 && r.top < vh - 60
      })
      if (!candidates.length) return null
      /*
        Where on the SCREEN the tap lands is the variable under test, so
        it is chosen rather than taken from whatever DOM order offers.
        'high' is what the first run did by accident.
      */
      const sorted = candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      const pick = band === 'low' ? sorted[sorted.length - 1] : sorted[0]
      const href = hrefOf(pick)
      return {
        href,
        familySize: sizes.get(href),
        tileTop: Math.round(pick.getBoundingClientRect().top),
        scrollY: Math.round(window.scrollY),
      }
    },
    {skipHrefs: skip, band},
  )

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

const tap = async (href, band) => {
  await page.evaluate(
    ({h, band}) => {
      const grid = document.querySelector('#pf-grid')
      const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
      const vh = window.innerHeight
      const on = Array.from(grid.querySelectorAll('.pf-item'))
        .filter((t) => {
          if (hrefOf(t) !== h) return false
          const r = t.getBoundingClientRect()
          return r.top > 60 && r.top < vh - 60
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      const el = band === 'low' ? on[on.length - 1] : on[0]
      // From the image, because the grid's click handler ignores taps on links.
      el?.querySelector('img')?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    },
    {h: href, band},
  )
  // Past the 1600ms cap on the anchor's hold loop.
  await page.waitForTimeout(2200)
}

console.log(`${BASE}/portfolio at ${WIDTH}x${HEIGHT}\n`)

const runBand = async (band) => {
  console.log(`== tapping ${band} on the screen ==\n`)
  /*
    Back to the same starting point for each band, a little way into the
    grid rather than pinned at the top - tapping the first tile of a
    freshly loaded page is the one case where "the set runs downward from
    here" is harmless, and measuring only that is how the first run
    missed the complaint.
  */
  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForTimeout(500)

  const rounds = []
  const used = []
  for (let i = 0; i < 3; i++) {
    const before = await probe(used, band)
    if (!before) {
      console.log(`  round ${i + 1}: no reachable tile in an unused project - stopping\n`)
      break
    }
    used.push(before.href)
    await tap(before.href, band)
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
  return rounds
}

const all = {}
for (const band of ['high', 'low']) all[band] = await runBand(band)

await browser.close()

const rounds = [...all.high, ...all.low]
if (!rounds.length) {
  console.log('  nothing was measured')
  process.exit(1)
}

/*
  The verdict, in the two terms Chris's complaint is actually in.
*/
for (const band of ['high', 'low']) {
  const rs = all[band]
  if (!rs.length) continue
  const seen = rs.map((r) => `${r.after.visible}/${r.after.total}`)
  const below = rs.map((r) => r.after.belowFold)
  const scrolls = rs.map((r) => r.after.scrollY)
  console.log(`  tapping ${band}:`)
  console.log(`    pieces visible:  ${seen.join(', ')}`)
  console.log(`    below the fold:  ${below.join('px, ')}px`)
  console.log(`    page ended at:   ${scrolls.join(' -> ')}`)
}

const worst = Math.min(...rounds.map((r) => r.after.visible / r.after.total))
const mostHidden = Math.max(...rounds.map((r) => r.after.belowFold))
console.log(
  worst < 1
    ? `\n  Worst case: ${Math.round(worst * 100)}% of a set shown, ${mostHidden}px of it below the fold.`
    : `\n  Every gather in both bands showed its whole set.`,
)
