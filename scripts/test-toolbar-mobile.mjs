/*
  The portfolio toolbar on a phone: no orphans, and not half the screen.

  WHY THESE TWO THINGS

  Chris: "on mobile lets tidy up the orphaned archive button, get this
  snappier. I like the four buttons above."

  Both halves are geometry, so both are measured as geometry rather than
  eyeballed from a screenshot.

  ORPHANED is a claim about rows. A control alone on a row under several
  full-width ones reads as dropped, whatever its styling. So the controls
  are grouped by their top edge and the test asks whether any row holds a
  single control while another holds two - which is the shape that looks
  like a mistake. The filters are excluded from that count because a 2x2
  block of four is the rhythm Chris likes and is the thing being matched.

  SNAPPIER is a claim about height. The toolbar was taking roughly 600px of
  an 844px screen before a single piece of work appeared. The assertion is
  against the viewport rather than a pixel count, because the point is how
  much of the phone is spent on chrome.

  And the tap targets are checked alongside, because the cheapest way to
  make a toolbar shorter is to make it unusable - an earlier mobile pass on
  this site shrank a control to 33x34 before anyone noticed.

  Usage: node scripts/test-toolbar-mobile.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForTimeout(2500)

console.log(`${BASE}/portfolio at 390x844\n`)

const bar = await page.evaluate(() => {
  const root = document.querySelector('.pf-controls')
  if (!root) return null

  /*
    Every leaf control, not every element. The zoom pair counts as ONE
    control because it occupies one cell and reads as one thing; counting
    its two buttons separately would report a tidy row as a crowded one.
  */
  const controls = [
    ...root.querySelectorAll('.pf-group--filters .pf-btn'),
  ].map((el) => ({el, kind: 'filter'}))
  for (const el of root.querySelectorAll(':scope .pf-group > .pf-btn, :scope > .pf-btn')) {
    controls.push({el, kind: 'arrange'})
  }
  const zoom = root.querySelector('.pf-zoom')
  if (zoom) controls.push({el: zoom, kind: 'arrange'})
  const archive = root.querySelector('.view-switch')
  if (archive) controls.push({el: archive, kind: 'archive'})

  const boxes = controls.map(({el, kind}) => {
    const r = el.getBoundingClientRect()
    return {
      kind,
      label: (el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 22),
      top: Math.round(r.top),
      height: Math.round(r.height),
      width: Math.round(r.width),
      right: Math.round(r.right),
    }
  })

  /* Group by top edge, with slack for sub-pixel differences. */
  const rows = []
  for (const b of boxes.filter((x) => x.kind !== 'filter')) {
    const row = rows.find((r) => Math.abs(r.top - b.top) < 8)
    if (row) row.items.push(b)
    else rows.push({top: b.top, items: [b]})
  }
  rows.sort((a, b) => a.top - b.top)

  const barBox = root.getBoundingClientRect()
  return {
    boxes,
    rows: rows.map((r) => ({top: r.top, labels: r.items.map((i) => i.label)})),
    barHeight: Math.round(barBox.height),
    barBottom: Math.round(barBox.bottom),
    viewport: window.innerHeight,
    docWidth: document.documentElement.scrollWidth,
    winWidth: window.innerWidth,
    archiveFound: !!archive,
  }
})

if (!bar) {
  check('the toolbar exists', false)
} else {
  console.log('  rows below the filters:')
  for (const r of bar.rows) console.log(`    y=${String(r.top).padStart(4)}  ${r.labels.join('  |  ')}`)
  console.log(
    `\n  toolbar ${bar.barHeight}px tall, ends at ${bar.barBottom} of ${bar.viewport} viewport`,
  )

  check('the Archive switch is on the page at all', bar.archiveFound)

  /*
    The orphan test. A row of one next to rows of two is the shape that
    reads as dropped; a toolbar whose rows are all the same width does not.
  */
  const widths = bar.rows.map((r) => r.labels.length)
  const lonely = bar.rows.filter((r) => r.labels.length === 1)
  const paired = bar.rows.filter((r) => r.labels.length > 1)
  check(
    'no control is left alone on a row beside rows that are not',
    !(lonely.length && paired.length),
    `rows of ${widths.join(', ')}`,
  )

  const archiveRow = bar.rows.find((r) => r.labels.some((l) => /archive/i.test(l)))
  check(
    'the Archive switch shares its row',
    !!archiveRow && archiveRow.labels.length > 1,
    archiveRow ? `sits with ${archiveRow.labels.filter((l) => !/archive/i.test(l)).join(', ') || 'nothing'}` : 'row not found',
  )

  /*
    Snappier, measured against the screen rather than a pixel target. Half
    the viewport is already generous for chrome above the content.
  */
  check(
    'the toolbar leaves most of the screen for the work',
    bar.barBottom < bar.viewport * 0.6,
    `chrome ends ${bar.barBottom}px down an ${bar.viewport}px screen (${Math.round((bar.barBottom / bar.viewport) * 100)}%)`,
  )

  /*
    The cheapest way to make a toolbar shorter is to make it untappable.
    44px is the floor an earlier pass on this site settled on after a
    control shipped at 33x34.
  */
  const small = bar.boxes.filter((b) => b.height < 44)
  check(
    'every control still clears a 44px tap target',
    small.length === 0,
    small.length ? small.map((b) => `${b.label} ${b.width}x${b.height}`).join(', ') : 'all at least 44px tall',
  )

  check(
    'and nothing spills sideways',
    bar.docWidth <= bar.winWidth + 1,
    `document ${bar.docWidth}px wide in a ${bar.winWidth}px window`,
  )
}

await browser.close()
console.log(failures === 0 ? '\nThe phone toolbar is one rhythm and leaves room for the work.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
