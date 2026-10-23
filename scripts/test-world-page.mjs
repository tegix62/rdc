/*
  The world page (/next/world/home, preview) in a browser, with blank
  pictures. For the height map, the biomes and the lands (also sorted by
  colour), at a desktop and a phone:
  every piece shown, none overlapping; a piece opened is larger than it
  was, its set lit round it and the rest dimmed, with the bar and the way
  back; "All work", Escape and the browser's back each close it, staying
  on the page; and no script errors.

  Usage: node scripts/test-world-page.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const state = (page) =>
  page.evaluate(() => {
    const ts = Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden)
    const boxes = ts.map((t) => t.getBoundingClientRect())
    let overlaps = 0
    for (let a = 0; a < boxes.length; a++)
      for (let z = a + 1; z < boxes.length; z++) {
        const w = Math.min(boxes[a].right, boxes[z].right) - Math.max(boxes[a].left, boxes[z].left)
        const h = Math.min(boxes[a].bottom, boxes[z].bottom) - Math.max(boxes[a].top, boxes[z].top)
        if (w > 1 && h > 1) overlaps++
      }
    return {
      total: document.querySelectorAll('.wd-piece').length,
      shown: ts.length,
      dim: ts.filter((t) => t.style.opacity === '0.3').length,
      bar: !document.querySelector('[data-open]').hidden,
      overlaps,
      sizes: ts.map((t) => Math.round(t.getBoundingClientRect().width)),
    }
  })

const browser = await chromium.launch()
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  for (const mode of ['heights', 'biomes', 'lands', 'lands&sort=colour']) {
    const page = await browser.newPage({viewport: {width: w, height: h}})
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}/next/world/home?mode=${mode}&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    await page.waitForTimeout(1500)
    const tag = `${name}, ${mode.replace('&sort=', ' by ')}`
    const rest = await state(page)
    if (mode.startsWith('lands')) {
      const land = await page.evaluate(() => ({sized: Array.from(new Set(Array.from(document.querySelectorAll('.wd-piece:not([hidden])')).map((t) => Math.round(t.getBoundingClientRect().width)))).length, canvas: !!document.querySelector('.wd-world canvas')}))
      check(`${tag}: the land drawn, pieces of many sizes`, land.canvas && land.sized >= 4, `${land.sized} sizes`)
    }
    check(`${tag}: every piece shown, none overlapping`, rest.shown === rest.total && rest.overlaps === 0, `${rest.shown}/${rest.total}, ${rest.overlaps} overlap(s)`)
    const k = Math.floor(rest.shown / 3)
    const before = rest.sizes[k]
    await page.locator('.wd-piece:not([hidden])').nth(k).click()
    await page.waitForTimeout(700)
    const open = await state(page)
    const i = await page.evaluate((k) => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden)[k]?.dataset.i, k)
    const after = await page.evaluate((i) => Math.round(document.querySelector(`.wd-piece[data-i="${i}"]`).getBoundingClientRect().width), i)
    check(`${tag}: a piece opens larger`, after > before, `${before}px to ${after}px`)
    check(`${tag}: the rest dims, its set does not`, open.dim > 0 && open.dim < open.shown, `${open.dim} of ${open.shown} dimmed`)
    check(`${tag}: the bar shows the way back`, open.bar)
    check(`${tag}: still nothing overlaps`, open.overlaps === 0, `${open.overlaps}`)
    await page.click('[data-open] button')
    await page.waitForTimeout(600)
    let back = await state(page)
    check(`${tag}: "All work" closes it`, !back.bar && back.dim === 0)
    await page.locator('.wd-piece:not([hidden])').nth(2).click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    back = await state(page)
    check(`${tag}: so does Escape`, !back.bar && back.dim === 0)
    await page.locator('.wd-piece:not([hidden])').nth(4).click()
    await page.waitForTimeout(500)
    await page.goBack()
    await page.waitForTimeout(700)
    back = await state(page)
    check(`${tag}: so does the browser's back, staying on the page`, !back.bar && back.dim === 0 && page.url().includes('/next/world/'), page.url())
    check(`${tag}: no script errors`, errors.length === 0, errors.join(' | '))
    await page.close()
  }
}
await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
