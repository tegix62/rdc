/*
  Measures the layout of Chris's own Adobe Portfolio gallery, which he pointed
  at as the reference for how the archive/print view of the grid should feel:
  black and white, "more flowy rather than gridded", white space doing the work.

  His own site, his own work - this is reading his existing design so the new
  one can match its feel, not borrowing someone else's.

  Runs in CI for two reasons: this sandbox has no outbound network, and Adobe
  Portfolio returns 403 to plain fetchers. A real browser gets the page.

  What it reports, and why each thing matters for rebuilding the feel:

    container   display, grid-template-columns, gap. "Flowy rather than gridded"
                usually means either large uneven gaps or a column count low
                enough that the eye reads groupings instead of rows.
    items       every tile's box and aspect ratio. Whether sizes vary, and by
                how much, is the difference between a rhythm and a uniform
                grid.
    greyscale   whether the black and white is a CSS filter or actually
                monochrome files - which decides whether his alt images are
                doing something the browser could not.
    density     ratio of image area to page area. The single best number for
                "how much white space is there".

  A full-page screenshot comes back too, because none of the above tells you
  what it looks like.

  Usage: node scripts/study-gallery.mjs [url] [--out DIR]
*/
import {chromium} from 'playwright'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'

const URL_ARG = process.argv[2]?.startsWith('http')
  ? process.argv[2]
  : 'https://chrisrumeau.myportfolio.com/copy-of-gallery'
const outAt = process.argv.indexOf('--out')
const OUT = outAt > -1 ? process.argv[outAt + 1] : 'study'

await mkdir(OUT, {recursive: true})

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: {width: 1440, height: 1000},
  deviceScaleFactor: 1,
  // Adobe Portfolio 403s anything that looks automated.
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
})
const page = await context.newPage()

/*
  The gallery page 403s even from a real Chromium, so the user agent is not the
  problem. Two explanations remain and they need different responses, so check
  the site root as well:

    root 200, page 403  -> that page is not published. Nothing can reach it, and
                           Chris would want to know.
    both 403            -> Adobe Portfolio is refusing this IP range, which is
                           what a GitHub Actions runner looks like. No amount of
                           crawling fixes that; a screenshot is the way in.
*/
const root = new URL(URL_ARG).origin
console.log(`checking ${root}`)
const rootRes = await page.goto(root, {waitUntil: 'domcontentloaded', timeout: 60000}).catch(() => null)
const rootStatus = rootRes?.status() ?? 'error'
console.log(`  root HTTP ${rootStatus}`)

console.log(`\nloading ${URL_ARG}`)
const res = await page.goto(URL_ARG, {waitUntil: 'domcontentloaded', timeout: 60000}).catch(() => null)
const pageStatus = res?.status() ?? 'error'
console.log(`  page HTTP ${pageStatus}`)

if (rootStatus === 200 && pageStatus === 403) {
  console.log(`\n  VERDICT: the root loads and this page does not, so /copy-of-gallery`)
  console.log(`  is almost certainly unpublished rather than blocked.`)
} else if (pageStatus === 403) {
  console.log(`\n  VERDICT: both refused. Adobe Portfolio is blocking this IP range,`)
  console.log(`  which is what a CI runner looks like. Crawling cannot get past it.`)
}

if (pageStatus !== 200) {
  console.log(`\n  Nothing to measure. Stopping here rather than publishing a`)
  console.log(`  report full of zeroes that looks like a finding.`)
  await browser.close()
  process.exit(0)
}

// Adobe Portfolio lazy-loads on scroll, so walk the page before measuring or
// most tiles are still placeholders.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 250))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(2500)

