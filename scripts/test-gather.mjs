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

console.log(`${BASE}/portfolio\n`)

/* ---------- the toggle exists and starts off ---------- */
const toggle = await page.evaluate(() => {
  const btn = document.querySelector('#pf-gather')
  return btn ? {text: btn.textContent.trim(), pressed: btn.getAttribute('aria-pressed')} : null
})

if (!toggle) {
  check('the Gather toggle is on the page', false, 'not found')
} else {
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
*/
await page.evaluate(() => document.querySelector('#pf-gather')?.click())
await page.waitForTimeout(300)

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

const pressed = await page.evaluate(
  () => document.querySelector('#pf-gather')?.getAttribute('aria-pressed'),
)
check('gather is active without having to be switched on', pressed === 'true')

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
  const dealt = await page.evaluate(() => {
    const el = document.querySelector('#pf-gather')
    el.click()
    return null
  })
  void dealt
  await page.waitForTimeout(1200)
  const restored = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const keys = tiles.map((el, i) => hrefOf(el) ?? `solo:${i}`)
    let clashes = 0
    for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1]) clashes += 1
    return {clashes, pressed: document.querySelector('#pf-gather')?.getAttribute('aria-pressed')}
  })
  console.log('')
  check('turning gather off switches the mode back', restored.pressed === 'false')
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
    const leaked = await prod.evaluate(() => !!document.querySelector('#pf-gather'))
    check('production has no Gather toggle', !leaked)
  }
  await prod.close()
}

await browser.close()
console.log(
  failures === 0
    ? '\nGather brings a project together and leaves the visitor where they were.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
