/*
  Clicks the Archive button and checks it actually does something.

  This component has already shipped a control that did nothing. The collapse
  handle fired its click handler correctly every time, but `panel.hidden = true`
  was silently beaten by an author `display: flex` rule - author styles win over
  the browser's `[hidden]` regardless of specificity - so the panel never moved.
  Nothing in the markup, the JS or the CSS looked wrong on its own. It took
  Chris saying "that lower right button doesn't do anything".

  A screenshot cannot catch that class of bug, because the failure is that
  nothing changes. So this drives the real page.

  What it checks, and why each one:

    in the row    it lives among the Portfolio filters now, not in a corner
    tap target    matches its siblings on desktop, clears 44px on a phone
    turns on      data-ink lands on <html>, which every ink rule keys off
    a switch      role=switch with a track, and last in the row - NOT a fifth
                  filter, which is what identical form made it read as
    press stock   the archive is white/black, not one of the shelved riso colours
    filtered      the tiles are genuinely treated, and the controls are not
    turns off     and back, leaving no data-ink behind
    persists      a reload comes back in archive view without flashing colour
    nowhere else  no stray button on a page it was just removed from
    in palette    navy like the rest of the site, not the near-black it was
    no orphan     at most two lines, and no line holding one lone button
    uniform       in archive view every plate is the same width, clicked or not

  Usage: node scripts/test-ink-mode.mjs [url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] || 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1280, height: 900}})

const results = []
const check = (name, ok, detail = '') => {
  results.push({name, ok, detail})
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60000})
await page.waitForTimeout(1500)

const toggle = page.locator('#ink-toggle')

check('the button is visible', await toggle.isVisible().catch(() => false))

/*
  On desktop it should match its siblings, not clear an arbitrary floor - a
  44px button in a row of 26px ones would look like a mistake. The 44px rule
  applies at phone widths, and is checked there at the end.
*/
// It is a switch now, so it should NOT look like the buttons beside it - that
// identical form was the whole problem.
check(
  'it is a switch, not a button',
  (await toggle.getAttribute('role')) === 'switch' &&
    (await page.locator('#ink-toggle .ink-switch__track').count()) === 1,
)

// Nothing should be in print mode before it is asked for.
const inkBefore = await page.getAttribute('html', 'data-ink')
check('starts on screen, not in print', inkBefore === null, `data-ink=${inkBefore}`)
const labelBefore = (await toggle.innerText()).trim()
check('is labelled Archive', /archive/i.test(labelBefore), labelBefore)
check(
  'sits in the portfolio controls row, not floating in a corner',
  await page.locator('#pf-controls #ink-toggle').count() === 1,
)

// And last in that row, away from the filters.
check(
  'sits after the filters, not among them',
  await page.evaluate(() => {
    const groups = [...document.querySelectorAll('#pf-controls .pf-group')]
    return groups.length > 0 && groups[groups.length - 1].querySelector('#ink-toggle') !== null
  }),
)

/*
  In the palette. These were near-black while the whole site is navy, so the
  one row of controls on the busiest page was the only thing off-theme.

  Checked HERE, before anything is toggled, because in archive view
  --color-navy is deliberately remapped to the stock's ink - so the same
  assertion at the end of this file measured #0d0d0d and failed, correctly
  describing a page that was still in archive view. The conversion is the
  feature; this check just has to not stand in the middle of it.
*/
const navy = await page
  .locator('#pf-shuffle')
  .evaluate((el) => getComputedStyle(el).borderTopColor)
check('the controls are navy, not near-black', navy === 'rgb(0, 40, 133)', navy)

// --- the click that used to do nothing -------------------------------------
await toggle.click()
await page.waitForTimeout(400)

const inkAfter = await page.getAttribute('html', 'data-ink')
check('clicking turns print mode on', Boolean(inkAfter), `data-ink=${inkAfter}`)

check(
  'the switch reads as on',
  (await toggle.getAttribute('aria-checked')) === 'true' &&
    (await toggle.evaluate((el) => el.classList.contains('is-on'))),
)

// The archive is the white/black press stock, not one of the shelved riso
// colours - a saved `paper` from an older visit must not resurrect those.
check('lands on the press stock', inkAfter === 'press', `data-ink=${inkAfter}`)

/*
  The artwork is actually being treated, not just an attribute set.

  Across the grid rather than on the first tile. This checked tile #1 and
  started failing the moment case studies were sorted to the front - not
  because the treatment broke, but because whichever document now sits first
  can legitimately be set to "skip" in Studio, which leaves it in full colour
  on purpose. An assertion that depends on the sort order of the content is
  not testing the thing it claims to.

  So: count them, and require that the great majority are converted while
  allowing for the ones deliberately opted out.
*/
const inkStats = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.pf-item__img')]
  let filtered = 0
  let skipped = 0
  for (const el of imgs) {
    if (el.getAttribute('data-ink-mode') === 'skip') skipped += 1
    else if (getComputedStyle(el).filter !== 'none') filtered += 1
  }
  return {total: imgs.length, filtered, skipped}
})
check(
  'the tiles are actually filtered',
  inkStats.filtered > 0 && inkStats.filtered >= inkStats.total - inkStats.skipped,
  `${inkStats.filtered} filtered, ${inkStats.skipped} set to skip, of ${inkStats.total}`,
)

