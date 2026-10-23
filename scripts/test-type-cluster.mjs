/*
  The Type tab as noise clusters (src/lib/typeCluster.ts), in a browser, on
  preview - against the faults Chris found in the first version: a pick
  replaced the whole cluster with no way back, and Shuffle and -/+ did
  nothing in this tab.

  At a desktop and a phone: the grid hidden and two clusters shown, the
  lettering above the illustration, nothing overlapping; a pick gathers
  the project with the rest of the cluster still there, dimmed, and a bar
  with the way back; "All type", Escape and the browser's back each
  return; Shuffle moves the pieces, + makes them larger and - smaller; and
  the All tab gives the grid back with every tile.

  Usage: node scripts/test-type-cluster.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()

const state = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector('.tc')
    const grid = document.querySelector('#pf-grid')
    const ps = Array.from(document.querySelectorAll('.tc-piece'))
    const rows = Array.from(document.querySelectorAll('.tc-pic'))
    const boxes = [...ps, ...rows].map((b) => b.getBoundingClientRect())
    let overlaps = 0
    for (let a = 0; a < boxes.length; a++)
      for (let z = a + 1; z < boxes.length; z++) {
        const w = Math.min(boxes[a].right, boxes[z].right) - Math.max(boxes[a].left, boxes[z].left)
        const h = Math.min(boxes[a].bottom, boxes[z].bottom) - Math.max(boxes[a].top, boxes[z].top)
        if (w > 1 && h > 1) overlaps++
      }
    const s = stage?.getBoundingClientRect()
    const outside = boxes.filter((b) => s && (b.left < s.left - 1 || b.right > s.right + 1)).length
    const kinds = ps.map((b) => b.getAttribute('aria-label'))
    return {
      showing: !!stage && !stage.hidden,
      gridHidden: getComputedStyle(grid).visibility === 'hidden',
      pieces: ps.length,
      pics: rows.length,
      viewing: !!document.querySelector('.tc-view')?.open,
      dim: ps.filter((b) => b.classList.contains('is-dim')).length,
      lead: ps.findIndex((b) => b.classList.contains('is-lead')),
      bar: !!document.querySelector('.tc-bar') && !document.querySelector('.tc-bar').hidden,
      overlaps,
      outside,
      area: ps.reduce((n, b) => n + b.getBoundingClientRect().width * b.getBoundingClientRect().height, 0),
      order: kinds.join('|'),
      tops: boxes.map((b) => Math.round(b.top + scrollY)).join(','),
      gridTiles: grid.querySelectorAll('.pf-item').length,
    }
  })

for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  await page.waitForTimeout(2000)
  const before = await page.evaluate(() => document.querySelectorAll('#pf-grid .pf-item').length)
  const counts = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('#pf-grid .pf-item.type-lettering'))
    return {words: t.filter((el) => el.dataset.kind !== 'Illustration').length, pics: t.filter((el) => el.dataset.kind === 'Illustration').length}
  })
  await page.click('.pf-btn[data-filter=".type-lettering"]')
  await page.waitForTimeout(2500)
  const rest = await state(page)
  check(`${name}: the Type tab shows the lettering and illustration and hides the grid`, rest.showing && rest.gridHidden)
  check(`${name}: the lettering is the cluster, the illustration the rows below`, rest.pieces === counts.words && rest.pics === counts.pics, `${rest.pieces} of ${counts.words} lettering, ${rest.pics} of ${counts.pics} illustration`)
  check(`${name}: nothing overlaps, nothing runs off the side`, rest.overlaps === 0 && rest.outside === 0, `${rest.overlaps} overlap(s), ${rest.outside} outside`)
  check(`${name}: nothing is dimmed and there is no bar at rest`, rest.dim === 0 && !rest.bar)

  // A pick: the piece in the middle of the first cluster.
  await page.locator('.tc-piece').nth(Math.floor(counts.words / 2)).click()
  await page.waitForTimeout(800)
  const open = await state(page)
  check(`${name}: a pick gathers, and the rest of the cluster stays`, open.lead >= 0 && open.pieces >= rest.pieces, `${open.pieces} pieces showing (was ${rest.pieces})`)
  check(`${name}: the rest is dimmed, the project is not`, open.dim > 0 && open.dim < open.pieces, `${open.dim} of ${open.pieces} dimmed`)
  check(`${name}: and the bar shows the way back`, open.bar)
  check(`${name}: still nothing overlaps`, open.overlaps === 0, `${open.overlaps}`)

  await page.click('.tc-back')
  await page.waitForTimeout(600)
  let back = await state(page)
  check(`${name}: "All type" returns to the clusters`, back.dim === 0 && !back.bar && back.pieces === rest.pieces)

  await page.locator('.tc-piece').nth(1).click()
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  back = await state(page)
  check(`${name}: so does Escape`, back.dim === 0 && !back.bar)

  await page.locator('.tc-piece').nth(2).click()
  await page.waitForTimeout(600)
  await page.goBack()
  await page.waitForTimeout(800)
  back = await state(page)
  check(`${name}: so does the browser's back, staying on the page`, back.showing && back.dim === 0 && !back.bar && page.url().includes('/portfolio'), page.url())

  await page.click('#pf-shuffle')
  await page.waitForTimeout(600)
  const shuffled = await state(page)
  check(`${name}: Shuffle moves the pieces`, shuffled.order !== back.order || shuffled.tops !== back.tops)
  await page.click('#pf-plus')
  await page.waitForTimeout(600)
  const bigger = await state(page)
  check(`${name}: + makes them larger`, bigger.area > shuffled.area * 1.05, `${Math.round(bigger.area / shuffled.area * 100)}%`)
  await page.click('#pf-minus')
  await page.click('#pf-minus')
  await page.waitForTimeout(600)
  const smaller = await state(page)
  check(`${name}: - makes them smaller`, smaller.area < bigger.area * 0.95, `${Math.round(smaller.area / bigger.area * 100)}%`)
  check(`${name}: and the hidden grid was left alone`, smaller.gridTiles === before)

  if (counts.pics) {
    await page.locator('.tc-pic').first().click()
    await page.waitForTimeout(500)
    const viewing = await state(page)
    check(`${name}: an illustration opens large`, viewing.viewing)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const closed = await state(page)
    check(`${name}: and Escape closes it, leaving the tab as it was`, !closed.viewing && closed.showing && closed.dim === 0)
  }

  await page.click('.pf-btn[data-filter="*"]')
  await page.waitForTimeout(1500)
  const all = await state(page)
  check(`${name}: the All tab gives the grid back, every tile`, !all.showing && !all.gridHidden && all.gridTiles === before)
  check(`${name}: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
