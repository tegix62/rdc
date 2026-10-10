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

/*
  Gather is the default now, so the committed constellation has to be
  switched on before it can be tested. Dispatched in the page rather than
  clicked, so the toolbar is not scrolled into view and the page stays
  where this script put it.

  Only the sections below that assert LINES need this. The dimming
  behaviour is shared by both modes, which is why the later reloads - which
  reset the toggle to its default - still measure what they claim to.
*/
await page.evaluate(() => {
  const btn = document.querySelector('#pf-gather')
  if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click()
})
await page.waitForTimeout(400)

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

  /*
    DO THE HOPS CROSS EACH OTHER?

    Chris: "it'll seem a little random how these lines connect... you might
    see like an O shape of images when one thing is highlighted". Neatness
    is the complaint, and it needs a measure that is not a number I made up.

    This one comes free from the maths: a Euclidean minimum spanning tree is
    planar - it provably has no crossing edges, because if two edges crossed
    you could always swap an endpoint for a shorter total. So crossings are
    a direct signal that the tree is not following real nearness, which is
    exactly the "random" look. The shipped tree measures nearness as the
    clear space between rectangles rather than between centres, so it is not
    strictly Euclidean and a crossing is not impossible - but it should be
    rare, and a handful of them means the metric is still wrong.
  */
  const hit = (p, q, r, s) => {
    const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    const d1 = o(p, q, r)
    const d2 = o(p, q, s)
    const d3 = o(r, s, p)
    const d4 = o(r, s, q)
    return d1 !== d2 && d3 !== d4
  }
  let crossings = 0
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]
      const b = segs[j]
      // Hops sharing an endpoint meet there by design; only count a crossing
      // in open space. 6px of slack covers the rounding on the trimmed ends.
      const near = (m, n) => Math.hypot(m.x - n.x, m.y - n.y) < 6
      const ends = [
        {x: a.ax, y: a.ay},
        {x: a.bx, y: a.by},
      ]
      const others = [
        {x: b.ax, y: b.ay},
        {x: b.bx, y: b.by},
      ]
      if (ends.some((e) => others.some((o2) => near(e, o2)))) continue
      if (hit(ends[0], ends[1], others[0], others[1])) crossings += 1
    }
  }

  return {
    crossings,
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
  /*
    A FAILURE, NOT A NOTE.

    This used to shrug and say "expected on production, where lines are
    gated off" - and it printed exactly that against PREVIEW for two runs
    while the committed lines were broken. I read it, said in writing that
    the branch was unverified, and moved on. Chris found it instead.

    This script is pointed at preview by its workflow and by its default
    argument. Production's gating is proved elsewhere, by
    check-prototype-hidden and by the explicit "production has no deck"
    style assertions. So a missing line layer here is a broken feature, and
    a check that cannot fail is worse than no check because it reads like
    coverage.
  */
  check(
    'the committed line layer exists after a click with gather off',
    false,
    'no .pf-links in the grid at all',
  )
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
    'the hops do not cross each other, so the thread reads as a tree',
    links.crossings === 0,
    `${links.crossings} crossing(s) among ${links.lines} hop(s)`,
  )
  check(
    'the thread is shorter than the starburst it replaced',
    links.starInk > 0 && links.ink < links.starInk,
    `${links.ink}px of hops against ${links.starInk}px of spokes (${Math.round((1 - links.ink / links.starInk) * 100)}% less ink)`,
  )
  check('the line layer is the first child, so tiles paint over it', links.firstChild)
}

