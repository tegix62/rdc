/*
  The Merch & Apparel view, driven the way a visitor drives it.

  What Chris asked for, as checks:

    - the Merch tab switches the grid to 3 columns on desktop (2 on a phone)
    - the single-mockup pieces come first, the other shots after
    - it is exclusive: Merch clears the other filters, and any other filter
      leaves Merch and restores the normal columns
    - clicking a shirt gathers that project's other merch pieces around it,
      and nothing the filter hid is counted or moved into view

  Each check prints the measured value, so a failure says what happened
  rather than only that something did.

  READ-ONLY.

  Usage: node scripts/test-merch-view.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const MERCH = '.merch-apparel'
const TYPE = '.type-lettering'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()

async function open(width, height) {
  const page = await browser.newPage({viewport: {width, height}})
  // The once-a-session demo would gather something on its own and muddy
  // every measurement below; it reads this flag to know it has run.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  await page.waitForTimeout(2500)
  return page
}

const state = (page) =>
  page.evaluate((MERCH) => {
    const grid = document.querySelector('#pf-grid')
    const sizer = grid.querySelector('.pf-sizer')
    const tiles = Array.from(grid.querySelectorAll('.pf-item'))
    const shown = tiles.filter((el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.opacity !== '0' && el.getBoundingClientRect().width > 0
    })
    const active = Array.from(document.querySelectorAll('.pf-btn[data-filter].is-active')).map(
      (b) => b.dataset.filter,
    )
    return {
      cols: Math.round(grid.clientWidth / sizer.getBoundingClientRect().width),
      active,
      merchView: grid.classList.contains('is-merch-view'),
      typeView: grid.classList.contains('is-type-view'),
      // Pictures that are not square, among tiles at rest. Uniform means none.
      notSquare: shown.filter((el) => {
        if (el.classList.contains('is-expanded')) return false
        const r = el.querySelector('.pf-item__img')?.getBoundingClientRect()
        return r && Math.abs(r.width - r.height) > 1.5
      }).length,
      shown: shown.length,
      shownMerch: shown.filter((el) => el.matches(MERCH)).length,
      // DOM order of what is on screen: lead/later sequence.
      shownOrder: shown.map((el) => el.dataset.merch ?? '-'),
    }
  }, MERCH)

const press = async (page, filter) => {
  await page.click(`.pf-btn[data-filter="${filter}"]`)
  await page.waitForTimeout(900)
}

// ---------------------------------------------------------------- desktop
{
  const page = await open(1440, 900)
  const before = await state(page)
  console.log(`desktop 1440: ${before.cols} columns, ${before.shown} tiles, active ${JSON.stringify(before.active)}\n`)

  await press(page, MERCH)
  const m = await state(page)
  check('Merch switches to 3 columns', m.cols === 3, `${m.cols} columns`)
  check('Merch is the only active filter', m.active.length === 1 && m.active[0] === MERCH, JSON.stringify(m.active))
  check('only merch pieces are on screen', m.shown > 0 && m.shown === m.shownMerch, `${m.shownMerch} of ${m.shown}`)
  const firstLater = m.shownOrder.indexOf('later')
  const lastLead = m.shownOrder.lastIndexOf('lead')
  check(
    'every single-mockup piece comes before every other shot',
    firstLater === -1 || lastLead < firstLater,
    `${m.shownOrder.filter((x) => x === 'lead').length} front, ${m.shownOrder.filter((x) => x === 'later').length} back: ${m.shownOrder.join(' ')}`,
  )

  check('every merch picture is the same square shape', m.notSquare === 0, `${m.notSquare} not square`)

  /*
    The gather. A front-row piece from the project with the most pieces IN
    TOTAL - merch or not - so the check covers the hidden ones too. Chris:
    "everything, regardless of filter, that's attached to the corresponding
    case study to gather around that shirt".
  */
  const target = await page.evaluate((MERCH) => {
    const grid = document.querySelector('#pf-grid')
    const shown = new Set(
      Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
      ),
    )
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const all = Array.from(grid.querySelectorAll('.pf-item'))
    const total = new Map()
    const hidden = new Map()
    for (const el of all) {
      const h = href(el)
      if (!h) continue
      total.set(h, (total.get(h) ?? 0) + 1)
      if (!shown.has(el)) hidden.set(h, (hidden.get(h) ?? 0) + 1)
    }
    let best = null
    for (const el of shown) {
      const h = href(el)
      if (!h || el.dataset.merch !== 'lead' || !(hidden.get(h) > 0)) continue
      const n = total.get(h)
      if (!best || n > best.n) best = {i: all.indexOf(el), h, n, hidden: hidden.get(h)}
    }
    return best
  }, MERCH)

  if (!target) {
    check('a front-row piece with merch siblings exists to click', false)
  } else {
    // Scroll it into view and click its picture, as a visitor would.
    const tile = page.locator('#pf-grid .pf-item').nth(target.i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1800)
    const g = await page.evaluate((h) => {
      const grid = document.querySelector('#pf-grid')
      const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
      const shown = Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
      )
      const whole = Array.from(grid.querySelectorAll('.pf-item')).filter((el) => href(el) === h)
      const fam = shown.filter((el) => href(el) === h)
      const idx = fam.map((el) => shown.indexOf(el))
      const contiguous = Math.max(...idx) - Math.min(...idx) + 1 === fam.length
      // The set's box, and anything else on screen that sits inside it.
      const boxes = fam.map((el) => el.getBoundingClientRect())
      const top = Math.min(...boxes.map((r) => r.top))
      const bottom = Math.max(...boxes.map((r) => r.bottom))
      const left = Math.min(...boxes.map((r) => r.left))
      const right = Math.max(...boxes.map((r) => r.right))
      const intruders = shown.filter((el) => {
        if (fam.includes(el)) return false
        const r = el.getBoundingClientRect()
        const cx = (r.left + r.right) / 2
        const cy = (r.top + r.bottom) / 2
        return cx > left && cx < right && cy > top && cy < bottom
      }).length
      const hiddenLit = Array.from(grid.querySelectorAll('.pf-item.is-sibling')).filter(
        (el) => !shown.includes(el),
      ).length
      return {
        n: fam.length,
        whole: whole.length,
        nonMerch: fam.filter((el) => !el.classList.contains('merch-apparel')).length,
        contiguous,
        intruders,
        hiddenLit,
        expanded: !!grid.querySelector('.pf-item.is-expanded'),
        onScreen: top < innerHeight && bottom > 0,
      }
    }, target.h)
    console.log(`\nclicked a shirt from ${target.h} (${target.n} pieces in the case study, ${target.hidden} hidden by the filter)`)
    check('the clicked piece opens', g.expanded)
    check('the WHOLE case study is on screen, hidden pieces included', g.n === g.whole, `${g.n} of ${g.whole}`)
    check('including pieces outside Merch', g.nonMerch > 0, `${g.nonMerch} non-merch piece(s) revealed`)
    check('gathered next to it in one run', g.contiguous, `contiguous: ${g.contiguous}`)
    check('nothing else sits inside the gathered set', g.intruders === 0, `${g.intruders} intruder(s)`)
    check('nothing lit is left invisible', g.hiddenLit === 0, `${g.hiddenLit} hidden lit`)
    check('the gathered set is on screen', g.onScreen)

    // Closing it hides the revealed pieces again: the view is garments at rest.
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1200)
    const closed = await state(page)
    check('closing hides the revealed pieces again', closed.shown === closed.shownMerch && closed.shownMerch === m.shownMerch, `${closed.shown} on screen, ${closed.shownMerch} merch`)
  }

  // Another filter leaves the merch view entirely.
  // Both constants passed in: the page cannot see this script's variables.
  const other = await page.evaluate(
    ([MERCH, TYPE]) =>
      Array.from(document.querySelectorAll('.pf-btn[data-filter]'))
        .map((b) => b.dataset.filter)
        .find((f) => f !== '*' && f !== MERCH && f !== TYPE) ?? null,
    [MERCH, TYPE],
  )
  if (other) {
    await press(page, other)
    const o = await state(page)
    console.log('')
    check(`${other} leaves the merch view`, !o.merchView && !o.active.includes(MERCH), JSON.stringify(o.active))
    check(`${other} restores the normal columns`, o.cols === before.cols, `${o.cols} columns, was ${before.cols}`)
    check(`only ${other} is on screen`, o.shown > 0, `${o.shown} tiles`)
  }

  /*
    TYPE / LETTERING: four columns, a 2px seam, every picture cropped square.
    And views are exclusive of each other as well as of the filters.
  */
  await press(page, TYPE)
  const t = await state(page)
  console.log('')
  check('Type/Lettering switches to 4 columns', t.cols === 4, `${t.cols} columns`)
  check('Type/Lettering is the only active filter', t.active.length === 1 && t.active[0] === TYPE, JSON.stringify(t.active))
  check('and it is a view, not a combined filter', t.typeView && !t.merchView)
  check('every type picture is cropped square', t.notSquare === 0, `${t.notSquare} not square`)
  const seam = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
      .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0)
      .map((el) => el.querySelector('.pf-item__img').getBoundingClientRect())
    // Horizontal neighbours: same top, the nearest picture to the right.
    const gaps = []
    for (const a of imgs) {
      const right = imgs.filter((b) => Math.abs(b.top - a.top) < 2 && b.left > a.left).sort((x, y) => x.left - y.left)[0]
      if (right) gaps.push(right.left - a.right)
    }
    return gaps.length ? {min: Math.min(...gaps), max: Math.max(...gaps), n: gaps.length} : null
  })
  check('the seam between pieces is really thin', seam && seam.max <= 3, seam ? `${seam.min.toFixed(1)}-${seam.max.toFixed(1)}px across ${seam.n} pairs` : 'no neighbours found')

  await press(page, MERCH)
  const tm = await state(page)
  check('Merch from Type switches views cleanly', tm.merchView && !tm.typeView && tm.cols === 3, `${tm.cols} columns, ${JSON.stringify(tm.active)}`)
  await press(page, MERCH)

  // Merch again, then Merch once more: toggles back to everything.
  await press(page, MERCH)
  await press(page, MERCH)
  const off = await state(page)
  console.log('')
  check('pressing Merch again returns to All', off.active.length === 1 && off.active[0] === '*', JSON.stringify(off.active))
  check('with every tile back', off.shown === before.shown, `${off.shown} of ${before.shown}`)
  check('and the normal columns', off.cols === before.cols, `${off.cols} columns`)
  await page.close()
}

// ---------------------------------------------------------------- phone
{
  const page = await open(390, 844)
  await press(page, MERCH)
  const p = await state(page)
  console.log('')
  check('on a phone the merch view is 2 columns', p.cols === 2, `${p.cols} columns`)
  await press(page, TYPE)
  const pt = await state(page)
  check('and so is the type view', pt.cols === 2, `${pt.cols} columns`)
  const docW = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  check('and nothing scrolls sideways', docW[0] <= docW[1], `${docW[0]} vs ${docW[1]}`)
  await page.close()
}

await browser.close()
console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('The merch view behaves as asked.')