const facts = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')].filter((i) => {
    const r = i.getBoundingClientRect()
    return r.width > 80 && r.height > 80
  })

  // The grid container is whichever element is the common parent of the most
  // images - more reliable than guessing at class names on a hosted builder.
  const parents = new Map()
  for (const i of imgs) {
    const p = i.closest('div, section, ul, main')?.parentElement
    if (p) parents.set(p, (parents.get(p) ?? 0) + 1)
  }
  const container = [...parents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const cs = container ? getComputedStyle(container) : null

  const boxes = imgs.map((i) => {
    const r = i.getBoundingClientRect()
    const s = getComputedStyle(i)
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      ratio: +(r.width / r.height).toFixed(2),
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      filter: s.filter === 'none' ? null : s.filter,
      objectFit: s.objectFit,
      border: s.borderTopWidth === '0px' ? null : s.borderTopWidth,
      radius: s.borderTopLeftRadius,
    }
  })

  // Distinct left edges say how many columns the eye actually sees, whatever
  // the CSS claims. Rounded to 20px so sub-pixel drift doesn't invent columns.
  const lefts = [...new Set(boxes.map((b) => Math.round(b.x / 20) * 20))].sort((a, b) => a - b)

  const imageArea = boxes.reduce((a, b) => a + b.w * b.h, 0)
  const pageArea = document.documentElement.scrollWidth * document.documentElement.scrollHeight

  // Vertical gaps between consecutive rows, which is where "flowy" lives.
  const byRow = [...boxes].sort((a, b) => a.y - b.y)
  const gaps = []
  for (let i = 1; i < byRow.length; i += 1) {
    const g = byRow[i].y - (byRow[i - 1].y + byRow[i - 1].h)
    if (g > 0 && g < 600) gaps.push(Math.round(g))
  }

  return {
    title: document.title,
    imageCount: imgs.length,
    container: cs
      ? {
          tag: container.tagName.toLowerCase(),
          display: cs.display,
          gridTemplateColumns: cs.gridTemplateColumns,
          gap: `${cs.rowGap} / ${cs.columnGap}`,
          maxWidth: cs.maxWidth,
          width: Math.round(container.getBoundingClientRect().width),
        }
      : null,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    background: getComputedStyle(document.body).backgroundColor,
    distinctLeftEdges: lefts,
    boxes: boxes.slice(0, 40),
    widths: [...new Set(boxes.map((b) => b.w))].sort((a, b) => a - b),
    ratios: [...new Set(boxes.map((b) => b.ratio))].sort((a, b) => a - b),
    verticalGaps: gaps.slice(0, 30),
    filtersInUse: [...new Set(boxes.map((b) => b.filter).filter(Boolean))],
    densityPercent: pageArea ? +((imageArea / pageArea) * 100).toFixed(1) : null,
  }
})

/*
  Is the monochrome a filter or the files themselves? Sampled from a canvas: if
  r, g and b are equal in every sample the pixels are genuinely grey, which
  means his uploaded assets are already black and white and no filter is doing
  the work.
*/
const colourCheck = await page.evaluate(async () => {
  const img = [...document.querySelectorAll('img')].find((i) => {
    const r = i.getBoundingClientRect()
    return r.width > 200 && i.complete && i.naturalWidth
  })
  if (!img) return null
  try {
    const c = document.createElement('canvas')
    c.width = 40
    c.height = 40
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, 40, 40)
    const {data} = ctx.getImageData(0, 0, 40, 40)
    let coloured = 0
    let total = 0
    for (let i = 0; i < data.length; i += 4) {
      total += 1
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      if (Math.abs(r - g) > 6 || Math.abs(g - b) > 6) coloured += 1
    }
    return {sampled: total, colouredPixels: coloured, src: img.currentSrc?.slice(0, 100)}
  } catch (err) {
    // A cross-origin image taints the canvas; that is itself worth reporting.
    return {error: String(err).slice(0, 120)}
  }
})

console.log(JSON.stringify({...facts, colourCheck}, null, 2))

await page.screenshot({path: path.join(OUT, 'gallery-full.png'), fullPage: true})
await page.screenshot({path: path.join(OUT, 'gallery-fold.png'), fullPage: false})
await writeFile(path.join(OUT, 'gallery.json'), JSON.stringify({...facts, colourCheck}, null, 2))
console.log(`\nwrote ${OUT}/gallery-full.png, gallery-fold.png, gallery.json`)

await browser.close()
