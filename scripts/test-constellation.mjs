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
  THE LINES: WHERE THEY ARE ALLOWED, AND WHAT THEY MUST NOT CROSS.

  Preview only, so this is reported rather than required when absent.

  Two different kinds of claim here, and they fail in different ways.

  The WIRING checks catch what has gone wrong in this project before: a
  layer that is present, correct, and attached to nothing. A mask with no
  rects, or lines sitting outside the masked group, both look exactly like
  a working feature in the DOM while putting strokes across the artwork.

  The GEOMETRY check is the one Chris actually asked for, and it cannot be
  answered by reading the DOM. "Lines go through another highlighted image"
  is a statement about segments and rectangles, so it is tested as one:
  every segment is clipped against every lit frame, and a segment that
  survives the clip is a line lying over a picture someone is looking at.

  That check is what distinguishes the tree from the starburst it replaced.
  Both shapes draw exactly n-1 lines, so counting them proves nothing - the
  difference is only ever visible in where those lines go.

  Deliberately asymmetric: lines over DIMMED tiles are allowed and expected
  now, so the mask covering fewer rects than there are tiles is asserted as
  correct rather than tolerated. A mask that grew back to every tile would
  mean the invisible dashed version had returned.
*/
const links = await page.evaluate(() => {
  const svg = document.querySelector('.pf-grid .pf-links')
  if (!svg) return null
  const grid = document.querySelector('.pf-grid')
  const mask = svg.querySelector('mask')
  const group = svg.querySelector('g[mask]')
  const gr = grid.getBoundingClientRect()

  const lit = [...grid.querySelectorAll('.pf-item.is-sibling')]
  /*
    Inset by 2px before testing. The ends are trimmed to each frame's edge
    and pushed 3px clear, then rounded to whole pixels, so a line can finish
    a hair inside its own target through rounding alone. Shrinking the test
    rectangle keeps that from reading as a crossing, while a line genuinely
    laid across a picture misses by far more than two pixels.
  */
  const frames = lit.map((el) => {
    const r = (el.querySelector('.pf-item__frame') ?? el).getBoundingClientRect()
    return {
      x0: r.left - gr.left + 2,
      y0: r.top - gr.top + 2,
      x1: r.right - gr.left - 2,
      y1: r.bottom - gr.top - 2,
    }
  })

  /* Liang-Barsky: does the segment have any length inside the box? */
  const crosses = (ax, ay, bx, by, b) => {
    let t0 = 0
    let t1 = 1
    const dx = bx - ax
    const dy = by - ay
    for (const [p, q] of [
      [-dx, ax - b.x0],
      [dx, b.x1 - ax],
      [-dy, ay - b.y0],
      [dy, b.y1 - ay],
    ]) {
      if (p === 0) {
        if (q < 0) return false
      } else {
        const r = q / p
        if (p < 0) {
          if (r > t1) return false
          if (r > t0) t0 = r
        } else {
          if (r < t0) return false
          if (r < t1) t1 = r
        }
      }
    }
    return t1 > t0
  }

  const segs = [...svg.querySelectorAll('line')].map((l) => ({
    ax: +l.getAttribute('x1'),
    ay: +l.getAttribute('y1'),
    bx: +l.getAttribute('x2'),
    by: +l.getAttribute('y2'),
  }))

  let over = 0
  let longest = 0
  let ink = 0
  for (const s of segs) {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay)
    ink += len
    longest = Math.max(longest, len)
    if (frames.some((f) => crosses(s.ax, s.ay, s.bx, s.by, f))) over += 1
  }

  /*
    What the starburst this replaced would have drawn: one spoke from the
    clicked tile to each sibling. Same number of lines, so the only
    measurable difference between the two shapes is total length. Computed
    here rather than guessed at, because a fixed pixel threshold would be a
    number I made up about a layout that changes with the viewport.

    THE TRIMMING HAS TO MATCH, and the first version of this check did not
    do that. It compared drawn segments - cut back to each frame's edge -
    against raw centre-to-centre spokes, and "37% less ink" came out of a
    run where the page was still drawing the starburst. The saving was the
    trimming, measured against itself. A check that passes for the shape it
    is supposed to rule out is worse than no check.

    So the ray-rect cut is reimplemented here, independently, and applied to
    the hypothetical spokes as well. Duplicated from the page on purpose: a
    test that imported the page's own geometry could only ever agree with
    it.
  */
  const boxOf = (el) => {
    const r = (el.querySelector('.pf-item__frame') ?? el).getBoundingClientRect()
    return {
      x: r.left - gr.left + r.width / 2,
      y: r.top - gr.top + r.height / 2,
      hw: r.width / 2,
      hh: r.height / 2,
    }
  }
  const GAP = 3
  const trimmed = (a, b) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (!len) return 0
    const cut = (box) => {
      const sx = dx === 0 ? Infinity : box.hw / Math.abs(dx)
      const sy = dy === 0 ? Infinity : box.hh / Math.abs(dy)
      return Math.min(sx, sy) * len + GAP
    }
    return Math.max(0, len - cut(a) - cut(b))
  }

  const hub = grid.querySelector('.pf-item.is-expanded')
  let starInk = 0
  if (hub) {
    const h = boxOf(hub)
    for (const el of lit) {
      if (el === hub) continue
      starInk += trimmed(h, boxOf(el))
    }
  }

  return {
    starInk: Math.round(starInk),
    lines: segs.length,
    linesInsideMaskedGroup: group ? group.querySelectorAll('line').length : 0,
    maskRects: mask ? mask.querySelectorAll('rect').length : 0,
    tiles: grid.querySelectorAll('.pf-item').length,
    litTiles: lit.length,
    over,
    longest: Math.round(longest),
    ink: Math.round(ink),
    firstChild: grid.firstElementChild?.classList.contains('pf-links') ?? false,
  }
})

console.log('')
if (!links) {
  console.log('  (no line layer - expected on production, where lines are gated off)')
} else {
  console.log(
    `  line layer: ${links.lines} line(s), ${links.ink}px of ink, longest hop ${links.longest}px`,
  )
  console.log(
    `  mask knocks out ${links.maskRects - 1} lit frame(s); the other ${links.tiles - links.litTiles} tiles are left open on purpose`,
  )
  check('every line sits inside the masked group', links.lines > 0 && links.lines === links.linesInsideMaskedGroup)
  check(
    'the mask covers the lit pictures',
    links.maskRects === links.litTiles + 1,
    `${links.maskRects} rects for ${links.litTiles} lit tiles plus the open field`,
  )
  check(
    'the dimmed tiles are NOT masked, so the lines stay visible across them',
    links.maskRects < links.tiles + 1,
    `${links.tiles - links.litTiles} tile(s) left open`,
  )
  check(
    'no line lies across a picture the visitor is looking at',
    links.over === 0,
    `${links.over} of ${links.lines} segment(s) cross a lit frame`,
  )
  check(
    'the thread is shorter than the starburst it replaced',
    links.starInk > 0 && links.ink < links.starInk,
    `${links.ink}px of hops against ${links.starInk}px of spokes (${Math.round((1 - links.ink / links.starInk) * 100)}% less ink)`,
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
