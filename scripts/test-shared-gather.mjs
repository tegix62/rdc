/*
  The shared gather: every view opens a piece the way the Merch view opens a
  shirt (see THE SHARED GATHER in portfolio.astro). Preview only.

  Chris: "we've now developed merch category better than the others - what
  can we do to match the presentation/efficacy", then "start with 1 on
  preview".

  For the All grid at two desktop widths, the Type/Lettering view, and a
  phone: the opened piece at its size, the project's block beside it (under
  it on a phone), the whole set inside the window, nothing overlapping, the
  rest in level rows, the tiles outside the set exactly as wide as before -
  and closing puts the resting grid back.

  Usage: node scripts/test-shared-gather.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const TYPE = '.type-lettering'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()
async function open(w, h) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  await page.waitForTimeout(2500)
  return page
}

// The visible piece (not a case study tile) whose project is biggest.
const pickPiece = (page, sel) =>
  page.evaluate((sel) => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
    const shown = all.filter((el) => getComputedStyle(el).display !== 'none' && (!sel || el.matches(sel)))
    const size = (h) => all.filter((x) => href(x) === h).length
    const best = shown
      .filter((el) => href(el) && !el.classList.contains('pf-item--study') && all.some((x) => x.querySelector('.pf-card') && href(x) === href(el)))
      .sort((a, b) => size(href(b)) - size(href(a)))[0]
    return best ? {i: all.indexOf(best), h: href(best), n: size(href(best))} : null
  }, sel)

const measure = (page) =>
  page.evaluate(() => {
    const grid = document.querySelector('#pf-grid')
    const g = grid.getBoundingClientRect()
    const opened = grid.querySelector('.pf-item.is-expanded')
    const card = grid.querySelector('.pf-item.is-card')
    const shown = Array.from(grid.querySelectorAll('.pf-item')).filter((el) => getComputedStyle(el).display !== 'none')
    const set = shown.filter((el) => el.classList.contains('is-sibling'))
    const boxes = shown.map((el) => el.getBoundingClientRect())
    let overlaps = 0
    for (let a = 0; a < boxes.length; a++)
      for (let z = a + 1; z < boxes.length; z++) {
        const w = Math.min(boxes[a].right, boxes[z].right) - Math.max(boxes[a].left, boxes[z].left)
        const h = Math.min(boxes[a].bottom, boxes[z].bottom) - Math.max(boxes[a].top, boxes[z].top)
        if (w > 2 && h > 2) overlaps++
      }
    const o = opened?.getBoundingClientRect()
    const c = card?.getBoundingClientRect()
    // Rows of the rest: every piece in a row the same height.
    const rest = set.filter((el) => el.classList.contains('is-minor')).map((el) => el.getBoundingClientRect())
    const rows = []
    for (const b of rest) {
      const r = rows.find((x) => Math.abs(x.top - b.top) < 2)
      if (r) r.h.push(b.height)
      else rows.push({top: b.top, h: [b.height]})
    }
    const uneven = rows.filter((r) => Math.max(...r.h) - Math.min(...r.h) > 2).length
    return {
      cluster: grid.classList.contains('is-cluster'),
      openedShare: o ? o.width / g.width : 0,
      beside: !!(o && c) && (Math.abs(c.left - o.right) < 3 || Math.abs(c.right - o.left) < 3) && Math.abs(c.top - o.top) < 3,
      under: !!(o && c) && Math.abs(c.top - o.bottom) < 3 && c.width > g.width - 6,
      setN: set.length,
      outside: set.filter((el) => {
        const b = el.getBoundingClientRect()
        return b.bottom > innerHeight + 1 || b.top < -1
      }).length,
      shirtFits: !!o && o.top >= -1 && o.bottom <= innerHeight + 1,
      overlaps,
      rows: rows.length,
      uneven,
      end: !!grid.querySelector('.pf-item.pf-end'),
      shownN: shown.length,
    }
  })

// Widths of resting tiles outside the set, by slug, to compare across the open.
const restingWidths = (page, h) =>
  page.evaluate((h) => {
    const out = {}
    for (const el of document.querySelectorAll('#pf-grid .pf-item')) {
      if (getComputedStyle(el).display === 'none') continue
      if (el.querySelector('.pf-item__jump')?.getAttribute('href') === h) continue
      out[el.dataset.piece] = Math.round(el.getBoundingClientRect().width)
    }
    return out
  }, h)

// ---------------------------------------------------------------- the All grid
for (const [w, h] of [[1440, 900], [1920, 1080]]) {
  const page = await open(w, h)
  const pick = await pickPiece(page, null)
  console.log(`\n${w}px All grid: opening a piece of ${pick?.h} (${pick?.n} pieces)`)
  if (!pick) {
    check('a piece with a project block exists', false)
    await page.close()
    continue
  }
  const before = await restingWidths(page, pick.h)
  const tile = page.locator('#pf-grid .pf-item').nth(pick.i)
  await tile.scrollIntoViewIfNeeded()
  await tile.locator('.pf-item__img').click()
  await page.waitForTimeout(3500)
  const r = await measure(page)
  check(`${w}px: the shared gather is on`, r.cluster)
  check(`${w}px: the opened piece is three tiles of seven`, Math.abs(r.openedShare - 3 / 7) < 0.02, `${(r.openedShare * 7).toFixed(2)} tiles`)
  check(`${w}px: the project's block beside it, level with its top`, r.beside)
  check(`${w}px: the whole set inside the window`, r.outside === 0, `${r.setN} pieces, ${r.outside} outside`)
  check(`${w}px: nothing overlapping`, r.overlaps === 0, `${r.overlaps}`)
  check(`${w}px: the rest in level rows`, r.uneven === 0, `${r.rows} rows, ${r.uneven} uneven`)
  const during = await restingWidths(page, pick.h)
  const changed = Object.keys(during).filter((k) => k in before && Math.abs(during[k] - before[k]) > 1).length
  check(`${w}px: tiles outside the set keep their width`, changed === 0, `${changed} changed`)
  await page.locator('#pf-grid .pf-item.is-expanded .pf-item__img').click()
  await page.waitForTimeout(1500)
  const after = await measure(page)
  const back = await restingWidths(page, '')
  const off = Object.keys(before).filter((k) => k in back && Math.abs(back[k] - before[k]) > 1).length
  check(`${w}px: closing puts the resting grid back`, !after.cluster && off === 0, `cluster ${after.cluster}, ${off} tiles changed width`)
  await page.close()
}

// ---------------------------------------------------------------- Type / Lettering
{
  const page = await open(1440, 900)
  await page.click(`.pf-btn[data-filter="${TYPE}"]`)
  await page.waitForTimeout(900)
  const pick = await pickPiece(page, TYPE)
  console.log(`\nType view: opening a piece of ${pick?.h} (${pick?.n} pieces)`)
  if (pick) {
    const restN = await page.evaluate((sel) => Array.from(document.querySelectorAll('#pf-grid .pf-item')).filter((el) => getComputedStyle(el).display !== 'none' && el.matches(sel)).length, TYPE)
    const tile = page.locator('#pf-grid .pf-item').nth(pick.i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(3500)
    const r = await measure(page)
    const outsideType = await page.evaluate((sel) => Array.from(document.querySelectorAll('#pf-grid .pf-item.is-sibling')).filter((el) => getComputedStyle(el).display !== 'none' && !el.matches(sel)).length, TYPE)
    check('type: the opened piece is two tiles of four', Math.abs(r.openedShare - 0.5) < 0.02, `${(r.openedShare * 4).toFixed(2)} tiles`)
    check('type: the project\'s block beside it', r.beside)
    check('type: the whole project, pieces outside Type/Lettering included', outsideType > 0, `${outsideType} revealed`)
    check('type: inside the window, nothing overlapping', r.outside === 0 && r.overlaps === 0, `${r.outside} outside, ${r.overlaps} overlaps`)
    await page.locator('#pf-grid .pf-item.is-expanded .pf-item__img').click()
    await page.waitForTimeout(1500)
    const back = await page.evaluate((sel) => {
      const shown = Array.from(document.querySelectorAll('#pf-grid .pf-item')).filter((el) => getComputedStyle(el).display !== 'none')
      return {n: shown.length, other: shown.filter((el) => !el.matches(sel)).length}
    }, TYPE)
    check('type: closing hides the revealed pieces again', back.other === 0 && back.n === restN, `${back.n} shown, ${back.other} outside Type`)
  } else check('type: a piece with a project block exists', false)
  await page.close()
}

// ---------------------------------------------------------------- phone
{
  const page = await open(390, 664)
  const pick = await pickPiece(page, null)
  console.log(`\nphone All grid: opening a piece of ${pick?.h}`)
  if (pick) {
    const tile = page.locator('#pf-grid .pf-item').nth(pick.i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(3500)
    const r = await measure(page)
    check('phone: the opened piece runs the width', r.openedShare > 0.97, `${Math.round(r.openedShare * 100)}%`)
    check('phone: the block directly under it as its caption', r.under)
    check('phone: the piece itself fits the screen', r.shirtFits)
    check('phone: the set ends on the project button', r.end)
    check('phone: nothing overlapping, rows level', r.overlaps === 0 && r.uneven === 0, `${r.overlaps} overlaps, ${r.uneven} uneven`)
  } else check('phone: a piece with a project block exists', false)
  await page.close()
}

await browser.close()
console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('The shared gather behaves as asked.')
