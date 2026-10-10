/*
  What the mobile demo actually draws.

  WHY THIS EXISTS

  Chris, having watched the demo on his phone: "when you start that live
  demo, is it doing diagonal lines like the original constellation, or is
  it doing that elbow lines? I'd prefer the non-elbow."

  The source says plain <line> elements and the elbow routing was reverted,
  but reading the source answers a different question than the one asked.
  The demo is a separate code path - mobile only, once per session, a
  'flash' mode that skips the stroke animation - and nothing measured it,
  so "the hover constellation draws straight lines" was never evidence
  about the demo.

  So: watch the SVG being built, count what element types go into it, and
  classify every segment by its angle. An elbow shows up two ways and this
  catches both - as a <polyline>, or as pairs of axis-aligned <line>s
  meeting at a right angle.

  READ-ONLY.

  Usage: node scripts/test-demo-lines.mjs [base-url] [viewport-width]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const WIDTH = Number(process.argv[3] ?? 390)

let failed = false
const failures = []
const check = (what, ok, detail = '') => {
  if (!ok) {
    failed = true
    failures.push(`${what}${detail ? ` - ${detail}` : ''}`)
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: {width: WIDTH, height: 844},
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  /*
    The demo bails on prefers-reduced-motion, and a headless Chromium that
    reported "reduce" would make this script pass by never running the
    thing it is measuring. Stated rather than assumed.
  */
  reducedMotion: 'no-preference',
})

/*
  Installed before any page script runs, because the demo starts on its
  own a beat after layout and polling for the SVG afterwards would sample
  whatever happened to be on screen rather than everything drawn. Each
  beat replaces the previous SVG, so only an observer sees all four.
*/
await page.addInitScript(() => {
  window.__hops = []
  window.__kinds = {}
  window.__beats = 0
  const record = (svg) => {
    window.__beats += 1
    for (const el of svg.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase()
      if (tag !== 'line' && tag !== 'polyline') continue
      window.__kinds[tag] = (window.__kinds[tag] ?? 0) + 1
      if (tag === 'line') {
        window.__hops.push({
          x1: Number(el.getAttribute('x1')),
          y1: Number(el.getAttribute('y1')),
          x2: Number(el.getAttribute('x2')),
          y2: Number(el.getAttribute('y2')),
          beat: window.__beats,
        })
      } else {
        window.__hops.push({points: el.getAttribute('points'), beat: window.__beats})
      }
    }
  }
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue
        if (n.classList?.contains('pf-links')) record(n)
        else n.querySelector?.('.pf-links') && record(n.querySelector('.pf-links'))
      }
    }
  }).observe(document.documentElement, {childList: true, subtree: true})
})

await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
// Four beats of 200ms, after the grid settles. Generous, so a slow runner
// is not mistaken for a demo that never played.
await page.waitForTimeout(6000)

const got = await page.evaluate(() => ({
  hops: window.__hops ?? [],
  kinds: window.__kinds ?? {},
  beats: window.__beats ?? 0,
}))

await browser.close()

console.log(`${BASE}/portfolio at ${WIDTH}px - the mobile demo\n`)

const lines = got.hops.filter((h) => !h.points)
const polys = got.hops.filter((h) => h.points)

/*
  Classified by angle, with a 2px tolerance - a hop between two tiles that
  genuinely sit one above the other IS vertical, and calling that a fault
  would be measuring the grid rather than the routing.
*/
const kind = (h) => {
  const dx = Math.abs(h.x2 - h.x1)
  const dy = Math.abs(h.y2 - h.y1)
  if (dx <= 2) return 'vertical'
  if (dy <= 2) return 'horizontal'
  return 'diagonal'
}
const tally = {diagonal: 0, vertical: 0, horizontal: 0}
for (const h of lines) tally[kind(h)] += 1

const beats = new Set(got.hops.map((h) => h.beat))
console.log(`  ${beats.size} beat(s) drew something; ${lines.length} line(s), ${polys.length} polyline(s)`)
console.log(`  of the lines: ${tally.diagonal} diagonal, ${tally.vertical} vertical, ${tally.horizontal} horizontal\n`)

check('the demo actually played', got.beats > 0, `${got.beats} SVG(s) built`)
check('it flashed through more than one project', beats.size >= 2, `${beats.size} beats drew`)

/*
  The question Chris asked, in the two forms an elbow can take.
*/
check('no polylines - nothing is routed through a corner', polys.length === 0, `${polys.length} found`)

/*
  A hop drawn as an elbow becomes two axis-aligned segments meeting end to
  end. One stray vertical is just two stacked tiles; a vertical that shares
  an endpoint with a horizontal is a corner.
*/
const key = (x, y) => `${Math.round(x)},${Math.round(y)}`
const verticals = lines.filter((h) => kind(h) === 'vertical')
const horizontals = lines.filter((h) => kind(h) === 'horizontal')
const hEnds = new Set(horizontals.flatMap((h) => [key(h.x1, h.y1), key(h.x2, h.y2)]))
const corners = verticals.filter((v) => hEnds.has(key(v.x1, v.y1)) || hEnds.has(key(v.x2, v.y2)))
check('no corners - no vertical meets a horizontal end to end', corners.length === 0, `${corners.length} found`)

check(
  'the thread reads as diagonal, like the original constellation',
  lines.length > 0 && tally.diagonal > tally.vertical + tally.horizontal,
  `${tally.diagonal} of ${lines.length} hops run at an angle`,
)

if (failed) {
  console.log('\nFailed:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('\nThe demo draws the straight, diagonal thread.')
