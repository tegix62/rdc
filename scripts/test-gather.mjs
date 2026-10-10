/*
  Gather pulls a project's pieces to the tile you clicked - without
  throwing you out of your place on the page.

  WHY THE SCROLL ANCHOR IS THE REAL TEST

  Re-sorting the grid is the easy part: Isotope lays out in DOM order, so
  moving the set to the front brings it together. Chris's own worry was the
  cost - "this would take everything out of the grid, and I don't know if I
  want to resort everything around it".

  The cost is not speed. Isotope positions with transforms, and the Shuffle
  button already re-deals all 82 tiles on every press. The cost is losing
  your place: the tile you clicked moves too, so your scroll position stops
  meaning anything and content from below the fold gets pulled past you.

  So the assertion that matters is that the clicked tile stays put ON SCREEN
  while everything else rearranges around it. A test that only checked "the
  siblings are now adjacent" would pass on a build that gathers correctly
  and dumps the visitor somewhere else in the page, which is the version
  that would read as broken.

  Measured in viewport coordinates, not document coordinates. The whole
  point is where the tile appears to the person looking at it.

  Usage: node scripts/test-gather.mjs [preview-url] [prod-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PROD = (process.argv[3] ?? 'https://rumeaudesign.co').replace(/\/$/, '')

let failures = 0
/*
  Failed checks are also collected and reprinted at the end.

  These runs are read through a log tail, and a suite with forty passing
  lines pushes an early failure off the top of it - which has cost two
  rounds of fetching progressively more of the same log to find out which
  check broke. The verdict belongs where it can always be seen.
*/
const failed = []
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    failed.push(`${name}${detail ? ` - ${detail}` : ''}`)
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(2500)

console.log(`${BASE}/portfolio\n`)

/* ---------- the toggle exists and starts off ---------- */
const toggle = await page.evaluate(() => {
  const btn = document.querySelector('#pf-gather')
  return btn ? {text: btn.textContent.trim(), pressed: btn.getAttribute('aria-pressed')} : null
})

/*
  The toggle is gone on purpose. It existed to judge two rival modes, and
  the answer was that they were never rivals - the thread explains the
  regrouping and the regrouping follows it. Asserted as an absence so that
  re-adding it has to be a decision rather than a reflex.
*/
check('the Gather toggle is gone - there is one behaviour now', toggle === null)
if (false) {
  /*
    Starts ON now. Chris chose gather over the constellation as the default
    once he could see it, so the toggle's job changed: it is no longer a way
    to opt in to an experiment, it is a way back to the other one.
  */
  check('the Gather toggle starts on', toggle.pressed === 'true', `reads "${toggle.text}"`)
}

/*
  EVERY CLICK FROM HERE IS DISPATCHED IN THE PAGE, NOT BY PLAYWRIGHT.

  The first version used page.click() and the run printed "page scrolled to
  0" - Playwright scrolls a target into view before clicking it, and the
  Gather toggle lives in the toolbar at the top of the page, so pressing it
  dragged the page back to the top. The anchor assertion then ran with
  nothing above the tile to be thrown to, which is precisely the degenerate
  case the comment two paragraphs up warns about. It passed, and it proved
  almost nothing.

  Dispatching in the page moves nothing on its own, so the scroll position
  under test is the one this script set. The scroll depth is asserted
  outright below, so this can never quietly degenerate again.

  AND NOTHING PRESSES THE TOGGLE HERE ANY MORE. Gather is the default now,
  so the press that used to switch it on switches it off - which is what
  the last run actually measured: six failures that all said "the
  constellation is running", because the test had helpfully turned gather
  off before testing gather.
*/
await page.waitForTimeout(200)

