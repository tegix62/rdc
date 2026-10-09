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
  check('the Gather toggle starts off', toggle.pressed === 'false', `reads "${toggle.text}"`)
}

/*
  Scroll well down the page first. Gathering at the very top would hide a
  broken anchor, because there is nowhere above to be thrown to.
*/
await page.evaluate(() => window.scrollTo({top: 1600, behavior: 'instant'}))
await page.waitForTimeout(400)

await page.click('#pf-gather')
await page.waitForTimeout(300)

const pressed = await page.evaluate(
  () => document.querySelector('#pf-gather')?.getAttribute('aria-pressed'),
)
check('clicking it turns gather on', pressed === 'true')

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
  const onScreen = tiles.filter((el) => {
    const r = el.getBoundingClientRect()
    return r.top > 100 && r.bottom < innerHeight - 100
  })
  const target = onScreen.find((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
  if (!target) return null
  target.setAttribute('data-gather-probe', '')
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
  check('a gatherable tile is visible to click', false)
} else {
  console.log(`  clicked a tile from ${chosen.href} (${chosen.family} pieces)`)
  console.log(`  it sat ${chosen.top}px down the viewport, page scrolled to ${chosen.scrollY}`)

  await page.click('[data-gather-probe]')
  await page.waitForTimeout(1400)

  const after = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const probe = document.querySelector('[data-gather-probe]')
    const href = hrefOf(probe)
    const idx = tiles.map((el, i) => [hrefOf(el), i]).filter(([k]) => k === href).map(([, i]) => i)
    return {
      top: Math.round(probe.getBoundingClientRect().top),
      firstInDom: tiles[0] === probe,
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
  check('the clicked tile leads it', after.firstInDom)
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
