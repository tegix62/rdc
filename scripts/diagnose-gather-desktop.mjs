/*
  What a gather costs on a desktop, and how tidy it leaves the grid.

  WHY THIS EXISTS

  Chris: "on desktop, the layout can get a little messy on the
  grouping/gathering. Any chance we can make it snappier?"

  Two questions in one sentence, and they want different numbers.

  SNAPPINESS. Isotope runs at transitionDuration: 0 and there is no CSS
  transition on the expanded tile's width, so the relayout itself is
  instant - nothing to speed up there. What is not instant is the scroll
  anchor: a convergent loop that reads getBoundingClientRect every frame
  for a minimum of 600ms and up to 1600. That floor was added for a real
  failure (the loop exiting while the tile had not begun moving), but if
  the layout now settles in two frames it is 600ms of forced synchronous
  layout over 82 tiles with nothing left to correct - which is exactly
  what "not snappy" feels like. So: sample every frame and find when the
  layout ACTUALLY stops moving, versus when the loop lets go.

  MESSINESS. A gathered set that reads as a block is tidy; one shot
  through with other people's work is not. Masonry places each item in
  the shortest column, so ten items that are contiguous in the DOM need
  not be contiguous on screen. Counted as: how many tiles that are NOT
  in the set have their centre inside the set's bounding box, and how
  much of that box is neither the set nor anything else.

  READ-ONLY.

  Usage: node scripts/diagnose-gather-desktop.mjs [base-url] [width] [height]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const WIDTH = Number(process.argv[3] ?? 1440)
const HEIGHT = Number(process.argv[4] ?? 900)

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}})

await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(3500)
await page.evaluate(() => window.scrollTo(0, 900))
await page.waitForTimeout(500)

const result = await page.evaluate(async () => {
  const grid = document.querySelector('#pf-grid')
  const tiles = () => Array.from(grid.querySelectorAll('.pf-item'))
  const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null

  const sizes = new Map()
  for (const el of tiles()) {
    const h = hrefOf(el)
    if (h) sizes.set(h, (sizes.get(h) ?? 0) + 1)
  }
  const target = tiles().find((el) => {
    const h = hrefOf(el)
    if (!h || (sizes.get(h) ?? 0) < 8) return false
    const r = el.getBoundingClientRect()
    return r.top > 80 && r.top < window.innerHeight - 120
  })
  if (!target) return null
  const href = hrefOf(target)

  /*
    A fingerprint of the whole arrangement, not one tile. The question is
    when the LAYOUT stops moving, and a single tile can be still for a
    stretch while the rest of the grid is still being placed.
  */
  const fingerprint = () => {
    let s = ''
    for (const el of tiles()) {
      const r = el.getBoundingClientRect()
      s += `${Math.round(r.left)},${Math.round(r.top + window.scrollY)},${Math.round(r.height)};`
    }
    return s
  }

  const t0 = performance.now()
  const frames = []
  let lastPrint = fingerprint()
  let lastY = window.scrollY
  let layoutStillAt = null
  let scrollStillAt = null
  let longest = 0
  let prev = t0

  target.querySelector('img')?.dispatchEvent(new MouseEvent('click', {bubbles: true}))

  await new Promise((done) => {
    const tick = () => {
      const now = performance.now()
      longest = Math.max(longest, now - prev)
      prev = now
      const print = fingerprint()
      const y = window.scrollY
      if (print !== lastPrint) {
        lastPrint = print
        layoutStillAt = null
      } else if (layoutStillAt === null) {
        layoutStillAt = now - t0
      }
      if (Math.abs(y - lastY) > 0.5) {
        lastY = y
        scrollStillAt = null
      } else if (scrollStillAt === null) {
        scrollStillAt = now - t0
      }
      frames.push(Math.round(now - t0))
      if (now - t0 < 2600) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })

  /*
    Tidiness, once everything has stopped.
  */
  const all = tiles()
  const fam = all.filter((el) => hrefOf(el) === href)
  const rects = fam.map((el) => el.getBoundingClientRect())
  const box = {
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map((r) => r.right)),
    top: Math.min(...rects.map((r) => r.top)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  }
  const boxArea = (box.right - box.left) * (box.bottom - box.top)
  const famArea = rects.reduce((a, r) => a + r.width * r.height, 0)

  const intruders = all.filter((el) => {
    if (hrefOf(el) === href) return false
    const r = el.getBoundingClientRect()
    const cx = (r.left + r.right) / 2
    const cy = (r.top + r.bottom) / 2
    return cx > box.left && cx < box.right && cy > box.top && cy < box.bottom
  })
  const intruderArea = intruders.reduce((a, el) => {
    const r = el.getBoundingClientRect()
    return a + r.width * r.height
  }, 0)

  /*
    WHERE THE WHITE IS.

    "81% of the box is the set" says a fifth of it is empty and says
    nothing about where, and Chris is describing gaps he can see rather
    than a percentage. Two different kinds of hole are possible and they
    have different fixes, so they are counted separately:

      - inside the set, under its ragged bottom edge. Masonry packs
        greedily into the shortest column, which leaves a staircase
        when tiles of very different heights arrive in a bad order.
      - above the set, in the band the shelf creates. Levelling every
        column to the tallest is what stops other work intruding, and
        it buys that with whitespace under every column that was
        shorter. That cost is mine, introduced an hour ago, and it is
        not visible in the fill figure at all because it falls outside
        the set's bounding box.

    Measured per column rather than as one average, because a single
    400px hole and forty 10px ones are the same number and not the same
    page.
  */
  const colW = all[0]?.getBoundingClientRect().width || 1
  const gapsByColumn = []
  const nCols = Math.max(1, Math.round(grid.clientWidth / colW))
  const gridTop = grid.getBoundingClientRect().top
  for (let c = 0; c < nCols; c++) {
    const x = c * colW + colW / 2
    const inCol = all
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.left <= x && r.right >= x)
      .sort((a, b) => a.top - b.top)
    let biggest = 0
    let at = 0
    for (let i = 1; i < inCol.length; i++) {
      const gap = inCol[i].top - inCol[i - 1].bottom
      if (gap > biggest) {
        biggest = gap
        at = Math.round(inCol[i - 1].bottom - gridTop)
      }
    }
    gapsByColumn.push({col: c, gap: Math.round(biggest), at})
  }
  gapsByColumn.sort((a, b) => b.gap - a.gap)

  // The staircase at the bottom of the set: how far the shortest column
  // of the set finishes above the longest.
  const colBottoms = new Map()
  for (const r of rects) {
    const c = Math.round((r.left + 1) / colW)
    colBottoms.set(c, Math.max(colBottoms.get(c) ?? -Infinity, r.bottom))
  }
  const bottoms = [...colBottoms.values()]
  const ragged = Math.round(Math.max(...bottoms) - Math.min(...bottoms))

  const totalArea = grid.clientWidth * grid.scrollHeight
  const covered = all.reduce((a, el) => {
    const r = el.getBoundingClientRect()
    return a + r.width * r.height
  }, 0)

  return {
    gaps: gapsByColumn.slice(0, 4),
    ragged,
    whitespace: Math.round((1 - covered / totalArea) * 100),
    href,
    family: fam.length,
    frames: frames.length,
    layoutStillAt: layoutStillAt === null ? null : Math.round(layoutStillAt),
    scrollStillAt: scrollStillAt === null ? null : Math.round(scrollStillAt),
    longestFrame: Math.round(longest),
    boxW: Math.round(box.right - box.left),
    boxH: Math.round(box.bottom - box.top),
    fill: Math.round((famArea / boxArea) * 100),
    intruders: intruders.length,
    intruderFill: Math.round((intruderArea / boxArea) * 100),
    cols: Math.round(grid.clientWidth / (all[0]?.getBoundingClientRect().width || 1)),
  }
})

