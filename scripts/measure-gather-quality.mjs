/*
  How good is a gather, in numbers - the All view's shared gather.

  Chris, with a screenshot of DumpStat gathered: "we often get strange
  lockups like this in the ALL page". In it, a wordmark sat alone in a row
  of its own with the rest of the row empty, and the project's block took
  the full width of the side with its words in the left half. Neither is
  rare - they follow from how rows are filled - so this opens a spread of
  pieces from every project at three window sizes and counts:

    orphan rows   a row of the rest, beside or under the opened piece, that
                  runs less than 60% of the width the other rows run - the
                  "one wordmark and a lot of white" row
    sparse block  the project's block, whose words fill less than 60% of
                  its width
    out of view   pieces of the set past the bottom of the window
    overlaps      any two shown tiles overlapping

  Prints each gather that has a problem, then the totals.

  Usage: node scripts/measure-gather-quality.mjs [base-url] [per-project]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PER = Number(process.argv[3] ?? 3)
// Pictures: every flagged gather, and the first of each project per size.
const OUT = process.argv[4] ?? ''
if (OUT) (await import('node:fs')).mkdirSync(OUT, {recursive: true})
const SIZES = [
  [1440, 900],
  [1920, 1080],
  [1280, 800],
  // Chris's own window: his screenshots are 1920 wide and under 900 tall.
  [1920, 890],
]

const browser = await chromium.launch()
const totals = {gathers: 0, orphanRows: 0, gathersWithOrphans: 0, sparseBlocks: 0, lowFill: 0, outOfView: 0, overlaps: 0}
// The rest reaching under 70% of the way down the opened piece.
const LOW_REACH = 0.7

async function open(w, h) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  await page.waitForTimeout(2000)
  return page
}

// Up to PER pieces of each project, spread across its run so the opened
// piece lands left, middle and right: indexes into all .pf-item.
const pickAll = (page) =>
  page.evaluate((per) => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
    const by = new Map()
    for (const el of all) {
      const h = href(el)
      if (!h || el.classList.contains('pf-item--study') || getComputedStyle(el).display === 'none') continue
      if (!by.has(h)) by.set(h, [])
      by.get(h).push(el)
    }
    const out = []
    for (const [h, els] of by) {
      if (els.length < 3) continue
      const step = Math.max(1, Math.floor(els.length / per))
      for (let i = 0; i < els.length && out.filter((o) => o.h === h).length < per; i += step)
        out.push({h, i: all.indexOf(els[i]), piece: els[i].dataset.piece})
      // And always its widest piece, if it is wide: Chris's Hug a Mug
      // screenshot, the mug photograph opened and one thin row beside it.
      // The deal is shuffled, so a spread alone misses it most runs.
      const aspect = (el) => {
        const img = el.querySelector('.pf-item__img')
        return Number(img?.getAttribute('width')) / Number(img?.getAttribute('height')) || 0
      }
      // And its widest photograph, apart from marks (his Adelante hoodie
      // screenshot).
      const isMark = (el) => el.classList.contains('pf-item--mark') || el.dataset.wide !== undefined
      const photos = els.filter((el) => !isMark(el))
      for (const pool of [els, photos]) {
        if (!pool.length) continue
        const widest = pool.reduce((a, b) => (aspect(b) > aspect(a) ? b : a))
        if (aspect(widest) >= 1.25 && !out.some((o) => o.piece === widest.dataset.piece))
          out.push({h, i: all.indexOf(widest), piece: widest.dataset.piece, wide: true})
      }
    }
    return out
  }, PER)

const measure = (page) =>
  page.evaluate(() => {
    const grid = document.querySelector('#pf-grid')
    const shown = Array.from(grid.querySelectorAll('.pf-item')).filter((el) => getComputedStyle(el).display !== 'none')
    const set = shown.filter((el) => el.classList.contains('is-sibling') || el.classList.contains('is-expanded'))
    const opened = grid.querySelector('.pf-item.is-expanded')
    const card = grid.querySelector('.pf-item.is-card')
    const rest = set.filter((el) => el.classList.contains('is-justified')).map((el) => ({el, b: el.getBoundingClientRect()}))
    // Rows: same top within 2px.
    const rows = []
    for (const r of rest.sort((a, b) => a.b.top - b.b.top || a.b.left - b.b.left)) {
      const row = rows.find((x) => Math.abs(x.top - r.b.top) < 2 && Math.abs(x.h - r.b.height) < 3)
      if (row) {
        row.left = Math.min(row.left, r.b.left)
        row.right = Math.max(row.right, r.b.right)
        row.n++
        row.names.push(r.el.dataset.piece)
      } else rows.push({top: r.b.top, h: r.b.height, left: r.b.left, right: r.b.right, n: 1, names: [r.el.dataset.piece]})
    }
    const widest = Math.max(0, ...rows.map((r) => r.right - r.left))
    const orphans = rows.filter((r) => r.right - r.left < 0.6 * widest)
    // The block: how much of its width its words use.
    let blockFill = 1
    if (card) {
      const cb = card.getBoundingClientRect()
      const words = card.querySelector('.pf-card')
      if (words) {
        let right = cb.left
        for (const k of words.querySelectorAll('*')) {
          const b = k.getBoundingClientRect()
          if (b.width > 0 && b.height > 0) right = Math.max(right, b.right)
        }
        blockFill = (right - cb.left) / cb.width
      }
    }
    const boxes = shown.map((el) => el.getBoundingClientRect())
    let overlaps = 0
    for (let a = 0; a < boxes.length; a++)
      for (let z = a + 1; z < boxes.length; z++) {
        const w = Math.min(boxes[a].right, boxes[z].right) - Math.max(boxes[a].left, boxes[z].left)
        const h = Math.min(boxes[a].bottom, boxes[z].bottom) - Math.max(boxes[a].top, boxes[z].top)
        if (w > 2 && h > 2) overlaps++
      }
    const ob = opened?.getBoundingClientRect()
    return {
      cluster: grid.classList.contains('is-cluster'),
      opened: opened?.dataset.piece,
      openedSide: ob ? (ob.left < 40 ? 'left' : ob.right > grid.getBoundingClientRect().right - 40 ? 'right' : 'middle') : '-',
      setN: set.length,
      rows: rows.map((r) => ({n: r.n, w: Math.round(r.right - r.left), h: Math.round(r.h), names: r.names})),
      widest: Math.round(widest),
      orphans: orphans.map((r) => `${r.n} piece(s), ${Math.round(r.right - r.left)}px of ${Math.round(widest)}: ${r.names.join(', ')}`),
      blockFill: +blockFill.toFixed(2),
      // How far down the opened piece's height the rest reaches, from the
      // top of the set: one thin row over a band of white reads low.
      reach: (() => {
        // The rest and the piece's own shots (near) - Adelante's shots
        // stack beside the photograph and fill the band themselves.
        const others = set.filter((el) => el !== opened && el !== card).map((el) => el.getBoundingClientRect())
        if (!ob || !others.length) return null
        const top = Math.min(ob.top, card ? card.getBoundingClientRect().top : ob.top)
        return +((Math.max(...others.map((b) => b.bottom)) - top) / (ob.bottom - top)).toFixed(2)
      })(),
      outOfView: set.filter((el) => el.getBoundingClientRect().bottom > innerHeight + 1).length,
      overlaps,
    }
  })

for (const [w, h] of SIZES) {
  let page = await open(w, h)
  const picks = await pickAll(page)
  console.log(`\n==== ${w}x${h}: ${picks.length} gathers`)
  for (const p of picks) {
    await page.close()
    page = await open(w, h)
    const tile = page.locator('#pf-grid .pf-item').nth(p.i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(3000)
    const m = await measure(page)
    totals.gathers++
    totals.orphanRows += m.orphans.length
    if (m.orphans.length) totals.gathersWithOrphans++
    if (m.blockFill < 0.6) totals.sparseBlocks++
    const low = m.reach !== null && m.reach < LOW_REACH
    if (low) totals.lowFill++
    totals.outOfView += m.outOfView ? 1 : 0
    totals.overlaps += m.overlaps ? 1 : 0
    const bad = m.orphans.length || m.blockFill < 0.6 || low || m.outOfView || m.overlaps
    const firstOfProject = picks.findIndex((q) => q.h === p.h) === picks.indexOf(p)
    if (OUT && (bad || firstOfProject || p.wide)) {
      const slug = p.h.split('/').filter(Boolean).pop()
      await page.screenshot({path: `${OUT}/${w}-${slug}-${picks.indexOf(p)}${p.wide ? '-wide' : ''}${bad ? '-bad' : ''}.png`})
    }
    console.log(
      `${bad ? 'BAD ' : 'ok  '} ${p.h} :: ${m.opened} (${m.openedSide}) - ${m.setN} in set, ${m.rows.length} rows ` +
        `[${m.rows.map((r) => `${r.n}@${r.h}`).join(' ')}], block fill ${m.blockFill}, reach ${m.reach ?? '-'}${p.wide ? ' (widest)' : ''}` +
        `${m.outOfView ? `, ${m.outOfView} out of view` : ''}${m.overlaps ? `, ${m.overlaps} overlaps` : ''}`,
    )
    for (const o of m.orphans) console.log(`       orphan row: ${o}`)
  }
  await page.close()
}
await browser.close()

console.log(
  `\nTOTAL ${totals.gathers} gathers: ${totals.gathersWithOrphans} with orphan rows (${totals.orphanRows} rows), ` +
    `${totals.sparseBlocks} sparse blocks, ${totals.lowFill} with the rest under ${LOW_REACH * 100}% of the way down, ${totals.outOfView} with pieces out of view, ${totals.overlaps} with overlaps`,
)
