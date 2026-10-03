/*
  How far a tile travels when you click it.

  WHY THIS EXISTS

  Chris: tiles in the later columns "snap to the left to fill the space"
  when clicked, and he wants them to open near where he clicked instead.

  The cause is not in doubt - masonry re-packs a two-column item into the
  leftmost column pair with the lowest bottom edge, which has no relationship
  to where the item was - but "how bad is it" and "which columns suffer" are
  the questions that decide whether this needs a new layout mode or a nudge.
  A tile that shifts half a column is a different problem from one that
  crosses the whole grid.

  So this clicks every tile in the first rows and records the horizontal
  distance its own box travels, in pixels and in columns, grouped by the
  column it started in. The prediction worth testing is that column 1 barely
  moves and the rightmost columns move furthest; if that is wrong, the fix
  aimed at it would be wrong too.

  Also records whether the tile stays within the viewport's vertical scroll
  position, because a tile that jumps upward out of view is a worse version
  of the same complaint.

  Usage: node scripts/diagnose-expand-jump.mjs [base-url] [columns]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const SAMPLE = Number(process.argv[3] ?? 14)

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(3000)

const colW = await page.evaluate(() => {
  const sizer = document.querySelector('.pf-sizer')
  return sizer ? sizer.getBoundingClientRect().width : 0
})
console.log(`${BASE}/portfolio`)
console.log(`  column width ${Math.round(colW)}px`)

const results = await page.evaluate(
  async ({sample, colW}) => {
    const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
    const grid = document.querySelector('.pf-grid')
    const gridLeft = grid.getBoundingClientRect().left
    const items = [...document.querySelectorAll('.pf-grid .pf-item')].slice(0, sample)
    const out = []

    for (const el of items) {
      // Start from a clean state so each measurement is independent - a tile
      // left expanded changes where the next one can go.
      document.querySelectorAll('.pf-item.is-expanded').forEach((e) => e.classList.remove('is-expanded'))
      await new Promise((r) => setTimeout(r, 450))

      const img = el.querySelector('img')
      const b = el.getBoundingClientRect()
      const beforeX = b.left - gridLeft
      const beforeY = b.top + window.scrollY

      el.click()
      await new Promise((r) => setTimeout(r, 900))

      const a = el.getBoundingClientRect()
      const afterX = a.left - gridLeft
      const afterY = a.top + window.scrollY

      out.push({
        alt: strip(img?.getAttribute('alt')).slice(0, 38),
        beforeCol: colW ? Math.round(beforeX / colW) + 1 : 0,
        afterCol: colW ? Math.round(afterX / colW) + 1 : 0,
        dxPx: Math.round(afterX - beforeX),
        dyPx: Math.round(afterY - beforeY),
      })
    }
    document.querySelectorAll('.pf-item.is-expanded').forEach((e) => e.classList.remove('is-expanded'))
    return out
  },
  {sample: SAMPLE, colW},
)

console.log(`\n  tile                                    from -> to    moved`)
for (const r of results) {
  const cols = colW ? (r.dxPx / colW).toFixed(1) : '?'
  const flag = Math.abs(r.dxPx) > colW * 0.5 ? '  <- jumps' : ''
  console.log(
    `  ${r.alt.padEnd(38)}  col ${String(r.beforeCol).padStart(2)} -> ${String(r.afterCol).padStart(2)}   ` +
      `${String(r.dxPx).padStart(6)}px (${cols} cols)${r.dyPx ? `, ${r.dyPx}px vertically` : ''}${flag}`,
  )
}

const jumps = results.filter((r) => Math.abs(r.dxPx) > colW * 0.5)
console.log(`\n  ${jumps.length} of ${results.length} tiles move more than half a column.`)

const byCol = {}
for (const r of results) {
  byCol[r.beforeCol] ??= []
  byCol[r.beforeCol].push(Math.abs(r.dxPx))
}
console.log('\n  average horizontal travel, by the column the tile started in:')
for (const [col, list] of Object.entries(byCol).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const avg = list.reduce((n, v) => n + v, 0) / list.length
  console.log(`    column ${String(col).padStart(2)}   ${Math.round(avg)}px  (${list.length} tile(s))`)
}

await browser.close()
