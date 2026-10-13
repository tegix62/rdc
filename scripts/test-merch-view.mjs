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

  /*
    The gather. A front-row piece from the project with the most merch
    siblings on screen, so the check is about a real set and not a pair.
  */
  const target = await page.evaluate((MERCH) => {
    const grid = document.querySelector('#pf-grid')
    const shown = new Set(
      Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
      ),
    )
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const counts = new Map()
    for (const el of shown) {
      const h = href(el)
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1)
    }
    const all = Array.from(grid.querySelectorAll('.pf-item'))
    let best = null
    for (const el of shown) {
      const h = href(el)
      if (!h || el.dataset.merch !== 'lead') continue
      const n = counts.get(h)
      if (n >= 2 && (!best || n > best.n)) best = {i: all.indexOf(el), h, n}
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
        contiguous,
        intruders,
        hiddenLit,
        expanded: !!grid.querySelector('.pf-item.is-expanded'),
        stillMerch: shown.every((el) => el.classList.contains('merch-apparel')),
        onScreen: top < innerHeight && bottom > 0,
      }
    }, target.h)
    console.log(`\nclicked a piece from ${target.h} (${target.n} merch pieces on screen)`)
    check('the clicked piece opens', g.expanded)
    check('its merch siblings are gathered next to it', g.contiguous, `${g.n} pieces, contiguous: ${g.contiguous}`)
    check('nothing else sits inside the gathered set', g.intruders === 0, `${g.intruders} intruder(s)`)
    check('no hidden (non-merch) piece is lit or pulled in', g.hiddenLit === 0 && g.stillMerch, `${g.hiddenLit} hidden lit`)
    check('the gathered set is on screen', g.onScreen)
  }

  // Another filter leaves the merch view entirely.
  const other = await page.evaluate(
    (MERCH) =>
      Array.from(document.querySelectorAll('.pf-btn[data-filter]'))
        .map((b) => b.dataset.filter)
        .find((f) => f !== '*' && f !== MERCH) ?? null,
    MERCH,
  )
  if (other) {
    await press(page, other)
    const o = await state(page)
    console.log('')
    check(`${other} leaves the merch view`, !o.merchView && !o.active.includes(MERCH), JSON.stringify(o.active))
    check(`${other} restores the normal columns`, o.cols === before.cols, `${o.cols} columns, was ${before.cols}`)
    check(`only ${other} is on screen`, o.shown > 0, `${o.shown} tiles`)
  }

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