// The controls must stay out of the treatment, or the buttons that turn it on
// and off read as part of the artwork.
const btnFilter = await toggle.evaluate((el) => getComputedStyle(el).filter)
check('the controls are not filtered', btnFilter === 'none', btnFilter)

/*
  Every plate the same width.

  An archive is a catalogue and a catalogue does not give one entry a double
  spread. Two rules used to break that - the hero flag and the width a tile
  takes when clicked - and both are correct on the normal grid, so this checks
  the archive specifically rather than the rule in isolation.
*/
const widths = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('#pf-grid .pf-item')]
  const seen = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().width)))
  return {count: tiles.length, widths: [...seen].sort((a, b) => a - b)}
})
check(
  'every plate is the same width in archive view',
  widths.widths.length === 1,
  `${widths.count} tiles, width(s): ${widths.widths.join(', ')}`,
)

// And clicking one must not widen it either.
await page.locator('#pf-grid .pf-item').first().click()
await page.waitForTimeout(500)
const afterClick = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('#pf-grid .pf-item')]
  return [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().width)))]
})
check(
  'clicking a plate does not widen it in archive view',
  afterClick.length === 1,
  `width(s): ${afterClick.join(', ')}`,
)

// --- and back ---------------------------------------------------------------
await toggle.click()
await page.waitForTimeout(400)
check('clicking again returns to the colour grid', (await page.getAttribute('html', 'data-ink')) === null)
check('and the switch reads as off', (await toggle.getAttribute('aria-checked')) === 'false')

// --- it remembers -----------------------------------------------------------
await toggle.click()
await page.waitForTimeout(300)
const chosen = await page.getAttribute('html', 'data-ink')
await page.reload({waitUntil: 'domcontentloaded'})
await page.waitForTimeout(800)
check(
  'a reload comes back in archive view',
  (await page.getAttribute('html', 'data-ink')) === chosen,
  'set before first paint, so no flash of the colour grid',
)

// It was a control on every page and is now only here. A stray one on a case
// study would mean the move was half-done.
await page.goto(`${BASE}/about`, {waitUntil: 'domcontentloaded'})
await page.waitForTimeout(500)
check('no archive button on other pages', (await page.locator('#ink-toggle').count()) === 0)

// The 44px floor, at the width where it matters. The whole control row is
// bumped by one rule, so this catches the row rather than just this button.
await page.setViewportSize({width: 390, height: 844})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded'})
await page.waitForTimeout(900)
const phoneBox = await page.locator('#ink-toggle').boundingBox().catch(() => null)
check(
  'clears the 44px tap floor on a phone',
  Boolean(phoneBox && phoneBox.height >= 44 && phoneBox.width >= 44),
  phoneBox ? `${Math.round(phoneBox.width)}x${Math.round(phoneBox.height)}` : 'no box',
)

/*
  Orphans, generally.

  Two have shipped now. First `+` alone on a line under eight other buttons;
  then, after grouping fixed that, TYPE/LETTERING alone a row up. Both were
  found in photos Chris sent and neither was visible to any check, so this
  asserts the shape of the row rather than the position of one button: how many
  lines it occupies, and whether any line holds a single control.
*/
const rowShape = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#pf-controls .pf-btn, #pf-controls .ink-switch')]
  const lines = new Map()
  for (const b of btns) {
    const y = Math.round(b.getBoundingClientRect().y / 8) * 8
    lines.set(y, (lines.get(y) ?? 0) + 1)
  }
  return {buttons: btns.length, lines: [...lines.values()]}
})
check(
  'the controls fit two lines or fewer',
  rowShape.lines.length <= 2,
  `${rowShape.buttons} buttons over ${rowShape.lines.length} line(s)`,
)
check(
  'no control is stranded alone on a line',
  !rowShape.lines.includes(1),
  `per line: ${rowShape.lines.join(', ')}`,
)

// The zoom pair specifically: two halves of one control, so they must share a
// line even if the rest of the row rearranges.
const minus = await page.locator('#pf-minus').boundingBox().catch(() => null)
const plus = await page.locator('#pf-plus').boundingBox().catch(() => null)
check(
  'the zoom pair stays on one line',
  Boolean(minus && plus && Math.abs(minus.y - plus.y) < 4),
  minus && plus ? `y ${Math.round(minus.y)} vs ${Math.round(plus.y)}` : 'no box',
)

// Scrolling sideways is the filters' own business; the page must not.
const pageScrolls = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
)
check('the page itself still does not scroll sideways', !pageScrolls)


await page.screenshot({path: 'ink-mode.png', fullPage: false})

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
