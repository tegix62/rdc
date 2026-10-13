/*
  How wide is a Media Row, next to the column of text above it?

  WHY THIS EXISTS

  Chris: on the video page the Media Rows do not span the full width on
  desktop - is that why it differs from the case study pages? The CSS says
  yes: a case study's band declares --wide-room (the "pictures" measure,
  nearly the full window), and a plain page has no band, so a row falls back
  to 100% of the 72rem text column. That is a reading of the stylesheet. This
  measures the thing itself, on both kinds of page, at the same widths, so
  "consistent with the case studies" is a number rather than a belief.

  For each page and viewport it reports every Media Row's width, how far it
  sits from each window edge, the width of the text column it lives in, and
  whether the page now scrolls sideways - because a row that breaks out of
  its column is exactly how a page gets a horizontal scrollbar.

  READ-ONLY.

  Usage: node scripts/measure-row-width.mjs [base-url] [path,path] [width,width]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PATHS = (process.argv[3] ?? '/video,/work/two-point-oh').split(',')
const WIDTHS = (process.argv[4] ?? '1440,1920,1100,390').split(',').map(Number)

const browser = await chromium.launch()
let rows = 0

for (const path of PATHS) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({viewport: {width, height: 1000}})
    await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    await page.waitForSelector('.media-row__items', {state: 'attached', timeout: 20_000}).catch(() => {})
    await page.waitForTimeout(1500)
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const col = document.querySelector('.work-band__inner, .page-sections')
      const colBox = col?.getBoundingClientRect()
      return {
        vw,
        scrollW: document.documentElement.scrollWidth,
        column: col ? {kind: col.className.split(' ')[0], w: Math.round(colBox.width)} : null,
        rows: Array.from(document.querySelectorAll('.media-row__items')).map((el) => {
          const r = el.getBoundingClientRect()
          return {
            n: el.children.length,
            w: Math.round(r.width),
            left: Math.round(r.left),
            right: Math.round(vw - r.right),
          }
        }),
      }
    })
    rows += m.rows.length
    const overflow = m.scrollW > m.vw
    console.log(
      `${path} @${width}  column ${m.column ? `${m.column.kind} ${m.column.w}px` : '(none)'}  ` +
        `${overflow ? `SCROLLS SIDEWAYS (${m.scrollW} > ${m.vw})` : 'no sideways scroll'}`,
    )
    if (!m.rows.length) console.log('    no Media Row on this page')
    for (const r of m.rows) {
      console.log(`    row of ${r.n}: ${r.w}px wide, ${r.left}px from the left edge, ${r.right}px from the right`)
    }
    await page.close()
  }
  console.log('')
}
await browser.close()
if (!rows) {
  console.log('No Media Rows were found on any page, so nothing was measured.')
  process.exit(1)
}
