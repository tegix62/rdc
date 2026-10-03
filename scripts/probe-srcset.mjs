/*
  Which candidate the browser picks, and what that URL actually returns.

  The expanded-resolution check found a contradiction worth resolving before
  changing anything: currentSrc ended in `?w=800`, yet the loaded file
  measured 326px wide. Both cannot be true, and they point at different bugs:

    - if the browser picked a SMALL candidate, the `sizes` promise is the
      fault and raising the srcset ceiling alone would change nothing;
    - if it picked w=800 and the CDN returned 326px, the request is being
      clamped somewhere and sizes is innocent.

  326 is suspiciously exactly 17vw of 1920, which is what `sizes` declares -
  so the first is likelier. But "likelier" is how this grid has been wrong
  twice today, so this prints the whole srcset, the exact currentSrc, and the
  real width of every candidate fetched directly.

  READ-ONLY.

  Usage: node scripts/probe-srcset.mjs [base-url] [match]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const WANTED = (process.argv[3] ?? 'Luna Tee').toLowerCase()

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(3000)

const info = await page.evaluate((wanted) => {
  const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
  for (const img of document.querySelectorAll('.pf-grid .pf-item img')) {
    if (!strip(img.getAttribute('alt')).toLowerCase().includes(wanted)) continue
    return {
      alt: strip(img.getAttribute('alt')),
      src: img.getAttribute('src'),
      srcset: img.getAttribute('srcset'),
      sizes: img.getAttribute('sizes'),
      currentSrc: img.currentSrc,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      complete: img.complete,
      loading: img.getAttribute('loading'),
      devicePixelRatio: window.devicePixelRatio,
    }
  }
  return null
}, WANTED)

if (!info) {
  console.log(`no tile matching "${WANTED}"`)
  await browser.close()
  process.exit(1)
}

console.log(info.alt)
console.log(`  devicePixelRatio  ${info.devicePixelRatio}`)
console.log(`  loading           ${info.loading ?? '(none)'}`)
console.log(`  complete          ${info.complete}`)
console.log(`  naturalWidth      ${info.naturalW}x${info.naturalH}`)
console.log(`  sizes             ${info.sizes}`)
console.log(`\n  src attribute:\n    ${info.src}`)
console.log(`\n  currentSrc (what the browser chose):\n    ${info.currentSrc}`)
console.log('\n  srcset candidates:')
for (const part of (info.srcset ?? '').split(',')) {
  const t = part.trim()
  if (t) console.log(`    ${t}`)
}

/*
  Fetch each candidate and read the real pixel width out of the bytes. The
  descriptor in a srcset is the author's claim; this is the file.
*/
console.log('\n  what each candidate URL actually returns:')
const urls = [
  ...new Set(
    [info.src, ...(info.srcset ?? '').split(',').map((p) => p.trim().split(/\s+/)[0])].filter(Boolean),
  ),
]
for (const u of urls) {
  const dims = await page.evaluate(
    (url) =>
      new Promise((resolve) => {
        const i = new Image()
        i.onload = () => resolve({w: i.naturalWidth, h: i.naturalHeight})
        i.onerror = () => resolve(null)
        i.src = url
      }),
    u,
  )
  const q = u.split('?')[1] ?? '(no query)'
  console.log(`    ${dims ? `${dims.w}x${dims.h}`.padEnd(12) : 'FAILED      '} ${q}`)
}

await browser.close()
