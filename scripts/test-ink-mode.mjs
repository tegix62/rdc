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
    pressed       aria-pressed and .is-active, the same state signal the other
                  buttons in that row use
    press stock   the archive is white/black, not one of the shelved riso colours
    filtered      the tiles are genuinely treated, and the controls are not
    turns off     and back, leaving no data-ink behind
    persists      a reload comes back in archive view without flashing colour
    nowhere else  no stray button on a page it was just removed from
    in palette    navy like the rest of the site, not the near-black it was
    no orphan     the zoom pair stays on one line on a phone

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
const box = await toggle.boundingBox().catch(() => null)
const shuffleBox = await page.locator('#pf-shuffle').boundingBox().catch(() => null)
check(
  'it is the same height as the other controls',
  Boolean(box && shuffleBox && Math.abs(box.height - shuffleBox.height) < 2),
  box && shuffleBox ? `${Math.round(box.height)}px vs ${Math.round(shuffleBox.height)}px` : 'no box',
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
  'the button reads as pressed, like the other filters',
  (await toggle.getAttribute('aria-pressed')) === 'true' &&
    (await toggle.evaluate((el) => el.classList.contains('is-active'))),
)

// The archive is the white/black press stock, not one of the shelved riso
// colours - a saved `paper` from an older visit must not resurrect those.
check('lands on the press stock', inkAfter === 'press', `data-ink=${inkAfter}`)

// The artwork is actually being treated, not just an attribute set.
const filtered = await page
  .locator('.pf-item__img')
  .first()
  .evaluate((el) => getComputedStyle(el).filter)
check('the tiles are actually filtered', filtered !== 'none', filtered)

// The controls must stay out of the treatment, or the buttons that turn it on
// and off read as part of the artwork.
const btnFilter = await toggle.evaluate((el) => getComputedStyle(el).filter)
check('the controls are not filtered', btnFilter === 'none', btnFilter)

// --- and back ---------------------------------------------------------------
await toggle.click()
await page.waitForTimeout(400)
check('clicking again returns to the colour grid', (await page.getAttribute('html', 'data-ink')) === null)
check('and the button is unpressed', (await toggle.getAttribute('aria-pressed')) === 'false')

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
  The orphan. On a phone the flat control row wrapped wherever it ran out of
  width and left `+` alone on a line under eight other buttons - visible in a
  photo Chris sent, invisible to every check. `-` and `+` are one control in two
  halves, so they sharing a line is the thing to assert.
*/
const minus = await page.locator('#pf-minus').boundingBox().catch(() => null)
const plus = await page.locator('#pf-plus').boundingBox().catch(() => null)
check(
  'the zoom pair stays on one line',
  Boolean(minus && plus && Math.abs(minus.y - plus.y) < 4),
  minus && plus ? `y ${Math.round(minus.y)} vs ${Math.round(plus.y)}` : 'no box',
)


await page.screenshot({path: 'ink-mode.png', fullPage: false})

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
