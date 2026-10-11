/*
  Draw the constellation as a schematic, so it can be LOOKED at.

  WHY THIS EXISTS

  Chris: "The constellation lines are still a bit awkward." Every other
  tool in this repo answers a question I already knew to ask - how long
  is the hop, does it cross a lit tile, is the tree planar. "Awkward" is
  not one of those. It is a judgement about a shape, and the only honest
  way to work on a shape is to see it.

  So this emits an SVG of exactly what is on screen at the moment the
  thread is drawn: every tile as a box, the project's pieces outlined,
  the tile the thread grew from marked, and each hop as a line. Printed
  as a single line between markers, because the way back from a CI
  runner to here is the job log, and a one-line payload survives any
  amount of tailing.

  READ-ONLY.

  Usage: node scripts/trace-constellation.mjs [base-url] [width] [height]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const WIDTH = Number(process.argv[3] ?? 1440)
const HEIGHT = Number(process.argv[4] ?? 2400)

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}})

await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(4000)

/*
  The desktop constellation is the HOVER thread, so it has to be
  provoked with a real pointer move - a synthetic click would gather
  instead, which is a different picture. Playwright's hover dispatches
  the mouseover the page listens for.

  The biggest family on screen, because a three-hop thread cannot look
  awkward and so cannot show the fault.
*/
const target = await page.evaluate(() => {
  const grid = document.querySelector('#pf-grid')
  const tiles = Array.from(grid.querySelectorAll('.pf-item'))
  const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
  const sizes = new Map()
  for (const el of tiles) {
    const h = hrefOf(el)
    if (h) sizes.set(h, (sizes.get(h) ?? 0) + 1)
  }
  let best = null
  for (const el of tiles) {
    const h = hrefOf(el)
    if (!h) continue
    const n = sizes.get(h) ?? 0
    if (n >= 4 && (!best || n > best.n)) best = {h, n, id: tiles.indexOf(el)}
  }
  return best
})

if (!target) {
  await browser.close()
  console.log('no family of four or more found')
  process.exit(1)
}

const handle = await page.evaluateHandle((id) => {
  const grid = document.querySelector('#pf-grid')
  return Array.from(grid.querySelectorAll('.pf-item'))[id]
}, target.id)
await handle.asElement().hover()
// Past the preview's draw: 80ms a hop, staggered 22ms, capped at eight.
await page.waitForTimeout(900)

const trace = await page.evaluate(() => {
  const grid = document.querySelector('#pf-grid')
  const gr = grid.getBoundingClientRect()
  const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
  const tiles = Array.from(grid.querySelectorAll('.pf-item'))
  const svg = grid.querySelector('.pf-links')
  const lines = svg
    ? Array.from(svg.querySelectorAll('line')).map((l) => ({
        x1: +l.getAttribute('x1'),
        y1: +l.getAttribute('y1'),
        x2: +l.getAttribute('x2'),
        y2: +l.getAttribute('y2'),
      }))
    : []
  /*
    The SVG uses a viewBox in grid coordinates, so the hop numbers are
    already relative to the grid's top-left. The tile boxes are read
    from the viewport and shifted to match, or the two would be drawn
    in different spaces and the picture would be a lie.
  */
  const boxes = tiles.map((el) => {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.left - gr.left),
      y: Math.round(r.top - gr.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
      kin: el.classList.contains('is-preview-sibling') || el.classList.contains('is-sibling'),
    }
  })
  return {
    w: Math.round(gr.width),
    h: Math.round(gr.height),
    boxes,
    lines,
    viewBox: svg?.getAttribute('viewBox') ?? null,
  }
})

await browser.close()

const kin = trace.boxes.filter((b) => b.kin)
const minY = Math.min(...kin.map((b) => b.y), ...trace.lines.map((l) => Math.min(l.y1, l.y2)))
const maxY = Math.max(...kin.map((b) => b.y + b.h), ...trace.lines.map((l) => Math.max(l.y1, l.y2)))
// Crop to the thread with a margin, so the picture is the constellation
// rather than eighty tiles with a thread somewhere in them.
const pad = 120
const top = Math.max(0, minY - pad)
const bottom = Math.min(trace.h, maxY + pad)

const parts = []
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} ${trace.w} ${bottom - top}" width="${trace.w}" height="${bottom - top}" style="background:#fff">`,
)
for (const b of trace.boxes) {
  if (b.y + b.h < top || b.y > bottom) continue
  parts.push(
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${b.kin ? '#dfe7f5' : '#f4f4f4'}" stroke="${b.kin ? '#1b2f6b' : '#e0e0e0'}" stroke-width="${b.kin ? 2 : 1}"/>`,
  )
}
for (const l of trace.lines) {
  parts.push(`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#d81e2c" stroke-width="3"/>`)
  parts.push(`<circle cx="${l.x1}" cy="${l.y1}" r="4" fill="#d81e2c"/>`)
  parts.push(`<circle cx="${l.x2}" cy="${l.y2}" r="4" fill="#d81e2c"/>`)
}
parts.push('</svg>')

console.log(`project ${target.h}, ${target.n} pieces, ${trace.lines.length} hops`)
console.log(`grid ${trace.w}x${trace.h}, viewBox "${trace.viewBox}", cropped ${top}..${bottom}`)
console.log('>>>SVG>>>' + parts.join('') + '<<<SVG<<<')