await browser.close()

console.log(`${BASE}/portfolio at ${WIDTH}x${HEIGHT} - one gather on a desktop\n`)
if (!result) {
  console.log('  no reachable tile in a project of 8+ - nothing measured')
  process.exit(1)
}

console.log(`  ${result.family} pieces, grid about ${result.cols} columns wide\n`)
console.log('  SNAPPINESS')
console.log(`    the layout stopped moving   ${result.layoutStillAt}ms after the click`)
console.log(`    the page stopped scrolling  ${result.scrollStillAt}ms after the click`)
console.log(`    longest frame               ${result.longestFrame}ms over ${result.frames} frames`)
const wasted =
  result.layoutStillAt !== null && result.scrollStillAt !== null
    ? result.scrollStillAt - result.layoutStillAt
    : null
console.log(
  wasted !== null && wasted > 60
    ? `    -> ${wasted}ms of the wait is the anchor still correcting a layout that had already arrived.`
    : `    -> the anchor let go close to when the layout settled.`,
)

console.log('\n  TIDINESS')
console.log(`    the set occupies a ${result.boxW}x${result.boxH} box`)
console.log(`    ${result.fill}% of that box is the set itself`)
console.log(`    ${result.intruders} tiles from other projects sit inside it, filling ${result.intruderFill}%`)
console.log(
  result.intruders > result.family / 2
    ? `    -> the set is shot through with other work; it will not read as a block.`
    : `    -> the set is mostly contiguous.`,
)

console.log('\n  WHERE THE WHITE IS')
console.log(`    the set's bottom edge is ${result.ragged}px ragged between its shortest and tallest column`)
console.log(`    ${result.whitespace}% of the whole grid is empty`)
console.log(`    biggest vertical gaps, by column:`)
for (const g of result.gaps) {
  console.log(`      column ${g.col}: ${g.gap}px, starting ${g.at}px down the grid`)
}

/*
  A GUARD, NOT JUST A REPORT.

  The shelf took this from 57% fill with eleven intruders to 81% with
  none, and a number that good is worth defending - the failure it fixes
  was invisible to every other check in the repo and was found by Chris
  looking at his screen.

  Two intruders of slack rather than zero, because masonry is allowed a
  little raggedness at the set's bottom edge and failing on one stray
  tile would make this a test people turn off. 70% fill is comfortably
  below the 81% measured and comfortably above the 57% that prompted it.
*/
let failed = false
if (result.intruders > 2) {
  console.log(`\nFAIL ${result.intruders} tiles from other projects are inside the set - the shelf is not holding.`)
  failed = true
}
if (result.fill < 70) {
  console.log(`\nFAIL the set fills only ${result.fill}% of its own bounding box.`)
  failed = true
}
if (failed) process.exit(1)
console.log('\nThe set reads as one block.')
