/*
  Does a merch gather land inside the window on a desktop?

  Chris: "the way it puts together is not fully in the viewport, so you kind
  of have to scroll down a little bit (on desktop that is)".

  Opens several shirts in the Merch & Apparel view at common laptop window
  sizes (inner heights, after the browser's own toolbars) and reports, for
  each: the opened shirt's height, the gathered set's height, where the set
  sits in the window after the gather settles, and how much of it is cut off
  at the bottom or top.

  READ-ONLY.

  Usage: node scripts/measure-merch-fit.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const SIZES = [
  [1280, 680],
  [1440, 760],
  [1536, 730],
  [1920, 950],
  // Wide and short: the Merch test's 2560x1000 case.
  [2560, 1000],
]

const browser = await chromium.launch()
for (const [w, h] of SIZES) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  console.log(`\n${w}x${h}`)
  // First, middle and last shirts on the page - a click near the top, the
  // middle and the bottom of the window lands differently.
  for (const pick of ['first', 'middle', 'last']) {
    // A fresh page for each, so nothing from the last gather carries over.
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    await page.waitForSelector('#pf-grid .pf-item', {state: 'visible'})
    await page.waitForTimeout(2500)
    await page.click('.pf-btn[data-filter=".merch-apparel"]')
    await page.waitForTimeout(1000)
    const idx = await page.evaluate((pick) => {
      const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
      const shown = all
        .map((el, i) => ({el, i}))
        .filter(({el}) => getComputedStyle(el).display !== 'none' && el.dataset.merch === 'lead')
      const k = pick === 'first' ? 0 : pick === 'middle' ? Math.floor(shown.length / 2) : shown.length - 1
      return shown[k]?.i ?? -1
    }, pick)
    if (idx < 0) continue
    const tile = page.locator('#pf-grid .pf-item').nth(idx)
    await tile.scrollIntoViewIfNeeded()
    // Click it where it sits in a resting window - centred, as a visitor scrolling down would meet it.
    await tile.evaluate((el) => el.scrollIntoView({block: 'center'}))
    await page.waitForTimeout(400)
    const title = await tile.locator('.pf-item__img').getAttribute('alt')
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(2200)
    const r = await page.evaluate(() => {
      const grid = document.querySelector('#pf-grid')
      const opened = grid.querySelector('.pf-item.is-expanded')
      const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
      // A piece with no case study opens alone: no link is not a project.
      const h = href(opened)
      const set = Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => el === opened || (h && href(el) === h && getComputedStyle(el).display !== 'none'),
      )
      let top = Infinity
      let bottom = -Infinity
      for (const el of set) {
        const b = el.getBoundingClientRect()
        top = Math.min(top, b.top)
        bottom = Math.max(bottom, b.bottom)
      }
      const o = opened.getBoundingClientRect()
      const members = set.map((el) => {
        const b = el.getBoundingClientRect()
        // The opened piece's museum label (preview), which adds height under it.
        const lab = el === opened ? el.querySelector('.pf-item__label') : null
        const lh = lab && getComputedStyle(lab).display !== 'none' ? ` label ${Math.round(lab.getBoundingClientRect().height)}px` : ''
        const role = el === opened ? 'OPENED' : el.classList.contains('is-card') ? 'BLOCK' : el.classList.contains('is-minor') ? 'minor' : 'near'
        return `${role} ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}${lh} ${(el.querySelector('.pf-item__img')?.getAttribute('alt') ?? '').replace(/[\u200b-\u200f\u2060-\u2064\ufeff]/g, '').slice(0, 40)}`
      })
      return {
        members,
        scrollY: Math.round(scrollY),
        maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight),
        n: set.length,
        openedH: Math.round(o.height),
        openedW: Math.round(o.width),
        setTop: Math.round(top),
        setBottom: Math.round(bottom),
        setH: Math.round(bottom - top),
        vh: innerHeight,
      }
    })
    const cutBottom = Math.max(0, r.setBottom - r.vh)
    const cutTop = Math.max(0, -r.setTop)
    console.log(
      `  ${pick.padEnd(6)} ${String(title).slice(0, 40).padEnd(40)} ${r.n} pieces  shirt ${r.openedW}x${r.openedH}  set ${r.setH}px tall, ${r.setTop}..${r.setBottom} of ${r.vh}  ` +
        (cutBottom || cutTop ? `CUT ${cutTop}px top, ${cutBottom}px bottom` : 'fits'),
    )
    if (cutBottom || cutTop) {
      console.log(`         scrolled ${r.scrollY} of ${r.maxScroll}`)
      for (const m of r.members) console.log(`         ${m}`)
    }
  }
  await page.close()
}
await browser.close()
