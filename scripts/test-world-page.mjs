/*
  The world page (/next/world/home, preview) in a browser, with blank
  pictures. For the height map, the biomes and the lands (also sorted by
  colour), at a desktop and a phone:
  every piece shown, none overlapping; a piece opened is larger than it
  was and opens as on the main grid - the navy hairline frame, its project
  bar, its set lit round it and the rest dropped back; in the lands a
  project's block of type beside it, clear of every piece; picking it
  again, Escape and the browser's back each close it, staying on the page;
  and no script errors.

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
      dim: ts.filter((t) => Number(getComputedStyle(t).opacity) < 0.5).length,
      framed: !!document.querySelector('.wd-piece.is-open') && getComputedStyle(document.querySelector('.wd-piece.is-open .wd-frame')).boxShadow.includes('inset'),
      bar: (() => {
        const b = document.querySelector('.wd-piece.is-open .wd-jump')
        return b ? getComputedStyle(b).display !== 'none' : null
      })(),
      card: (() => {
        const c = Array.from(document.querySelectorAll('.wd-card')).find((x) => !x.hidden)
        if (!c) return null
        const r = c.getBoundingClientRect()
        const hit = ts.some((t) => {
          const q = t.getBoundingClientRect()
          return Math.min(q.right, r.right) - Math.max(q.left, r.left) > 1 && Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top) > 1
        })
        return {hit, text: c.querySelector('.pf-card__title')?.textContent ?? ''}
      })(),
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
      const sized = await page.evaluate(() => new Set(Array.from(document.querySelectorAll('.wd-piece:not([hidden])')).map((t) => Math.round(t.getBoundingClientRect().width))).size)
      check(`${tag}: pieces of many sizes`, sized >= 3, `${sized} sizes`)
    }
    check(`${tag}: every piece shown, none overlapping`, rest.shown === rest.total && rest.overlaps === 0, `${rest.shown}/${rest.total}, ${rest.overlaps} overlap(s)`)
    // A case study, so it has a project, a bar and (in the lands) a card.
    const k = await page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).findIndex((t) => t.classList.contains('wd-piece--study')))
    const before = rest.sizes[k]
    await page.locator('.wd-piece:not([hidden]) .wd-pic').nth(k).click()
    await page.waitForTimeout(700)
    const open = await state(page)
    const i = await page.evaluate((k) => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden)[k]?.dataset.i, k)
    const after = await page.evaluate((i) => Math.round(document.querySelector(`.wd-piece[data-i="${i}"]`).getBoundingClientRect().width), i)
    check(`${tag}: a piece opens larger`, after > before, `${before}px to ${after}px`)
    check(`${tag}: the rest dims, its set does not`, open.dim > 0 && open.dim < open.shown, `${open.dim} of ${open.shown} dimmed`)
    check(`${tag}: it opens as on the main grid - the navy frame and its project bar`, open.framed && open.bar === true)
    if (mode.startsWith('lands')) check(`${tag}: the project's block of type beside it, on no piece`, open.card && !open.card.hit && open.card.text.length > 0, open.card ? `"${open.card.text}"` : 'no card')
    check(`${tag}: still nothing overlaps`, open.overlaps === 0, `${open.overlaps}`)
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).click()
    await page.waitForTimeout(600)
    let back = await state(page)
    check(`${tag}: picking it again closes it`, !back.framed && back.dim === 0)
    await page.locator('.wd-piece:not([hidden]) .wd-pic').nth(2).click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    back = await state(page)
    check(`${tag}: so does Escape`, !back.framed && back.dim === 0)
    await page.locator('.wd-piece:not([hidden]) .wd-pic').nth(4).click()
    await page.waitForTimeout(500)
    await page.goBack()
    await page.waitForTimeout(700)
    back = await state(page)
    check(`${tag}: so does the browser's back, staying on the page`, !back.framed && back.dim === 0 && page.url().includes('/next/world/'), page.url())
    check(`${tag}: no script errors`, errors.length === 0, errors.join(' | '))
    await page.close()
  }
}
await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
