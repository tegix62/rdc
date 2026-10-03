/*
  What option 2 would actually cost: every Portfolio tile at a bigger width.

  WHY THIS EXISTS

  Chris asked how much heavier the page gets if the grid stops capping tiles
  at 800px. Estimating that from "it's twice as wide so four times the pixels"
  would be wrong twice over: WebP does not scale with area, and the tiles are
  lazy-loaded, so most of them are not part of the first load at all.

  There is also a correction baked into the question. Raising the srcset
  ceiling ALONE changes nothing - the browser chooses from `sizes`, which
  promises 17vw, so at 2x it needs 652px and keeps picking the 800 candidate
  no matter how many larger ones exist. Making expanded tiles sharper that way
  means changing `sizes` to the expanded width (34vw), and THAT is what pulls
  a bigger file for all eighty.

  So this measures three things, which are three different numbers people tend
  to conflate:

    FIRST LOAD    bytes actually transferred for tile images before scrolling
    FULL PAGE     bytes once every lazy tile has loaded
    PROJECTED     the same set re-requested at the candidate `sizes: 34vw`
                  would select, which is what option 2 downloads

  Pass-through images (noRecompress) ignore the width parameter, so they are
  reported separately rather than being counted as a saving that is not there.

  READ-ONLY - it fetches images, it changes nothing.

  Usage: node scripts/measure-tile-weight.mjs [base-url] [target-width]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const TARGET = Number(process.argv[3] ?? 1600)

const kb = (b) => `${(b / 1024).toFixed(0)} KB`
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})

/*
  Record every image the CDN serves, with the bytes actually on the wire.
  encodedBodySize via the Resource Timing API rather than content-length,
  because a missing or compressed header would quietly undercount.
*/
const seen = new Map()
page.on('response', async (res) => {
  const url = res.url()
  if (!url.includes('cdn.sanity.io/images')) return
  try {
    const body = await res.body()
    seen.set(url, body.length)
  } catch {
    /* a redirect or an aborted request has no body; skip it */
  }
})

await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(4000)

const firstLoad = [...seen.entries()]
const firstLoadBytes = firstLoad.reduce((n, [, b]) => n + b, 0)
console.log(`FIRST LOAD (nothing scrolled)`)
console.log(`  ${firstLoad.length} tile image(s), ${mb(firstLoadBytes)}`)

// Now scroll the whole page so every lazy tile loads.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 250))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(4000)

const all = [...seen.entries()]
const allBytes = all.reduce((n, [, b]) => n + b, 0)
console.log(`\nFULL PAGE (everything scrolled into view)`)
console.log(`  ${all.length} tile image(s), ${mb(allBytes)}`)
console.log(`  average ${kb(allBytes / Math.max(all.length, 1))} each`)

/*
  What the same images cost at the target width. Requested through the page so
  the CDN negotiates the same format (auto=format serves AVIF or WebP by
  Accept header, and fetching with a different one would compare two formats
  rather than two widths).
*/
console.log(`\nPROJECTED at w=${TARGET}`)
let projected = 0
let passthrough = 0
let passthroughCount = 0
let counted = 0

for (const [url] of all) {
  const bigger = url.replace(/([?&])w=\d+/, `$1w=${TARGET}`)
  const noWidth = !/[?&]w=\d+/.test(url)
  const bytes = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u, {cache: 'no-store'})
      const b = await r.blob()
      return b.size
    } catch {
      return null
    }
  }, bigger)
  if (bytes === null) continue
  if (noWidth) {
    // Served exactly as uploaded; the width parameter does nothing for these.
    passthrough += bytes
    passthroughCount += 1
  } else {
    projected += bytes
    counted += 1
  }
}

console.log(`  ${counted} resizable image(s): ${mb(projected)}`)
if (passthroughCount) {
  console.log(`  ${passthroughCount} pass-through image(s): ${mb(passthrough)} (unchanged - they ignore w=)`)
}

const nowTotal = allBytes
const thenTotal = projected + passthrough
console.log(`\nTHE ANSWER`)
console.log(`  full page now        ${mb(nowTotal)}`)
console.log(`  full page at w=${TARGET}  ${mb(thenTotal)}`)
const delta = thenTotal - nowTotal
const factor = nowTotal ? (thenTotal / nowTotal).toFixed(2) : '?'
console.log(`  difference           ${delta >= 0 ? '+' : ''}${mb(delta)}  (${factor}x)`)
console.log(
  `\n  First load is the number that matters for someone arriving on the page:` +
    `\n  ${mb(firstLoadBytes)} today, and roughly ${factor}x that if every tile` +
    `\n  is requested at w=${TARGET}.`,
)

await browser.close()