/*
  Scroll TO a gatherable tile rather than to a fixed depth and hoping one is
  there. The fixed-depth version failed with "a gatherable tile is visible
  to click": at 1600px down a 1080px window, every tile inside the
  measurement band belonged to no project. Centring a known-good tile gives
  both things this test needs - page above it, and a tile to click.
*/
const marked = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
  const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
  const sizes = {}
  for (const el of tiles) {
    const k = hrefOf(el)
    if (k) sizes[k] = (sizes[k] ?? 0) + 1
  }
  /*
    Well into the deal, not just past the first few. `slice(6)` picked a
    tile still in the first row, so centring it barely scrolled the page -
    the scroll-depth check failed, and the anchor had almost no room to
    work. The affiliated pieces run to about position 43, so three quarters
    of the way through them is comfortably down the page and still
    gatherable.
  */
  const candidates = tiles.filter((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
  if (!candidates.length) return false
  const target = candidates[Math.floor(candidates.length * 0.75)]
  target.setAttribute('data-gather-probe', '')
  target.scrollIntoView({block: 'center', behavior: 'instant'})
  return true
})
if (!marked) check('a tile from a gatherable project exists', false)
await page.waitForTimeout(500)

/* Gather is simply what a click does now; nothing has to be switched on. */

/*
  Pick a tile from a project big enough to gather, somewhere in the middle
  of the viewport, and record where it sits before the click.
*/
const chosen = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
  const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
  const sizes = {}
  for (const el of tiles) {
    const k = hrefOf(el)
    if (k) sizes[k] = (sizes[k] ?? 0) + 1
  }
  const target = document.querySelector('[data-gather-probe]')
  if (!target) return null
  const href = hrefOf(target)
  /* Where its project's pieces sit in DOM order right now. */
  const idx = tiles.map((el, i) => [hrefOf(el), i]).filter(([k]) => k === href).map(([, i]) => i)
  return {
    href,
    family: sizes[href],
    top: Math.round(target.getBoundingClientRect().top),
    spreadBefore: Math.max(...idx) - Math.min(...idx),
    scrollY: Math.round(window.scrollY),
  }
})

console.log('')
if (!chosen) {
  check('a gatherable tile was found and centred', false)
} else {
  console.log(`  clicked a tile from ${chosen.href} (${chosen.family} pieces)`)
  console.log(`  it sat ${chosen.top}px down the viewport, page scrolled to ${chosen.scrollY}`)

  /*
    The anchor only means anything with page above the tile. Asserted, not
    assumed: a run that silently drifts back to the top would report a
    perfect anchor while testing nothing.
  */
  check(
    'the test is gathering from part-way down the page, not the top',
    chosen.scrollY > 600,
    `scrolled to ${chosen.scrollY}`,
  )

  await page.evaluate(() => document.querySelector('[data-gather-probe]')?.click())
  await page.waitForTimeout(1400)

  const after = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const probe = document.querySelector('[data-gather-probe]')
    const href = hrefOf(probe)
    const idx = tiles.map((el, i) => [hrefOf(el), i]).filter(([k]) => k === href).map(([, i]) => i)
    return {
      top: Math.round(probe.getBoundingClientRect().top),
      /*
        The clicked tile leads ITS OWN RUN now, not the whole grid. Gather
        used to move the set to index 0, which broke the scroll anchor
        beyond rescue; the siblings are now inserted around the tile's
        existing place instead. So the property worth asserting changed
        with the design - "is it first in the DOM" was testing the old
        behaviour and would now fail on correct code.
      */
      leadsItsRun: Math.min(...idx) === idx[0] && tiles[Math.min(...idx)] === probe,
      spreadAfter: Math.max(...idx) - Math.min(...idx),
      familySize: idx.length,
      lines: document.querySelectorAll('.pf-links line').length,
      scrollY: Math.round(window.scrollY),
    }
  })

  console.log(`  afterwards it sits ${after.top}px down, page scrolled to ${after.scrollY}`)

  /*
    The set should now occupy a contiguous run at the front of the DOM, so
    its spread is one less than its size. Before gathering the deal
    deliberately spaces them out, so the spread was much larger.
  */
  check(
    'the project is pulled into one contiguous run',
    after.spreadAfter === after.familySize - 1,
    `spread ${chosen.spreadBefore} -> ${after.spreadAfter} across ${after.familySize} pieces`,
  )
  check('the clicked tile leads its own run', after.leadsItsRun)
  check(
    'and the visitor keeps their place - the clicked tile barely moves on screen',
    Math.abs(after.top - chosen.top) <= 24,
    `${chosen.top}px -> ${after.top}px (${after.top - chosen.top >= 0 ? '+' : ''}${after.top - chosen.top}px)`,
  )
  check(
    'no constellation lines are drawn in gather mode',
    after.lines === 0,
    `${after.lines} line(s)`,
  )
}

