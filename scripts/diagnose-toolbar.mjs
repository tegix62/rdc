/*
  Why do Shuffle and Gather do nothing?

  Chris: "Gather and Shuffle aren't doing anything past looking clicked-on
  when clicked". Shuffle is long-standing code that worked, so whatever is
  wrong is almost certainly not in gather - it is something killing the
  script, or killing those listeners, for both.

  This reports rather than asserts. It captures page errors and unhandled
  rejections first, because a script that throws part-way through attaches
  every listener before the throw and none after it - and the pattern of
  WHICH buttons still work locates the throw better than any guess.

  READ-ONLY.

  Usage: node scripts/diagnose-toolbar.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'attached', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(3000)

console.log(`${BASE}/portfolio\n`)

console.log(`  page errors: ${errors.length}`)
for (const e of errors) console.log(`    ${e}`)

/* Is Isotope even running? Masonry sets inline transforms on every item. */
const grid = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.pf-grid .pf-item')]
  const positioned = items.filter((el) => {
    const s = getComputedStyle(el)
    return s.position === 'absolute' || s.transform !== 'none'
  }).length
  return {
    items: items.length,
    positioned,
    shuffle: !!document.querySelector('#pf-shuffle'),
    gather: !!document.querySelector('#pf-gather'),
    gatherText: document.querySelector('#pf-gather')?.textContent?.trim() ?? null,
  }
})
console.log(`\n  ${grid.items} tiles, ${grid.positioned} positioned by Isotope`)
console.log(`  #pf-shuffle present: ${grid.shuffle}`)
console.log(`  #pf-gather present:  ${grid.gather}  text "${grid.gatherText}"`)

/* A fingerprint of DOM order, so a re-deal is visible as a change. */
const order = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.pf-grid .pf-item')]
      .map((el) => el.querySelector('img')?.getAttribute('alt')?.slice(0, 18) ?? '?')
      .join('|'),
  )

const before = await order()
await page.evaluate(() => document.querySelector('#pf-shuffle')?.click())
await page.waitForTimeout(1200)
const afterShuffle = await order()
console.log(`\n  Shuffle changed the DOM order: ${before !== afterShuffle}`)

await page.evaluate(() => document.querySelector('#pf-gather')?.click())
await page.waitForTimeout(500)
const gatherState = await page.evaluate(() => ({
  text: document.querySelector('#pf-gather')?.textContent?.trim() ?? null,
  pressed: document.querySelector('#pf-gather')?.getAttribute('aria-pressed') ?? null,
}))
console.log(`  Gather after one click: text "${gatherState.text}", aria-pressed ${gatherState.pressed}`)

/*
  WHICH LISTENERS SURVIVED.

  The toolbar's listeners are attached in source order: filters, shuffle,
  zoom, then much later the gather toggle. If a throw happened in between,
  the earlier ones work and the later ones do not, and the boundary says
  roughly where.
*/
const probe = await page.evaluate(async () => {
  const click = (sel) => document.querySelector(sel)?.click()
  const out = {}

  const o0 = [...document.querySelectorAll('.pf-grid .pf-item')].length
  const colBefore = document.querySelector('.pf-sizer')?.offsetWidth ?? null
  click('#pf-plus')
  await new Promise((r) => setTimeout(r, 600))
  out.zoomWorks = (document.querySelector('.pf-sizer')?.offsetWidth ?? null) !== colBefore

  const firstFilter = document.querySelector('[data-filter]:not(.is-active)')
  if (firstFilter) {
    firstFilter.click()
    await new Promise((r) => setTimeout(r, 800))
    const shown = [...document.querySelectorAll('.pf-grid .pf-item')].filter(
      (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
    ).length
    out.filterWorks = shown !== o0
    out.filterShown = shown
    out.filterTotal = o0
  }
  return out
})
console.log(`\n  zoom (+) works:   ${probe.zoomWorks}`)
console.log(`  filter works:     ${probe.filterWorks} (${probe.filterShown} of ${probe.filterTotal} shown)`)

console.log(`\n  page errors after interaction: ${errors.length}`)
for (const e of errors) console.log(`    ${e}`)

/*
  THE HYPOTHESIS: A DRAGGY TAP ON A TOUCH DEVICE.

  Everything above passes on a desktop viewport, so the fault is in a
  configuration not yet tested. The page deck's drag listeners transform
  <main> while a horizontal gesture is in progress - and the portfolio
  toolbar lives INSIDE <main>. A real thumb tap is never perfectly still,
  so a tap that drifts past the 12px axis-lock threshold would move the
  button out from under the finger mid-tap, and the browser does not fire
  click when the element leaves the touch point.

  That would look exactly like what Chris described: the button takes its
  pressed styling and then nothing happens. It would also affect every
  button and link on every page, not just these two.

  Measured on a touch viewport, with a tap that drifts 20px - a slightly
  unsteady thumb, not a swipe.
*/
const touch = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
const touchErrors = []
touch.on('pageerror', (e) => touchErrors.push(`pageerror: ${e.message}`))
await touch.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await touch.waitForTimeout(3000)

const draggyTap = await touch.evaluate(async (drift) => {
  const btn = document.querySelector('#pf-shuffle')
  if (!btn) return {error: 'no shuffle button'}
  const r = btn.getBoundingClientRect()
  const x0 = Math.round(r.left + r.width / 2)
  const y0 = Math.round(r.top + r.height / 2)

  let clicked = false
  btn.addEventListener('click', () => (clicked = true), {once: true})

  const mk = (x, y) => new Touch({identifier: 1, target: btn, clientX: x, clientY: y, pageX: x, pageY: y})
  const fire = (type, x, y) => {
    const t = mk(x, y)
    btn.dispatchEvent(
      new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  fire('touchstart', x0, y0)
  for (let i = 1; i <= 3; i++) {
    await new Promise((res) => setTimeout(res, 16))
    fire('touchmove', x0 - (drift * i) / 3, y0 + 2)
  }
  const mainShift = (() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('main')).transform)
    return Math.round(m.m41)
  })()
  fire('touchend', x0 - drift, y0 + 2)

  await new Promise((res) => setTimeout(res, 500))
  return {mainShift, clicked, barInsideMain: !!document.querySelector('main #pf-shuffle')}
}, 20)

console.log(`\n  --- touch viewport, a tap that drifts 20px ---`)
console.log(`  the toolbar is inside <main>:        ${draggyTap.barInsideMain}`)
console.log(`  <main> shifted mid-tap by:           ${draggyTap.mainShift}px`)
console.log(`  (a non-zero shift means a tap moves the page under the finger)`)
console.log(`  touch page errors: ${touchErrors.length}`)
for (const e of touchErrors) console.log(`    ${e}`)

await touch.close()
await browser.close()
