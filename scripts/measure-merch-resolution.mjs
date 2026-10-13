/*
  Are the pictures in the merch view sharp?

  Chris: "let's make sure the resolutions are good looking at this view".
  The grid's images are requested with a `sizes` promise written for the
  main grid - a seventh of the window on desktop, a quarter on a phone - and
  the merch view draws them at a fifth (desktop) and HALF (phone), with an
  opened shirt at two fifths or the full width. A browser that believes the
  promise downloads a file for the smaller size and stretches it.

  So, per picture: the pixels the screen needs (drawn width x device pixel
  ratio) against the pixels the file it actually loaded has. Under 1.0 is
  stretched. Measured at rest and with a shirt opened, on a 2x laptop and a
  3x phone - the screens a client is actually holding.

  READ-ONLY.

  Usage: node scripts/measure-merch-resolution.mjs [base-url] [title-to-open]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const NAME = process.argv[3] ?? 'More Kilos Tee'

const measure = (page) =>
  page.evaluate(() => {
    const dpr = window.devicePixelRatio
    return Array.from(document.querySelectorAll('#pf-grid .pf-item'))
      .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0)
      .map((el) => {
        const img = el.querySelector('.pf-item__img')
        const r = img.getBoundingClientRect()
        // The drawn box can be wider than the picture when it is contained;
        // what matters is the larger of the two sides the image fills.
        const needW = r.width * dpr
        const needH = r.height * dpr
        /*
          THE FILE'S REAL WIDTH, NOT naturalWidth.

          The first run of this reported 128px files on a phone that had
          actually loaded w=480. For an image chosen from a srcset by a w
          descriptor, naturalWidth is DENSITY-CORRECTED - the file's width
          divided by the density the browser picked it for - so it reads in
          CSS pixels, not file pixels, and every ratio built on it was wrong
          by that density. The width the CDN was asked for is in the URL;
          an image with no srcset reports its real width as normal.
        */
        const asked = Number(new URL(img.currentSrc || img.src).searchParams.get('w'))
        const fileW = asked || img.naturalWidth
        const fileH = asked ? (asked * img.naturalHeight) / img.naturalWidth : img.naturalHeight
        /*
          How far the file is scaled to fill its box, inverted: 1.0 is one
          file pixel per screen pixel, under 1 is stretched.
            cover    scaled until it covers BOTH sides, so the side that
                     needs more stretching decides: min of the two ratios
            contain  scaled until it fits, so the side that runs out first
                     decides: max of the two ratios
            natural  drawn at its own shape: width over width
        */
        const fit = getComputedStyle(img).objectFit
        const rw = fileW / needW
        const rh = fileH / needH
        const ratio = fit === 'cover' ? Math.min(rw, rh) : fit === 'contain' ? Math.max(rw, rh) : rw
        const role = el.classList.contains('is-expanded') ? 'opened' : el.classList.contains('is-minor') ? 'rest' : 'tile'
        return {
          title: img.getAttribute('alt'),
          role,
          need: Math.round(needW),
          file: fileW,
          ratio: +ratio.toFixed(2),
          upload: Number(new URL(img.currentSrc || img.src).pathname.match(/-(\d+)x\d+\./)?.[1] ?? 0),
          // For working out WHY a file is the size it is.
          src: (img.currentSrc || img.src).replace(/^https:\/\/cdn\.sanity\.io\/images\/[^/]+\/[^/]+\//, ''),
          offered: (img.getAttribute('srcset') ?? '').split(', ').map((c) => c.split(' ').pop()).join(' '),
          sizes: img.getAttribute('sizes'),
          loaded: img.complete,
          lazy: img.loading,
        }
      })
  })

const report = (label, rows) => {
  const soft = rows.filter((r) => r.ratio < 0.95)
  console.log(`\n${label}: ${rows.length} picture(s), ${soft.length} stretched`)
  for (const r of rows.sort((a, b) => a.ratio - b.ratio).slice(0, 12)) {
    const capped = r.upload && r.upload < r.need ? '  (the upload itself is only ' + r.upload + 'px)' : ''
    console.log(`  ${r.ratio.toFixed(2)}  ${r.role.padEnd(6)} needs ${String(r.need).padStart(4)}px, file ${String(r.file).padStart(4)}px  ${r.title.replace(/[\u200B-\u200D\u2060\uFEFF]+/g, '')}${capped}`)
  }
  for (const r of rows.slice(0, 2)) {
    console.log(`    why: loaded=${r.loaded} loading=${r.lazy} sizes="${r.sizes}" offered=[${r.offered}]`)
    console.log(`         src ${r.src}`)
  }
  return soft.length
}

const browser = await chromium.launch()
let total = 0
for (const [w, h, dpr, name] of [
  [1440, 900, 2, 'laptop 1440 @2x'],
  [390, 844, 3, 'phone 390 @3x'],
]) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: dpr})
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible'})
  await page.waitForTimeout(2000)
  await page.click('.pf-btn[data-filter=".merch-apparel"]')
  // Long enough for every visible picture to load whatever it is going to.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(3000)
  total += report(`${name}, merch view at rest`, await measure(page))

  const i = await page.evaluate((n) => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    return all.findIndex((el) => el.querySelector('.pf-item__img')?.getAttribute('alt')?.includes(n) && getComputedStyle(el).display !== 'none')
  }, NAME)
  if (i >= 0) {
    const tile = page.locator('#pf-grid .pf-item').nth(i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(3500)
    total += report(`${name}, "${NAME}" opened`, await measure(page))
  }
  await ctx.close()
}
await browser.close()
console.log(`\n${total} stretched picture(s) across all views.`)