/*
  THE HOVER PREVIEW, which is what the constellation is for now.

  Chris chose gather as the default and the lines became its preview: on a
  desktop pointer, hovering a tile draws its family without moving or
  dimming anything. The things that would make that obnoxious are what get
  asserted - a preview that fires while a tile is gathered, or that dims
  the grid, or that latches on and never clears.

  Desktop only by design. Mobile has no hover and learns the same thing on
  tap, so nothing here is information a phone cannot reach.
*/
{
  const hover = await browser.newPage({viewport: {width: 1600, height: 1000}})
  await hover.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await hover.waitForTimeout(3000)

  const target = await hover.evaluate(() => {
    const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const sizes = {}
    for (const el of tiles) {
      const k = hrefOf(el)
      if (k) sizes[k] = (sizes[k] ?? 0) + 1
    }
    const t = tiles.find((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
    if (!t) return null
    t.setAttribute('data-hover-probe', '')
    return hrefOf(t)
  })

  console.log('')
  if (!target) {
    check('a tile from a big enough project exists to hover', false)
  } else {
    await hover.hover('[data-hover-probe]')
    /*
      Just past one 160ms fade. There is no dwell to wait out any more -
      the preview engages on the first mouseover - so a long wait here
      would hide a delay rather than measure one.
    */
    await hover.waitForTimeout(260)

    const state = await hover.evaluate(() => {
      const svg = document.querySelector('.pf-grid .pf-links')
      return {
        lines: svg?.querySelectorAll('line').length ?? 0,
        marked: !!document.querySelector('.pf-links--preview'),
        opacity: Number(getComputedStyle(document.querySelector('.pf-links line') ?? document.body).strokeOpacity),
        dimmed: document.querySelector('.pf-grid')?.classList.contains('has-focus') ?? false,
        moved: !!document.querySelector('.pf-item.is-expanded'),
        /* The point of the whole exercise: the rest of the grid drops back
           so the lines are against something. */
        previewing: document.querySelector('.pf-grid')?.classList.contains('has-preview') ?? false,
        litMin: Math.min(
          ...[...document.querySelectorAll('.pf-item.is-preview-sibling')].map((el) =>
            Number(getComputedStyle(el).opacity),
          ),
        ),
        outsiderMax: Math.max(
          ...[...document.querySelectorAll('.pf-grid .pf-item:not(.is-preview-sibling)')].map((el) =>
            Number(getComputedStyle(el).opacity),
          ),
        ),
        ms: Number((window.__pfPreviewMs ?? 0).toFixed(2)),
        vectorEffect: getComputedStyle(
          document.querySelector('.pf-links line') ?? document.body,
        ).vectorEffect,
      }
    })
    console.log(`  hovering a tile from ${target}`)
    check('hovering draws the family', state.lines > 0, `${state.lines} line(s)`)
    check('and marks them as a preview', state.marked)
    /*
      Full strength, like the committed lines. The preview was faint at 0.5
      and Chris reported it hard to see twice; what distinguishes it now is
      the speed it draws at, not the ink.

      Asserted rather than dropped, so a future attempt to quieten it again
      has to argue with a failing test instead of sliding in.
    */
    check(
      'the preview is drawn at full strength',
      state.opacity === 1,
      `stroke-opacity ${state.opacity}`,
    )
    check(
      'and the stroke does not distort with the scaled viewBox',
      state.vectorEffect === 'non-scaling-stroke',
      `vector-effect ${state.vectorEffect}`,
    )
    /*
      The two refusals that make it a preview rather than a second mode:
      nothing dims and nothing moves. Either one would make a hover feel
      like a click that fired by accident.
    */
    /*
      The family stays lit and everything else drops back - the same
      treatment as a click, which is what makes the lines readable at all.
    */
    check('the grid drops back behind the hovered family', state.previewing)
    check('every piece of that project stays lit', state.litMin === 1, `dimmest sibling at ${state.litMin}`)
    check(
      'everything else fades',
      state.outsiderMax < 0.5,
      `brightest outsider at ${state.outsiderMax}`,
    )
    /*
      It must not borrow the EXPANDED state's machinery. has-focus and an
      expanded tile both belong to the click path; a hover that set either
      would leave the two fighting over who clears what, and would move the
      grid on a gesture that is supposed to only look.
    */
    check('it does not borrow the clicked state', !state.dimmed)
    check('nothing expands on hover', !state.moved)
    /*
      "Can this work but still be snappy" has a number for an answer, and
      it should come from the browser. One frame at 60Hz is 16.7ms; drawing
      the whole preview inside that budget means the highlight lands on the
      next frame after the pointer arrives.
    */
    check(
      'the whole preview is drawn inside one frame',
      state.ms > 0 && state.ms < 16.7,
      `${state.ms}ms to dim the grid and draw the tree`,
    )

    /*
      THE ASSERTION THAT WAS MISSING FOR THREE ROUNDS.

      Chris said he could not see the animation three times. Every check in
      this file passed throughout, because they all asserted that the lines
      EXIST and how long the draw costs - never that a stroke grows. I twice
      reported it fixed on that basis.

      The mechanism is a transition on stroke-dashoffset from each hop's
      length to zero, so the thing to measure is the total undrawn length
      across every hop, sampled per frame. It starts at the tree's full
      length and reaches zero only when the last hop lands. A series that is
      zero from the first sample is a tree that simply appeared - which is
      what the ring-depth stagger produced, since most hops shared a depth
      and the lot finished inside 110ms.

      Deliberately NOT asserting a duration. The point is that the draw is
      progressive and that it finishes; how long it should take is Chris's
      call and will move.
    */
    const drawn = await hover.evaluate(() => {
      const tile = document.querySelector('[data-hover-probe]')
      // Re-enter the tile so a fresh draw is captured from its first frame.
      tile?.dispatchEvent(new MouseEvent('mouseout', {bubbles: true}))
      return new Promise((resolve) => {
        const samples = []
        let n = 0
        const read = () => {
          let undrawn = 0
          const lines = [...document.querySelectorAll('.pf-links line')]
          for (const l of lines) undrawn += parseFloat(getComputedStyle(l).strokeDashoffset) || 0
          samples.push(Math.round(undrawn))
          if (++n < 30) requestAnimationFrame(read)
          else resolve(samples)
        }
        tile?.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}))
        requestAnimationFrame(read)
      })
    })

    const peak = Math.max(...drawn)
    const settled = drawn[drawn.length - 1]
    const steps = new Set(drawn).size
    console.log(`    undrawn length over ${drawn.length} frames: ${drawn[0]} ... peak ${peak} ... ${settled}`)
    check(
      'the tree draws progressively rather than appearing',
      peak > 100 && steps > 4,
      `peak ${peak}px undrawn across ${steps} distinct values`,
    )
    check('and it finishes', settled === 0, `${settled}px still undrawn after ${drawn.length} frames`)

    /* Leaving must clear it, or the lines latch on. */
    await hover.mouse.move(5, 5)
    await hover.waitForTimeout(400)
    const after = await hover.evaluate(() => ({
      lines: document.querySelectorAll('.pf-grid .pf-links line').length,
      previewing: document.querySelector('.pf-grid')?.classList.contains('has-preview') ?? false,
      dimmest: Math.min(
        ...[...document.querySelectorAll('.pf-grid .pf-item')].map((el) =>
          Number(getComputedStyle(el).opacity),
        ),
      ),
    }))
    check(
      'leaving the grid clears the lines AND the dimming',
      after.lines === 0 && !after.previewing && after.dimmest === 1,
      `${after.lines} line(s), dimmest tile at ${after.dimmest}`,
    )
  }
  await hover.close()
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
