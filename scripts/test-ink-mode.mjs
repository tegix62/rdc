/*
  Clicks the print mode button and checks it actually does something.

  This component has already shipped a control that did nothing. The collapse
  handle fired its click handler correctly every time, but `panel.hidden = true`
  was silently beaten by an author `display: flex` rule - author styles win over
  the browser's `[hidden]` regardless of specificity - so the panel never moved.
  Nothing in the markup, the JS or the CSS looked wrong on its own. It took
  Chris saying "that lower right button doesn't do anything".

  A screenshot cannot catch that class of bug, because the failure is that
  nothing changes. So this drives the real page.

  What it checks, and why each one:

    visible       the button exists and is on screen at all
    tap target    44px floor, the same one the page audit enforces
    turns on      data-ink lands on <html>, which is what every ink rule keys off
    swatches      the paper stocks appear - they are hidden until print mode is
                  on, and that hiding is the exact mechanism that broke before
    label flips   "Print mode" -> "Screen mode", so the button says what it does
    stock switch  clicking a swatch actually repaints the page
    turns off     and back, leaving no data-ink behind
    persists      a reload comes back in print mode rather than flashing colour

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
const papers = page.locator('#ink-papers')

check('the button is visible', await toggle.isVisible().catch(() => false))

const box = await toggle.boundingBox().catch(() => null)
check(
  'the button meets the 44px tap floor',
  Boolean(box && box.height >= 44 && box.width >= 44),
  box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no box',
)

// Nothing should be in print mode before it is asked for.
const inkBefore = await page.getAttribute('html', 'data-ink')
check('starts on screen, not in print', inkBefore === null, `data-ink=${inkBefore}`)
check('paper stocks are hidden until print mode is on', !(await papers.isVisible()))

const labelBefore = (await toggle.innerText()).trim()
check('reads "Print mode" while on screen', /print mode/i.test(labelBefore), labelBefore)

// --- the click that used to do nothing -------------------------------------
await toggle.click()
await page.waitForTimeout(400)

const inkAfter = await page.getAttribute('html', 'data-ink')
check('clicking turns print mode on', Boolean(inkAfter), `data-ink=${inkAfter}`)

check(
  'the paper stocks appear',
  await papers.isVisible(),
  'this is the exact mechanism that silently broke before',
)

const labelAfter = (await toggle.innerText()).trim()
check('the label flips to "Screen mode"', /screen mode/i.test(labelAfter), labelAfter)

check(
  'the button fills in so the corner reads as active',
  (await toggle.getAttribute('data-active')) === 'true',
)

// The page actually repaints, not just the attribute.
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
check('the page is painted on stock', bg !== 'rgb(255, 255, 255)' || inkAfter === 'press', bg)

// --- switching stock --------------------------------------------------------
const swatches = papers.locator('[data-paper]')
const swatchCount = await swatches.count()
check('every stock is offered', swatchCount === 6, `${swatchCount} swatches`)

if (swatchCount > 1) {
  await swatches.nth(2).click()
  await page.waitForTimeout(300)
  const changed = await page.getAttribute('html', 'data-ink')
  check('choosing a stock switches it', changed !== inkAfter, `${inkAfter} -> ${changed}`)
}

// --- and back ---------------------------------------------------------------
await toggle.click()
await page.waitForTimeout(400)
check('clicking again returns to screen', (await page.getAttribute('html', 'data-ink')) === null)
check('the stocks go away again', !(await papers.isVisible()))

// --- it remembers -----------------------------------------------------------
await toggle.click()
await page.waitForTimeout(300)
const chosen = await page.getAttribute('html', 'data-ink')
await page.reload({waitUntil: 'domcontentloaded'})
await page.waitForTimeout(800)
check(
  'a reload comes back in print mode',
  (await page.getAttribute('html', 'data-ink')) === chosen,
  'set before first paint, so no flash of colour',
)

await page.screenshot({path: 'ink-mode.png', fullPage: false})

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
