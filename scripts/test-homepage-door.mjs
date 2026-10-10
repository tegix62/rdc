/*
  The homepage's featured tiles open the Portfolio with their project
  already gathered.

  WHY THIS EXISTS

  Chris, asked what the homepage should be now that the Portfolio is "the
  main thing I want people to see", chose: featured tiles open the
  portfolio pre-gathered. So the homepage stops being a separate pitch
  with its own dead-end links and becomes the door into the grid - and a
  visitor learns the work comes in sets at the moment they arrive, rather
  than having to discover it among eighty-two tiles.

  Three things have to be true for that to work, and they fail
  independently, so they are checked independently:

    1. the homepage tiles actually carry ?project=
    2. the slug they carry matches a family the Portfolio can find
    3. landing on that URL gathers and threads THAT project

  (2) is the one that will rot. The link is built from tileHref() and the
  match is made against projectOf(); nothing but this test makes those
  two agree, and a renamed slug would silently land everyone on an
  ungathered grid.

  READ-ONLY.

  Usage: node scripts/test-homepage-door.mjs [base-url] [width] [height]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const WIDTH = Number(process.argv[3] ?? 1440)
const HEIGHT = Number(process.argv[4] ?? 900)

let failures = 0
const check = (what, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}})

await page.goto(`${BASE}/`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.peek__grid', {state: 'attached', timeout: 30_000}).catch(() => {})

const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.peek__grid .peek__link')).map((a) => a.getAttribute('href')),
)

console.log(`${BASE} - the homepage as a door into the grid\n`)
console.log(`  ${links.length} featured tile(s) link to:`)
for (const h of links) console.log(`    ${h}`)
console.log('')

const doors = links.filter((h) => h && h.includes('/portfolio?project='))
check('the featured tiles point into the Portfolio', doors.length > 0, `${doors.length} of ${links.length}`)

if (!doors.length) {
  await browser.close()
  console.log('\nNothing to follow.')
  process.exit(1)
}

/*
  Follow a real one, rather than a slug this script made up - the point
  is whether the link the page actually emits lands somewhere useful.
*/
const slug = decodeURIComponent(doors[0].split('project=')[1])
await page.goto(`${BASE}${doors[0]}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
// Past the 1200ms deferral, the gather, and its settle loop.
await page.waitForTimeout(5000)

const landed = await page.evaluate((want) => {
  const grid = document.querySelector('#pf-grid')
  const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
  const all = Array.from(grid.querySelectorAll('.pf-item'))
  const matching = all.filter((el) => {
    const h = hrefOf(el)
    return !!h && h.replace(/\/+$/, '').split('/').pop() === want
  })
  const expanded = grid.querySelector('.pf-item.is-expanded')
  const svg = grid.querySelector('.pf-links')
  return {
    familyFound: matching.length,
    expandedIsOurs: !!expanded && matching.includes(expanded),
    lit: grid.querySelectorAll('.pf-item.is-sibling').length,
    hops: svg ? svg.querySelectorAll('line, polyline').length : 0,
    dimmed: grid.classList.contains('has-focus'),
  }
}, slug)

await browser.close()

console.log(`  followed "${slug}"\n`)
check('the slug matches a family on the Portfolio', landed.familyFound > 0, `${landed.familyFound} pieces`)
check('the right tile opened', landed.expandedIsOurs)
check('its set is lit', landed.lit >= 4, `${landed.lit} pieces marked`)
check('the grid dimmed around it', landed.dimmed)
/*
  Threads are drawn and then removed once the pieces have travelled, so
  this is checked last and tolerantly: by five seconds the set has
  gathered and the thread may well have faded on purpose. The lit count
  above is the durable evidence that the right project was opened.
*/
console.log(`  (${landed.hops} thread segments still on screen at the end)`)

console.log(
  failures === 0
    ? '\nThe homepage opens the grid on the project you picked.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
