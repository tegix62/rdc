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
/*
  Failed checks are also collected and reprinted at the end.

  These runs are read through a log tail, and a suite with forty passing
  lines pushes an early failure off the top of it - which has cost two
  rounds of fetching progressively more of the same log to find out which
  check broke. The verdict belongs where it can always be seen.
*/
const failed = []
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    failed.push(`${name}${detail ? ` - ${detail}` : ''}`)
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

/*
  THE NAV, which is the other half of why swiping did not land.

  Chris: "part of the reason for mobile's lack of efficacy is it has a
  hamburger menu. And if you could see the spread of Portfolio, About,
  Video... and some animation showing which page you're on."

  A swipe moves you along a sequence; the sequence was behind a button, so
  the gesture had nothing to confirm it. These check that the sequence is
  visible without a tap, that exactly one page is marked as current, and
  that the marker carries the view-transition-name that makes it slide
  between pages rather than blink.
*/
{
  const nav = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.site-nav__links a')]
    const toggle = document.querySelector('.site-nav__toggle')
    const here = document.querySelectorAll('.site-nav__here')
    const marker = here[0]
    return {
      labels: links.map((a) => a.textContent.trim().replace(/\s+/g, ' ')),
      visible: links.filter((a) => a.getBoundingClientRect().width > 0).length,
      toggleShown: toggle ? getComputedStyle(toggle).display !== 'none' : false,
      current: links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) =>
        a.getAttribute('href'),
      ),
      markers: here.length,
      transitionName: marker ? getComputedStyle(marker).viewTransitionName : null,
      markerWidth: marker ? Math.round(marker.getBoundingClientRect().width) : 0,
    }
  })

  console.log(`\n  nav: ${nav.labels.join(' / ')}`)
  check(
    'the pages are visible without opening anything',
    nav.visible >= 3,
    `${nav.visible} of ${nav.labels.length} links laid out`,
  )
  check('the hamburger is gone on a phone', !nav.toggleShown)
  check(
    'exactly one page is marked current',
    nav.current.length === 1,
    nav.current.join(', ') || 'none marked',
  )
  /*
    One name per document is a hard rule: two elements sharing a
    view-transition-name makes the browser skip the transition entirely, so
    the marker would stop sliding and nothing would say why.
  */
  check(
    'and exactly one marker carries the transition name',
    nav.markers === 1 && nav.transitionName === 'nav-here',
    `${nav.markers} marker(s), view-transition-name "${nav.transitionName}"`,
  )
  check('the marker is actually drawn', nav.markerWidth > 10, `${nav.markerWidth}px wide`)
}

/* The edge tabs Chris asked to be rid of. */
{
  const desk = await browser.newPage({viewport: {width: 1440, height: 900}})
  await desk.goto(`${BASE}/about`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await desk.waitForTimeout(800)
  const edges = await desk.evaluate(
    () => document.querySelectorAll('[data-deck-next], [data-deck-prev], .deck__edge').length,
  )
  console.log('')
  check('no edge buttons on desktop', edges === 0, `${edges} found`)
  await desk.close()
}

await browser.close()
if (failures) {
  console.log('')
  console.log('--- failed checks ---')
  for (const f of failed) console.log(`  FAIL  ${f}`)
}
console.log(failures === 0 ? '\nThe phone toolbar is one rhythm and leaves room for the work.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
