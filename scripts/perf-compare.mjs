/*
  Measures what a visitor actually downloads, on the live Webflow site and on
  the Astro port, for the same pages.

  Why a real browser and not curl: Webflow's pages pull webflow.js, jQuery,
  ShareThis, the Meta Pixel and a Lottie loader, and several of those inject
  further requests once they run. Fetching the HTML and parsing out asset
  tags would miss all of it and flatter Webflow. Chromium records the whole
  waterfall.

  Sizes are wire bytes (`request.sizes().responseBodySize`), so gzip/brotli
  is already accounted for - this is transfer, not uncompressed weight.

  Usage: node scripts/perf-compare.mjs
*/
import {chromium} from 'playwright'

const PAIRS = [
  {name: 'home', webflow: 'https://www.rumeaudesign.co/', astro: 'https://preview.rumeau-design-co.pages.dev/'},
  {name: 'portfolio', webflow: 'https://www.rumeaudesign.co/portfolio', astro: 'https://preview.rumeau-design-co.pages.dev/portfolio'},
  {name: 'about', webflow: 'https://www.rumeaudesign.co/about', astro: 'https://preview.rumeau-design-co.pages.dev/about'},
]

const KB = (n) => (n / 1024).toFixed(0).padStart(6)

async function measure(browser, url) {
  const context = await browser.newContext({
    viewport: {width: 1440, height: 900},
    // Cold cache, so this is a first visit rather than a repeat one.
    bypassCSP: false,
  })
  const page = await context.newPage()

  const byType = {}
  const requests = []

  page.on('requestfinished', async (req) => {
    try {
      const sizes = await req.sizes()
      const type = req.resourceType()
      const bytes = (sizes.responseBodySize ?? 0) + (sizes.responseHeadersSize ?? 0)
      byType[type] = (byType[type] ?? 0) + bytes
      requests.push({url: req.url(), type, bytes})
    } catch {
      /* request torn down before sizes resolved; ignore */
    }
  })

  const t0 = Date.now()
  let status = 0
  try {
    const resp = await page.goto(url, {waitUntil: 'load', timeout: 60000})
    status = resp?.status() ?? 0
    // Let deferred/injected scripts (Webflow, pixel, ShareThis) actually run.
    await page.waitForTimeout(3500)
  } catch (err) {
    console.error(`  ! ${url} -> ${err.message}`)
  }
  const elapsed = Date.now() - t0

  const total = Object.values(byType).reduce((a, b) => a + b, 0)
  await context.close()
  return {status, elapsed, total, count: requests.length, byType, requests}
}

const browser = await chromium.launch()
const results = []

for (const pair of PAIRS) {
  console.log(`\n=== ${pair.name} ===`)
  const wf = await measure(browser, pair.webflow)
  const as = await measure(browser, pair.astro)
  results.push({pair, wf, as})

  const types = [...new Set([...Object.keys(wf.byType), ...Object.keys(as.byType)])].sort()
  console.log(''.padEnd(14) + 'Webflow'.padStart(10) + 'Astro'.padStart(10) + 'change'.padStart(12))
  for (const t of types) {
    const a = wf.byType[t] ?? 0
    const b = as.byType[t] ?? 0
    const delta = a === 0 ? (b ? 'new' : '-') : `${(((b - a) / a) * 100).toFixed(0)}%`
    console.log(t.padEnd(14) + KB(a) + 'KB' + KB(b) + 'KB' + delta.padStart(12))
  }
  const delta = (((as.total - wf.total) / wf.total) * 100).toFixed(0)
  console.log('TOTAL'.padEnd(14) + KB(wf.total) + 'KB' + KB(as.total) + 'KB' + (delta + '%').padStart(12))
  console.log('requests'.padEnd(14) + String(wf.count).padStart(8) + '  ' + String(as.count).padStart(8))
  console.log('load (ms)'.padEnd(14) + String(wf.elapsed).padStart(8) + '  ' + String(as.elapsed).padStart(8))

  // The single heaviest things on each side, which is usually where the
  // argument actually is.
  const top = (r, label) => {
    const items = r.requests.sort((x, y) => y.bytes - x.bytes).slice(0, 5)
    console.log(`\n  heaviest on ${label}:`)
    for (const i of items) {
      console.log(`    ${KB(i.bytes)}KB  ${i.type.padEnd(10)} ${i.url.slice(0, 96)}`)
    }
  }
  top(wf, 'Webflow')
  top(as, 'Astro')
}

console.log('\n\n=== summary ===')
let wfAll = 0
let asAll = 0
for (const {pair, wf, as} of results) {
  wfAll += wf.total
  asAll += as.total
  const d = (((as.total - wf.total) / wf.total) * 100).toFixed(0)
  console.log(`${pair.name.padEnd(12)} Webflow ${KB(wf.total)}KB   Astro ${KB(as.total)}KB   ${d}%`)
}
console.log(
  `${'ALL PAGES'.padEnd(12)} Webflow ${KB(wfAll)}KB   Astro ${KB(asAll)}KB   ` +
    `${(((asAll - wfAll) / wfAll) * 100).toFixed(0)}%`,
)

await browser.close()