/* ---------- the label must not lag behind its tile ---------- */
{
  /*
    Chris: "the 'pieces' tag is the only thing now that takes a second to
    lock in."

    It was positioned in grid coordinates and re-placed after the gather,
    so it sat still while its tile moved and then jumped to catch up. It
    is a child of the tile now, which means the property to assert is
    simply that it never separates from it - sampled every frame through
    the whole rearrangement rather than checked once at the end, because
    checking at the end is exactly what hid this.
  */
  const ph = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
  await ph.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await ph.waitForTimeout(3500)

  const drift = await ph.evaluate(() => {
    const grid = document.querySelector('.pf-grid')
    const tiles = [...grid.querySelectorAll('.pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const sizes = {}
    for (const el of tiles) {
      const k = hrefOf(el)
      if (k) sizes[k] = (sizes[k] ?? 0) + 1
    }
    const t = tiles.find((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
    if (!t) return null
    t.click()

    let worst = 0
    let sawTag = false
    let offScreen = 0
    return new Promise((resolve) => {
      let f = 0
      const tick = () => {
        const tag = document.querySelector('.pf-tag')
        if (tag) {
          sawTag = true
          const tr = tag.getBoundingClientRect()
          const br = t.getBoundingClientRect()
          /* Horizontal separation from its own tile, which is what a
             stale position looks like while the grid reflows. */
          const gap = Math.min(
            Math.abs(tr.left - br.left),
            Math.abs(tr.right - br.right),
          )
          worst = Math.max(worst, gap)
          if (tr.left < -2 || tr.right > window.innerWidth + 2) offScreen += 1
        }
        if (++f < 90) requestAnimationFrame(tick)
        else resolve({worst: Math.round(worst), sawTag, offScreen})
      }
      requestAnimationFrame(tick)
    })
  })

  console.log('')
  if (!drift) {
    check('a gatherable tile exists on the phone layout', false)
  } else {
    console.log(`  label vs its tile over 90 frames: worst separation ${drift.worst}px`)
    check('the set is labelled on touch too', drift.sawTag)
    check(
      'and the label never lags behind its tile',
      drift.worst <= 4,
      `${drift.worst}px at worst`,
    )
    check(
      'nor does it hang off the screen',
      drift.offScreen === 0,
      `${drift.offScreen} frame(s) outside the viewport`,
    )
  }
  await ph.close()
}

/* ---------- how long a gather actually takes on a phone ---------- */
{
  /*
    Chris: "lines appear briefly as the mosaic slowly Gathers, it's a
    noticeable lag on mobile but not on desktop."

    The lines are gone from the touch path now, but it is worth knowing
    whether they were the whole of it - a relayout of eighty-two tiles into
    one or two columns is real work, and if the gather itself is slow then
    removing the thread has only made the wait emptier.

    Reported rather than asserted, because I do not yet know what good
    looks like here and inventing a threshold would be a number pretending
    to be a standard. What the figure separates is "the thread was the lag"
    from "the thread was hiding the lag".
  */
  const ph = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
  await ph.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await ph.waitForTimeout(3500)

  const timing = await ph.evaluate(() => {
    const grid = document.querySelector('.pf-grid')
    const tiles = [...grid.querySelectorAll('.pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const sizes = {}
    for (const el of tiles) {
      const k = hrefOf(el)
      if (k) sizes[k] = (sizes[k] ?? 0) + 1
    }
    const t = tiles.find((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
    if (!t) return null

    const order = () =>
      [...grid.querySelectorAll('.pf-item')].map((el) => el.querySelector('img')?.getAttribute('alt') ?? '?').join('|')
    const start = order()
    const t0 = performance.now()
    let movedAt = -1
    let settledAt = -1
    let lastBoxes = ''
    let stable = 0
    let longestFrame = 0
    let prev = t0
    let lines = 0

    t.click()
    return new Promise((resolve) => {
      const tick = () => {
        const now = performance.now()
        longestFrame = Math.max(longestFrame, now - prev)
        prev = now
        if (document.querySelectorAll('.pf-links line, .pf-links polyline').length) lines += 1
        if (movedAt < 0 && order() !== start) movedAt = now - t0
        const boxes = [...grid.querySelectorAll('.pf-item')]
          .map((el) => Math.round(el.getBoundingClientRect().top))
          .join(',')
        if (boxes === lastBoxes) stable += 1
        else stable = 0
        lastBoxes = boxes
        if (movedAt >= 0 && stable >= 8 && settledAt < 0) settledAt = now - t0
        if (settledAt < 0 && now - t0 < 4000) requestAnimationFrame(tick)
        else resolve({
          movedAt: Math.round(movedAt),
          settledAt: Math.round(settledAt),
          longestFrame: Math.round(longestFrame),
          framesWithLines: lines,
          tiles: tiles.length,
        })
      }
      requestAnimationFrame(tick)
    })
  })

  console.log('')
  if (!timing) {
    check('a gatherable tile exists on the phone layout', false)
  } else {
    console.log(
      `  phone gather over ${timing.tiles} tiles: starts moving at ${timing.movedAt}ms, settled at ${timing.settledAt}ms`,
    )
    console.log(`  longest frame during the move: ${timing.longestFrame}ms`)
    check(
      'no thread is drawn on touch - that is desktop and the one-time demo now',
      timing.framesWithLines === 0,
      `${timing.framesWithLines} frame(s) had lines`,
    )
    /*
      A tap should start doing something within a few frames. Anything
      slower and the page feels like it ignored you, whatever happens next.
    */
    check(
      'the gather begins promptly rather than after a pause',
      timing.movedAt >= 0 && timing.movedAt < 180,
      `first movement at ${timing.movedAt}ms`,
    )
  }
  await ph.close()
}

/* ---------- the explanation has to come BEFORE the move ---------- */
{
  /*
    Chris: "the Gather function snaps a bunch of pictures together in a
    click, where the viewer may otherwise have not even gathered that the
    surrounding pieces are related."

    Gather shows a result with no cause, so the thread is drawn first and
    the pieces come together along it. On a desktop pointer the hover
    preview has usually said it already and the gather follows at once -
    so TOUCH is where this is tested, because touch is where the
    explanation was missing entirely.

    Asserted as an ordering, which is the only thing that makes it an
    explanation: lines present while the grid is still in its dealt order,
    and the grid reordered afterwards. A test that only checked "lines
    appear at some point" would pass on a build that draws them after the
    tiles have already landed, which explains nothing.
  */
  const phone = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
  await phone.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await phone.waitForTimeout(3000)

  const seq = await phone.evaluate(async () => {
    const grid = document.querySelector('.pf-grid')
    const tiles = [...grid.querySelectorAll('.pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const sizes = {}
    for (const el of tiles) {
      const k = hrefOf(el)
      if (k) sizes[k] = (sizes[k] ?? 0) + 1
    }
    const target = tiles.find((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
    if (!target) return null

    const orderNow = () =>
      [...grid.querySelectorAll('.pf-item')].map((el) => el.querySelector('img')?.getAttribute('alt') ?? '?').join('|')
    const before = orderNow()

    target.click()

    /* Watch both facts every frame for a second. */
    let linesAt = -1
    let movedAt = -1
    return new Promise((resolve) => {
      let f = 0
      const tick = () => {
        const hasLines = grid.querySelectorAll('.pf-links line, .pf-links polyline').length > 0
        const moved = orderNow() !== before
        if (hasLines && linesAt < 0) linesAt = f
        if (moved && movedAt < 0) movedAt = f
        if (++f < 60) requestAnimationFrame(tick)
        else resolve({linesAt, movedAt, frames: f})
      }
      requestAnimationFrame(tick)
    })
  })

  console.log('')
  if (!seq) {
    check('a gatherable tile exists on the phone layout', false)
  } else {
    /*
      REVERSED, deliberately. This used to require the thread before the
      move on touch. Chris: "I don't see an application for the lines on
      mobile" - the one-time demo explains the idea now, and paying a
      280ms beat on every tap spent it against the slowest relayout on the
      site. The assertion follows the decision rather than outliving it.
    */
    console.log(`  on touch: lines at frame ${seq.linesAt}, grid reordered at frame ${seq.movedAt}`)
    check(
      'a tap on touch goes straight to the gather, with no thread',
      seq.linesAt < 0,
      seq.linesAt < 0 ? 'no lines drawn' : `lines appeared at frame ${seq.linesAt}`,
    )
    check('and the grid does rearrange', seq.movedAt >= 0, `moved at frame ${seq.movedAt}`)
  }
  await phone.close()
}

/* ---------- the assertion that was missing: a visitor can SEE it ---------- */
{
  /*
    Chris reported Shuffle and Gather doing nothing, twice, and every check
    in this file passed throughout. They were all measuring DOM order and
    box coordinates - both of which changed on every press, because
    reloadItems() really did reorder the list and re-measuring really did
    shift every box. What never changed was the sequence on screen, because
    layout() repositions a stale filteredItems array.

    So the question is now asked the way a person asks it: after a Shuffle,
    are different pieces on the first screenful? Nothing about geometry can
    substitute for that, and nothing short of it would have caught this.
  */
  const page2 = await browser.newPage({viewport: {width: 1600, height: 1000}})
  await page2.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page2.waitForTimeout(3000)

  const onScreen = () =>
    page2.evaluate(() =>
      [...document.querySelectorAll('.pf-grid .pf-item')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.top < innerHeight && r.bottom > 0 && r.width > 0
        })
        .map((el) => el.querySelector('img')?.getAttribute('alt') ?? '?'),
    )

  const seenBefore = await onScreen()
  await page2.evaluate(() => document.querySelector('#pf-shuffle')?.click())
  await page2.waitForTimeout(1500)
  const seenAfter = await onScreen()

  const was = new Set(seenBefore)
  const fresh = seenAfter.filter((x) => !was.has(x)).length

  console.log('')
  console.log(`  first screenful: ${seenBefore.length} pieces before, ${seenAfter.length} after`)
  /*
    A third of the screenful, not merely non-zero. The first passing run
    reported "2 of 33 are new" - a correct rotation that a visitor would
    swear did nothing, which is the complaint this whole thread is about.
    The offset is now restricted to the middle half of the grid, so a weak
    re-deal is a failure rather than bad luck.
  */
  check(
    'Shuffle visibly re-deals the first screenful',
    fresh >= Math.floor(seenAfter.length / 3),
    `${fresh} of ${seenAfter.length} are new`,
  )
  await page2.close()
}

/* ---------- turning it off restores the dealt order ---------- */
{
  /* Collapsing the expanded tile is what restores the dealt order now. */
  await page.evaluate(() => document.querySelector('.pf-item.is-expanded')?.click())
  await page.waitForTimeout(1400)
  const restored = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const keys = tiles.map((el, i) => hrefOf(el) ?? `solo:${i}`)
    let clashes = 0
    for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1]) clashes += 1
    return {clashes, expanded: !!document.querySelector('.pf-item.is-expanded')}
  })
  console.log('')
  check('collapsing clears the gathered state', !restored.expanded)
  /*
    The dealt order's defining property is that no two neighbours share a
    project. If restoring left the gathered run in place, this would be a
    large number - so it tests the restore by its consequence rather than by
    comparing a list of ids.
  */
  check(
    'and the grid is back to the dealt order, with the project spaced out again',
    restored.clashes === 0,
    `${restored.clashes} adjacent same-project pair(s)`,
  )
}

await page.close()

/* ---------- and none of this exists on production ---------- */
{
  const prod = await browser.newPage({viewport: {width: 1440, height: 900}})
  let reached = true
  try {
    await prod.goto(`${PROD}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  } catch {
    reached = false
  }
  console.log('')
  if (!reached) {
    console.log(`  (${PROD} unreachable; the gating check did not run)`)
  } else {
    const leaked = await prod.evaluate(() => ({
      toggle: !!document.querySelector('#pf-gather'),
      tag: !!document.querySelector('.pf-tag'),
    }))
    check('production has no Gather toggle', !leaked.toggle)
  }
  await prod.close()
}

await browser.close()
if (failures) {
  console.log('')
  console.log('--- failed checks ---')
  for (const f of failed) console.log(`  FAIL  ${f}`)
}
console.log(
  failures === 0
    ? '\nGather brings a project together and leaves the visitor where they were.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
