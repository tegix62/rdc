/*
  How many columns the Portfolio grid actually shows, at four widths.

  WHY THIS EXISTS

  The column count is JavaScript - a width test in portfolio.astro - so it
  appears nowhere in the stylesheet and nothing about it is visible in a
  CSS diff. It also has four branches now that a wide screen gets seven,
  and the one that broke before was the one nobody was looking at: the
  arrow-key step read a hardcoded 3 while the grid was showing 6.

  Measured from the rendered tiles rather than from the variable, because
  the variable is what the code INTENDED. A tile's left offset says where
  it landed: the number of distinct left edges in the first row is the
  number of columns, whatever anyone meant.

  Usage: node scripts/test-portfolio-columns.mjs [url]
*/
import {chromium} from 'playwright'

const URL = process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev/portfolio'

/*
  The rule, stated here as the thing to hold rather than read out of the
  page. 1280 is where the seventh column starts paying for itself - see the
  note in portfolio.astro.
*/
const EXPECTED = [
  {width: 1920, height: 1080, cols: 7, why: 'a desktop screen'},
  {width: 1440, height: 900, cols: 7, why: 'a laptop in landscape'},
  {width: 1280, height: 800, cols: 7, why: 'exactly the threshold'},
  {width: 1024, height: 768, cols: 6, why: 'below it - a tablet in landscape'},
  {width: 390, height: 844, cols: 4, why: 'a phone'},
]

const browser = await chromium.launch()
let problems = 0

for (const {width, height, cols, why} of EXPECTED) {
  const page = await browser.newPage({viewport: {width, height}})
  const response = await page.goto(URL, {waitUntil: 'load', timeout: 60000})
  if (!response || !response.ok()) {
    console.log(`FAIL ${width}x${height}: HTTP ${response ? response.status() : 'no response'}`)
    problems += 1
    await page.close()
    continue
  }

  /*
    Isotope positions the tiles after images load, and until it has, every
    tile sits at the same place. Waiting for the class the grid drops when
    it is done is the only honest signal; raced against a clock, like every
    other wait in this repo, because a stalled image must not hang a check.
  */
  await page
    .waitForFunction(() => !document.querySelector('#pf-grid')?.classList.contains('is-laying-out'), {
      timeout: 15000,
    })
    .catch(() => {})

  const measured = await page.evaluate(() => {
    const grid = document.querySelector('#pf-grid')
    if (!grid) return null
    const items = [...grid.querySelectorAll('.pf-item')].filter(
      (el) => getComputedStyle(el).display !== 'none',
    )
    if (!items.length) return null
    const boxes = items.map((el) => el.getBoundingClientRect())
    const top = Math.min(...boxes.map((b) => b.top))
    // The first row: everything whose top is within a tile's height of the
    // highest. A masonry grid staggers rows, so "same top" is too strict.
    const firstRow = boxes.filter((b) => b.top < top + 8)
    const lefts = [...new Set(firstRow.map((b) => Math.round(b.left)))]
    return {
      columns: lefts.length,
      colWidth: getComputedStyle(grid).getPropertyValue('--pf-col-w').trim(),
      tile: Math.round(boxes[0].width),
      items: items.length,
    }
  })

  if (!measured) {
    console.log(`FAIL ${width}x${height}: no tiles found`)
    problems += 1
  } else if (measured.columns !== cols) {
    console.log(
      `FAIL ${width}x${height} (${why}): ${measured.columns} columns, expected ${cols}` +
        `  [--pf-col-w ${measured.colWidth}, tile ${measured.tile}px]`,
    )
    problems += 1
  } else {
    console.log(
      `ok   ${width}x${height} (${why}): ${measured.columns} columns, tile ${measured.tile}px` +
        `  [${measured.items} tiles]`,
    )
  }
  await page.close()
}

await browser.close()
console.log(problems ? `\n${problems} width(s) wrong.` : '\nEvery width shows the column count it should.')
process.exit(problems ? 1 : 0)
