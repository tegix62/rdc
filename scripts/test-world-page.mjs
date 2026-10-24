/*
  The world page (/next/world/home, preview) in a browser, with blank
  pictures. For the lands, the page's one mode now (also sorted by colour), at a desktop and a phone:
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
  for (const mode of ['lands']) {
    const page = await browser.newPage({viewport: {width: w, height: h}})
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}/next/world/home?mode=${mode}&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    await page.waitForTimeout(1500)
    const tag = `${name}, ${mode.replace('&sort=', ' by ')}`
    const rest = await state(page)
    if (name === 'phone') {
      const edge = await page.evaluate(() => {
        const r = document.querySelector('.wd-world').getBoundingClientRect()
        return {left: Math.round(r.left), right: Math.round(innerWidth - r.right), scroll: document.documentElement.scrollWidth > innerWidth}
      })
      check(`${tag}: to 4px from the screen's edges, no sideways scroll`, Math.abs(edge.left - 4) <= 1 && Math.abs(edge.right - 4) <= 1 && !edge.scroll, `${edge.left}px / ${edge.right}px`)
    }
    if (mode.startsWith('lands')) {
      const sized = await page.evaluate(() => new Set(Array.from(document.querySelectorAll('.wd-piece:not([hidden])')).map((t) => Math.round(t.getBoundingClientRect().width))).size)
      check(`${tag}: pieces of many sizes`, sized >= 3, `${sized} sizes`)
    }
    check(`${tag}: every piece shown, none overlapping`, rest.shown === rest.total && rest.overlaps === 0, `${rest.shown}/${rest.total}, ${rest.overlaps} overlap(s)`)
    // A case study, so it has a project, a bar and (in the lands) a card.
    const k = await page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).findIndex((t) => t.classList.contains('wd-piece--study')))
    const before = rest.sizes[k]
    // By its own number: the pieces are re-ordered in the page as they are laid.
    const i = await page.evaluate((k) => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden)[k]?.dataset.i, k)
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).click({position: {x: 4, y: 4}})
    await page.waitForTimeout(700)
    const open = await state(page)
    const after = await page.evaluate((i) => Math.round(document.querySelector(`.wd-piece[data-i="${i}"]`).getBoundingClientRect().width), i)
    check(`${tag}: a piece opens larger`, after > before, `${before}px to ${after}px`)
    check(`${tag}: the rest dims, its set does not`, open.dim > 0 && open.dim < open.shown, `${open.dim} of ${open.shown} dimmed`)
    check(`${tag}: it opens as on the main grid - the navy frame and its project bar`, open.framed && open.bar === true)
    if (mode.startsWith('lands')) check(`${tag}: the project's block of type beside it, on no piece`, open.card && !open.card.hit && open.card.text.length > 0, open.card ? `"${open.card.text}"` : 'no card')
    check(`${tag}: still nothing overlaps`, open.overlaps === 0, `${open.overlaps}`)
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).click({position: {x: 4, y: 4}})
    await page.waitForTimeout(600)
    let back = await state(page)
    check(`${tag}: picking it again closes it`, !back.framed && back.dim === 0)
    await page.locator('.wd-piece:not([hidden]) .wd-pic').nth(2).click({position: {x: 4, y: 4}})
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    back = await state(page)
    check(`${tag}: so does Escape`, !back.framed && back.dim === 0)
    await page.locator('.wd-piece:not([hidden]) .wd-pic').nth(4).click({position: {x: 4, y: 4}})
    await page.waitForTimeout(500)
    await page.goBack()
    await page.waitForTimeout(700)
    back = await state(page)
    check(`${tag}: so does the browser's back, staying on the page`, !back.framed && back.dim === 0 && page.url().includes('/next/world/'), page.url())
    check(`${tag}: no script errors`, errors.length === 0, errors.join(' | '))
    await page.close()
  }
}

/*
  The portfolio's controls and links, at a desktop and a phone: a filter
  other than All goes to the portfolio's own view of it; an opened piece is named there too, and that address, opened afresh,
  arrives with the piece open; + makes the tiles larger and - smaller;
  Shuffle deals a new world; the Tab key meets the pieces in the order they
  are seen; the tiles are trimmed to their artwork.
*/
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/next/world/home`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  const shown = () => page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).map((t) => ({i: Number(t.dataset.i), w: t.getBoundingClientRect().width})))
  const cats = await page.evaluate(() => JSON.parse(document.getElementById('wd-data').textContent).pieces.map((p) => p.cat))
  const allShown = await shown()
  const trimmed = await page.evaluate(() => Array.from(document.querySelectorAll('.wd-crop')).filter((c) => parseFloat(c.style.getPropertyValue('--iw')) > 100.5).length)
  check(`${name}: tiles trimmed to their artwork`, trimmed > 0, `${trimmed} of ${allShown.length} trimmed`)
  const order = await page.evaluate(() => {
    const ts = Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).map((t) => t.getBoundingClientRect())
    let wrong = 0
    for (let k = 1; k < ts.length; k++) if (ts[k].top < ts[k - 1].top - 1 || (Math.abs(ts[k].top - ts[k - 1].top) <= 1 && ts[k].left < ts[k - 1].left)) wrong++
    return wrong
  })
  check(`${name}: the Tab key meets them in the order they are seen`, order === 0, `${order} out of order`)
  // The other categories are the portfolio's own views.
  const merch = await page.locator('.pf-group--filters a', {hasText: 'Merch'}).getAttribute('href')
  check(`${name}: Merch & Apparel goes to the portfolio's own merch view`, merch === '/portfolio?view=merch', merch ?? 'none')
  const brand = await page.locator('.pf-group--filters a', {hasText: 'Brand Identity'}).getAttribute('href')
  check(`${name}: Brand Identity goes to the portfolio's old All grid`, brand === '/portfolio', brand ?? 'none')
  // And there, the portfolio's All comes back here.
  const there = await browser.newPage({viewport: {width: w, height: h}})
  await there.goto(`${BASE}${merch}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await there.waitForTimeout(1500)
  await there.locator('.pf-group--filters a.pf-btn', {hasText: /^\s*All\s*$/}).click()
  await there.waitForURL(/\/next\/world\//, {timeout: 15_000}).catch(() => {})
  check(`${name}: from there, All comes back to Lands`, there.url().includes('/next/world/'), there.url())
  await there.close()
  const before = await shown()
  const mean = (a) => a.reduce((x, t) => x + t.w, 0) / a.length
  await page.click('[data-zoom="1"]')
  await page.waitForTimeout(400)
  const bigger = await shown()
  await page.click('[data-zoom="-1"]')
  await page.click('[data-zoom="-1"]')
  await page.waitForTimeout(400)
  const smaller = await shown()
  check(`${name}: + larger tiles, - smaller, every piece still shown`, mean(bigger) > mean(before) && mean(smaller) < mean(before) && bigger.length === before.length && smaller.length === before.length, `${mean(smaller).toFixed(0)} / ${mean(before).toFixed(0)} / ${mean(bigger).toFixed(0)}px`)
  await page.click('[data-zoom="1"]')
  const seed0 = new URL(page.url()).searchParams.get('seed')
  await page.click('[data-roll]')
  await page.waitForTimeout(400)
  check(`${name}: Shuffle deals a new world`, new URL(page.url()).searchParams.get('seed') !== seed0, page.url())
  const k = await page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).findIndex((t) => t.classList.contains('wd-piece--study')))
  await page.locator('.wd-piece:not([hidden]) .wd-pic').nth(k).click({position: {x: 4, y: 4}})
  await page.waitForTimeout(600)
  const link = page.url()
  const openId = await page.evaluate(() => document.querySelector('.wd-piece.is-open')?.dataset.i)
  check(`${name}: an opened piece is named in the address`, new URL(link).searchParams.has('open'), link)
  const again = await browser.newPage({viewport: {width: w, height: h}})
  await again.goto(link, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await again.waitForTimeout(1500)
  const arrived = await again.evaluate(() => document.querySelector('.wd-piece.is-open')?.dataset.i)
  check(`${name}: that address, opened afresh, arrives with it open`, arrived !== undefined && arrived === openId, `piece ${arrived} (was ${openId})`)
  await again.close()
  check(`${name}: no script errors with the controls`, errors.length === 0, errors.join(' | '))
  await page.close()
}


/*
  Up close and Index (preview): every piece has its place, the pieces
  parented to one sit just under it, a row of the Index opens its piece in
  Up close, and the toolbars offer Up close in place of Type/Lettering.
*/
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/next/close/home`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1200)
  const uc = await page.evaluate(() => {
    const stops = Array.from(document.querySelectorAll('.uc-stop'))
    const deep = stops.filter((s) => !s.classList.contains('uc-stop--d0'))
    // Each deeper stop follows its piece, or another of that piece's.
    const orphan = deep.filter((s) => {
      const prev = s.previousElementSibling
      return !prev || !prev.classList.contains('uc-stop')
    }).length
    const wide = stops.filter((s) => s.getBoundingClientRect().width > innerWidth + 1).length
    return {stops: stops.length, deep: deep.length, orphan, wide, labelled: stops.filter((s) => s.querySelector('.uc-label__title')).length, ids: new Set(stops.map((s) => s.id)).size}
  })
  check(`${name}, up close: every piece has its place, labelled, by its own address`, uc.stops > 50 && uc.labelled === uc.stops && uc.ids === uc.stops, `${uc.stops} pieces, ${uc.labelled} labelled, ${uc.ids} addresses`)
  check(`${name}, up close: the pieces parented to one sit under it`, uc.deep > 0 && uc.orphan === 0, `${uc.deep} deeper`)
  check(`${name}, up close: nothing wider than the screen`, uc.wide === 0 && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${uc.wide}`)
  check(`${name}, up close: no script errors`, errors.length === 0, errors.join(' | '))
  await page.goto(`${BASE}/next/index/home`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(800)
  const first = await page.evaluate(() => ({rows: document.querySelectorAll('.ix-row').length, href: document.querySelector('.ix-title')?.getAttribute('href')}))
  check(`${name}, index: a row for every piece`, first.rows === uc.stops, `${first.rows} rows, ${uc.stops} pieces`)
  await page.click('.ix-title')
  await page.waitForTimeout(1200)
  const landed = await page.evaluate(() => {
    const el = document.getElementById(location.hash.slice(1))
    return el ? Math.round(el.getBoundingClientRect().top) : null
  })
  check(`${name}, index: a row opens its piece in Up close`, page.url().includes('/next/close/home#') && landed !== null && landed < 200, `${page.url()} at ${landed}px`)
  for (const path of ['/next/world/home', '/portfolio']) {
    await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    const bar = await page.evaluate(() => Array.from(document.querySelectorAll('.pf-group--filters .pf-btn')).map((b) => b.textContent.trim()))
    check(`${name}, ${path}: Up close in the toolbar, not Type/Lettering`, bar.includes('Up close') && !bar.some((t) => /type/i.test(t)), bar.join(' | '))
  }
  check(`${name}, the views: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
