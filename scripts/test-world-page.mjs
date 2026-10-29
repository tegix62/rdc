/*
  The portfolio's views in a browser, with blank pictures - All (Lands,
  /portfolio?view=all), Type/Lettering (?view=type) and Up close, and the
  switching between them on the one page. For the lands, the page's one mode now (also sorted by colour), at a desktop and a phone:
  every piece shown, none overlapping; a piece opened opens as on the main
  grid - the navy hairline frame, its project bar, its set lit round it and
  the rest dropped back, nothing else moving. On the live site it keeps its
  place and the project's block of type floats in view; on the preview it
  GROWS where it is, the block of type inside it, all of it in sight (on a
  phone the rest below moves down to make room, covering nothing), and
  closed it goes back exactly where it was. Picking it again, Escape and
  the browser's back each close it, staying on the page; and no script
  errors.

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
    await page.goto(`${BASE}/portfolio?view=all&mode=${mode}&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    await page.waitForTimeout(1500)
    const tag = `${name}, ${mode.replace('&sort=', ' by ')}`
    const rest = await state(page)
    if (name === 'phone') {
      const edge = await page.evaluate(() => {
        const r = document.querySelector('.wd-world').getBoundingClientRect()
        // What sticks out, if anything does: its class and how far.
        const out = Array.from(document.querySelectorAll('body *')).map((e) => [e, e.getBoundingClientRect()]).filter(([, b]) => b.width && b.right > innerWidth + 1).map(([e, b]) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} +${Math.round(b.right - innerWidth)}`).slice(0, 4)
        return {left: Math.round(r.left), right: Math.round(innerWidth - r.right), scroll: document.documentElement.scrollWidth > innerWidth, out}
      })
      check(`${tag}: to 4px from the screen's edges, no sideways scroll`, Math.abs(edge.left - 4) <= 1 && Math.abs(edge.right - 4) <= 1 && !edge.scroll, `${edge.left}px / ${edge.right}px ${edge.out.join(', ')}`)
    }
    if (mode.startsWith('lands')) {
      const sized = await page.evaluate(() => new Set(Array.from(document.querySelectorAll('.wd-piece:not([hidden])')).map((t) => Math.round(t.getBoundingClientRect().width))).size)
      check(`${tag}: pieces of many sizes`, sized >= 3, `${sized} sizes`)
    }
    check(`${tag}: every piece shown, none overlapping`, rest.shown === rest.total && rest.overlaps === 0, `${rest.shown}/${rest.total}, ${rest.overlaps} overlap(s)`)
    // A case study, so it has a project, a bar and (in the lands) a card.
    const k = await page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).findIndex((t) => t.classList.contains('wd-piece--study')))
    // By its own number: the pieces are re-ordered in the page as they are laid.
    const i = await page.evaluate((k) => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden)[k]?.dataset.i, k)
    const where = (i) => page.evaluate((i) => {
      const r = document.querySelector(`.wd-piece[data-i="${i}"]`).getBoundingClientRect()
      return {x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height)}
    }, i)
    // Every other piece's place, to see that nothing else moves.
    const others = (i) => page.evaluate((i) => Array.from(document.querySelectorAll('.wd-piece:not([hidden])')).filter((t) => t.dataset.i !== String(i)).map((t) => {
      const r = t.getBoundingClientRect()
      return `${t.dataset.i}:${Math.round(r.left)},${Math.round(r.top + scrollY)},${Math.round(r.width)},${Math.round(r.height)}`
    }).sort().join(' '), i)
    const grow = await page.evaluate(() => JSON.parse(document.getElementById('wd-data').textContent).grow === true)
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).scrollIntoViewIfNeeded()
    const before = await where(i)
    const othersBefore = await others(i)
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).click({position: {x: 4, y: 4}})
    await page.waitForTimeout(900)
    const open = await state(page)
    const after = await where(i)
    const othersAfter = await others(i)
    if (grow && name === 'phone') {
      // A phone's drawer (Chris: "it obscures the highlighted images that are related"):
      // the rest keeps its columns and sizes, those below move down by one amount, and nothing is covered.
      const parse = (t) => new Map(t.split(' ').map((e) => { const [k, v] = e.split(':'); return [k, v.split(',').map(Number)] }))
      const a = parse(othersBefore), z = parse(othersAfter)
      const moves = new Set([...a].map(([k, [x, y, w, h]]) => { const [x2, y2, w2, h2] = z.get(k); return x2 === x && w2 === w && h2 === h ? y2 - y : NaN }))
      const dy = [...moves].filter((m) => m > 1)
      check(`${tag}: the rest makes room below it, nothing covered`, !moves.has(NaN) && [...moves].every((m) => m >= -1) && dy.length > 0 && Math.max(...dy) - Math.min(...dy) <= 1 && open.overlaps === 0, `moves ${[...moves].join(',')}; ${open.overlaps} overlap(s)`)
    } else check(`${tag}: nothing else moves`, othersAfter === othersBefore)
    check(`${tag}: the rest dims, its set does not`, open.dim > 0 && open.dim < open.shown, `${open.dim} of ${open.shown} dimmed`)
    check(`${tag}: it opens as on the main grid - the navy frame and its project bar`, open.framed && open.bar === true)
    if (grow) {
      // Chris: "instead of having something shrink when clicked, it actually expands".
      check(`${tag}: it grows, near where it was`, after.w > before.w * (name === 'phone' ? 1 : 1.3) && after.h > before.h && Math.abs(after.y + after.h / 2 - (before.y + before.h / 2)) < 900, `${JSON.stringify(before)} then ${JSON.stringify(after)}`)
      // Chris: "it does obscure some of the highlighted related tiles" - it opens where it covers as little of its set as it can.
      const set = await page.evaluate((i) => {
        const o = document.querySelector(`.wd-piece[data-i="${i}"]`).getBoundingClientRect()
        return Array.from(document.querySelectorAll('.wd-piece.is-sibling:not([hidden])')).filter((t) => t.dataset.i !== String(i)).map((t) => {
          const r = t.getBoundingClientRect()
          const w = Math.min(o.right, r.right) - Math.max(o.left, r.left)
          const h = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top)
          return w > 0 && h > 0 ? (w * h) / (r.width * r.height) : 0
        })
      }, i)
      check(`${tag}: it covers none of the rest of its set`, set.every((f) => f < 0.05), `${set.length} lit, covered ${set.map((f) => Math.round(f * 100) + '%').join(' ')}`)
      const inside = await page.evaluate((i) => {
        const t = document.querySelector(`.wd-piece[data-i="${i}"]`)
        const r = t.getBoundingClientRect()
        const c = t.querySelector('.wd-card')
        return {text: c?.querySelector('.pf-card__title')?.textContent ?? '', inView: r.top >= -1 && r.bottom <= innerHeight + 1, floats: document.querySelectorAll('.wd-card--float').length}
      }, i)
      check(`${tag}: its project's block of type is inside it, and none floats`, inside.text.length > 0 && inside.floats === 0, JSON.stringify(inside))
      check(`${tag}: all of it in sight`, inside.inView)
    } else {
      // Lands opens in place (Chris: "throw transparency on everything else"): nothing moves.
      check(`${tag}: it opens in place - nothing moves`, after.x === before.x && after.y === before.y && after.w === before.w, `${JSON.stringify(before)} then ${JSON.stringify(after)}`)
      const floats = await page.evaluate(() => {
        const c = Array.from(document.querySelectorAll('.wd-card')).find((x) => !x.hidden)
        if (!c) return null
        const r = c.getBoundingClientRect()
        return {fixed: getComputedStyle(c).position === 'fixed', inView: r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1}
      })
      check(`${tag}: the project's block of type floats in view`, open.card && open.card.text.length > 0 && floats?.fixed && floats?.inView, open.card ? `"${open.card.text}" ${JSON.stringify(floats)}` : 'no card')
      check(`${tag}: still nothing overlaps`, open.overlaps === 0, `${open.overlaps}`)
    }
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).click({position: {x: 4, y: 4}})
    await page.waitForTimeout(700)
    let back = await state(page)
    check(`${tag}: picking it again closes it`, !back.framed && back.dim === 0)
    const home = await where(i)
    check(`${tag}: and it goes back exactly where it was`, home.x === before.x && home.y === before.y && home.w === before.w && home.h === before.h && back.overlaps === 0, `${JSON.stringify(before)} then ${JSON.stringify(home)}`)
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
    check(`${tag}: so does the browser's back, staying on the page`, !back.framed && back.dim === 0 && page.url().includes('view=all'), page.url())
    if (grow && name === 'phone') {
      // Chris: "these marks can get too separated from their related highlighted component tiles" - the drawer carries them.
      await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).click({position: {x: 4, y: 4}})
      await page.waitForTimeout(900)
      const kin = await page.evaluate(() => ({picks: document.querySelectorAll('.wd-piece.is-open .wd-kin__pick').length, lit: document.querySelectorAll('.wd-piece.is-sibling:not(.is-open):not([hidden])').length}))
      check(`${tag}: the drawer carries the rest of its set`, kin.picks > 0 && kin.picks === kin.lit, JSON.stringify(kin))
      await page.locator('.wd-piece.is-open .wd-kin__pick').first().click()
      await page.waitForTimeout(900)
      const now = await page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece.is-open')).map((t) => t.dataset.i))
      check(`${tag}: and a picture there opens that piece`, now.length === 1 && now[0] !== String(i), JSON.stringify(now))
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
    }
    check(`${tag}: no script errors`, errors.length === 0, errors.join(' | '))
    await page.close()
  }
}

/*
  The portfolio's controls and links, at a desktop and a phone: a filter
  other than All goes to the portfolio's own view of it; an opened piece is named there too, and that address, opened afresh,
  arrives with the piece open; + makes the tiles larger and - smaller;
  Shuffle deals a new world; the Tab key meets the pieces in the order they
  are seen; no picture is cut down.
*/
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/portfolio?view=all`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  // The pictures: a result tile (a block of words, preview) is not one.
  const shown = () => page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece:not(.wd-piece--result)')).filter((t) => !t.hidden).map((t) => ({i: Number(t.dataset.i), w: t.getBoundingClientRect().width})))
  const cats = await page.evaluate(() => JSON.parse(document.getElementById('wd-data').textContent).pieces.map((p) => p.cat))
  const allShown = await shown()
  const trimmed = await page.evaluate(() => Array.from(document.querySelectorAll('.wd-crop')).filter((c) => parseFloat(c.style.getPropertyValue('--iw')) > 100.5).length)
  // Never trimmed: a trim from the tiny previews cut "The Sun" to the word THE.
  check(`${name}: no picture cut down - each shown whole`, trimmed === 0, `${trimmed} of ${allShown.length} cut`)
  const order = await page.evaluate(() => {
    const ts = Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).map((t) => t.getBoundingClientRect())
    let wrong = 0
    for (let k = 1; k < ts.length; k++) if (ts[k].top < ts[k - 1].top - 1 || (Math.abs(ts[k].top - ts[k - 1].top) <= 1 && ts[k].left < ts[k - 1].left)) wrong++
    return wrong
  })
  check(`${name}: the Tab key meets them in the order they are seen`, order === 0, `${order} out of order`)
  /*
    ONE PAGE, EVERY VIEW (Chris: "I don't think the views need to be
    separate pages"): each button shows its view in place - the same
    document throughout, the address naming the view - and All comes back
    laid out whole.
  */
  await page.evaluate(() => (window.__samePage = true))
  const paneNow = () =>
    page.evaluate(() => ({
      same: window.__samePage === true,
      view: new URL(location.href).searchParams.get('view'),
      grid: !document.querySelector('#pf-grid').classList.contains('is-away'),
      all: !document.querySelector('.pf-pane[data-pane="all"]').classList.contains('is-away'),
      type: !document.querySelector('.pf-pane[data-pane="type"]').classList.contains('is-away'),
      active: Array.from(document.querySelectorAll('.pf-group--filters .pf-btn.is-active')).map((b) => b.textContent.trim()),
      tiles: Array.from(document.querySelectorAll('#pf-grid .pf-item')).filter((t) => t.offsetParent && t.getBoundingClientRect().width > 20).length,
    }))
  await page.locator('.pf-group--filters .pf-btn', {hasText: 'Merch'}).click()
  await page.waitForTimeout(900)
  let v = await paneNow()
  check(`${name}: Merch & Apparel shows in place`, v.same && v.view === 'merch' && v.grid && !v.all && !v.type && v.tiles > 0 && v.active.join() === 'Merch & Apparel', JSON.stringify(v))
  await page.locator('.pf-group--filters .pf-btn', {hasText: 'Type/Lettering'}).click()
  await page.waitForTimeout(600)
  v = await paneNow()
  check(`${name}: Type/Lettering shows in place`, v.same && v.view === 'type' && v.type && !v.grid && !v.all && v.active.join() === 'Type/Lettering', JSON.stringify(v))
  await page.locator('.pf-group--filters .pf-btn', {hasText: 'Brand Identity'}).click()
  await page.waitForTimeout(900)
  v = await paneNow()
  check(`${name}: Brand Identity shows the old All grid in place`, v.same && v.view === null && v.grid && !v.type && v.tiles > 10 && v.active.join() === 'Brand Identity', JSON.stringify(v))
  await page.locator('.pf-group--filters .pf-btn', {hasText: /^\s*All\s*$/}).click()
  await page.waitForTimeout(800)
  v = await paneNow()
  const back = await shown()
  check(`${name}: All comes back in place, laid out whole`, v.same && v.view === 'all' && v.all && !v.grid && back.length === allShown.length && back.every((t) => t.w > 10), `${JSON.stringify(v)} ${back.length} pieces`)
  const arrangeShown = await page.evaluate(() => Array.from(document.querySelectorAll('.pf-group--arrange')).filter((g) => getComputedStyle(g).display !== 'none').map((g) => g.dataset.for))
  check(`${name}: one set of arrange controls, All's own`, arrangeShown.join() === 'all', arrangeShown.join())
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
  Up close; the toolbars offer Type/Lettering, a row per project.
*/
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/portfolio/up-close`, {waitUntil: 'domcontentloaded', timeout: 60_000})
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
  // Index and the front page are preview-only; on the live site they are
  // not there, and are skipped rather than failed.
  const indexHere = (await page.goto(`${BASE}/next/index/home`, {waitUntil: 'domcontentloaded', timeout: 60_000}))?.ok()
  if (indexHere) {
  await page.waitForTimeout(800)
  const first = await page.evaluate(() => ({rows: document.querySelectorAll('.ix-row').length, href: document.querySelector('.ix-title')?.getAttribute('href')}))
  check(`${name}, index: a row for every piece`, first.rows === uc.stops, `${first.rows} rows, ${uc.stops} pieces`)
  await page.click('.ix-title')
  await page.waitForTimeout(1200)
  const landed = await page.evaluate(() => {
    const el = document.getElementById(location.hash.slice(1))
    return el ? Math.round(el.getBoundingClientRect().top) : null
  })
  check(`${name}, index: a row opens its piece in Up close`, /\/portfolio\/up-close\/?#/.test(page.url()) && landed !== null && landed < 200, `${page.url()} at ${landed}px`)
  } else console.log(`skip  ${name}, index: not on this site (preview only)`)
  for (const path of ['/portfolio?view=all', '/portfolio', '/portfolio/up-close', ...(indexHere ? ['/next/index/home'] : [])]) {
    await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    const bar = await page.evaluate(() => Array.from(document.querySelectorAll('.pf-group--filters .pf-btn')).map((b) => [b.textContent.trim(), b.getAttribute('href'), b.dataset.pane]))
    check(`${name}, ${path}: Type/Lettering in the toolbar, to the rows`, bar.some(([t, h, pane]) => t === 'Type/Lettering' && (h === '/portfolio?view=type' || pane === 'type')) && !bar.some(([t]) => t === 'Up close'), bar.map(([t]) => t).join(' | '))
  }

  // Type/Lettering: a row per project, each named, its pieces at one
  // height, sideways inside the row and never the page; a piece opens in
  // Up close.
  await page.goto(`${BASE}/portfolio?view=type`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1200)
  const ty = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.ty-row'))
    const uneven = rows.filter((r) => {
      const hs = Array.from(r.querySelectorAll('.ty-piece')).map((p) => Math.round(p.getBoundingClientRect().height))
      return !hs.length || Math.max(...hs) - Math.min(...hs) > 1
    }).length
    return {
      rows: rows.length,
      named: rows.filter((r) => r.querySelector('.ty-title')?.textContent.trim()).length,
      blurbs: rows.filter((r) => r.querySelector('.ty-line')).length,
      projects: rows.filter((r) => r.querySelector('.ty-go')).length,
      uneven,
      pieces: document.querySelectorAll('.ty-piece').length,
      pageWide: document.documentElement.scrollWidth > innerWidth,
      active: document.querySelector('.pf-btn.is-active')?.textContent.trim(),
    }
  })
  check(`${name}, type rows: a named row per project, with its blurb`, ty.projects >= 4 && ty.named === ty.rows && ty.blurbs >= ty.projects - 1, `${ty.rows} rows (${ty.projects} projects), ${ty.named} named, ${ty.blurbs} with a blurb`)
  check(`${name}, type rows: one height per row, nothing wider than the screen`, ty.uneven === 0 && !ty.pageWide && ty.pieces > 30, `${ty.pieces} pieces, ${ty.uneven} uneven rows`)
  check(`${name}, type rows: Type/Lettering lit`, ty.active === 'Type/Lettering', ty.active)
  // The rows start at the toolbar's left edge.
  const edges = await page.evaluate(() => ({
    bar: Math.round(document.querySelector('.pf-controls .pf-btn').getBoundingClientRect().left),
    row: Math.round(document.querySelector('.ty-head').getBoundingClientRect().left),
  }))
  check(`${name}, type rows: lined up with the toolbar`, Math.abs(edges.bar - edges.row) <= 1, `toolbar ${edges.bar}px, rows ${edges.row}px`)
  // A piece opens here, over the rows, and every way of closing it leaves
  // the page where it was.
  const here = page.url()
  const viewer = () => page.evaluate(() => {
    const d = document.querySelector('.ty-view')
    const i = d.querySelector('.ty-view__img').getBoundingClientRect()
    return {open: d.open, title: d.querySelector('.ty-view__title').textContent.trim(), count: d.querySelector('.ty-view__count').textContent, img: Math.round(i.width) > 100 && i.left >= 0 && i.right <= innerWidth + 1 && i.bottom <= innerHeight + 1}
  })
  await page.locator('.ty-piece a').nth(1).click()
  await page.waitForTimeout(800)
  let v = await viewer()
  check(`${name}, type rows: a piece opens here, large and named`, v.open && v.title && v.img && page.url() === here, `${JSON.stringify(v)} ${page.url()}`)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  const stepped = await viewer()
  check(`${name}, type rows: the arrow keys step along the row`, stepped.open && stepped.count !== v.count, `${v.count} then ${stepped.count}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  v = await viewer()
  check(`${name}, type rows: Escape closes it, still on the rows`, !v.open && page.url() === here, page.url())
  await page.locator('.ty-piece a').first().click()
  await page.waitForTimeout(600)
  await page.click('.ty-view__x')
  await page.waitForTimeout(500)
  check(`${name}, type rows: so does the cross`, !(await viewer()).open && page.url() === here, page.url())
  await page.locator('.ty-piece a').first().click()
  await page.waitForTimeout(600)
  await page.goBack()
  await page.waitForTimeout(800)
  check(`${name}, type rows: so does the browser's back, staying on the page`, !(await viewer()).open && page.url() === here, page.url())
  await page.locator('.ty-piece a').first().click()
  await page.waitForTimeout(600)
  await page.click('.ty-view__closer')
  await page.waitForTimeout(1200)
  const tyLanded = await page.evaluate(() => {
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    return el ? Math.round(el.getBoundingClientRect().top) : null
  })
  check(`${name}, type rows: Look closer goes on to Up close`, /\/portfolio\/up-close\/?#/.test(page.url()) && tyLanded !== null && tyLanded < 200, `${page.url()} at ${tyLanded}px`)
  await page.goBack()
  await page.waitForTimeout(1200)
  check(`${name}, type rows: and back again returns to the rows`, page.url().includes('view=type'), page.url())
  check(`${name}, the views: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

/*
  The front page, next (preview, /next/front/home): the field of work first, every tile a door
  into the portfolio; the results as numbered rows; one cut-out at the end.
*/
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (!(await page.goto(`${BASE}/next/front/home`, {waitUntil: 'domcontentloaded', timeout: 60_000}))?.ok()) {
    console.log(`skip  ${name}, homepage: not on this site (preview only)`)
    await page.close()
    continue
  }
  await page.waitForTimeout(1200)
  const hx = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.hx-world .wd-piece')).filter((t) => !t.hidden)
    const boxes = tiles.map((t) => t.getBoundingClientRect())
    let overlap = 0
    for (let a = 0; a < boxes.length; a++)
      for (let z = a + 1; z < boxes.length; z++) {
        const A = boxes[a], Z = boxes[z]
        if (A.left < Z.right - 1 && Z.left < A.right - 1 && A.top < Z.bottom - 1 && Z.top < A.bottom - 1) overlap++
      }
    const field = document.querySelector('.hx-world').getBoundingClientRect()
    return {
      tiles: tiles.length,
      all: document.querySelectorAll('.hx-world .wd-piece').length,
      overlap,
      doors: tiles.filter((t) => /\/portfolio\?view=all&open=/.test(t.querySelector('a.wd-pic')?.getAttribute('href') ?? '')).length,
      fieldTop: Math.round(field.top),
      rows: document.querySelectorAll('.hx-row').length,
      numbered: Array.from(document.querySelectorAll('.hx-row__number')).filter((n) => /\d/.test(n.textContent)).length,
      finale: Array.from(document.querySelectorAll('.hx-finale__piece')).filter((f) => !f.hidden).length,
      wide: document.documentElement.scrollWidth > innerWidth,
    }
  })
  check(`${name}, homepage: the field of work, every piece shown, none overlapping`, hx.tiles > 10 && hx.tiles === hx.all && hx.overlap === 0, `${hx.tiles}/${hx.all}, ${hx.overlap} overlap(s)`)
  check(`${name}, homepage: the work starts in the first screen`, hx.fieldTop < h * 0.5, `${hx.fieldTop}px down`)
  check(`${name}, homepage: every piece a door into the portfolio, opened at it`, hx.doors === hx.tiles, `${hx.doors} of ${hx.tiles}`)
  check(`${name}, homepage: the results as numbered rows`, hx.rows > 0 && hx.numbered === hx.rows, `${hx.numbered} of ${hx.rows}`)
  check(`${name}, homepage: one cut-out at the end`, hx.finale === 1, `${hx.finale}`)
  check(`${name}, homepage: nothing wider than the screen`, !hx.wide, '')
  await page.locator('.hx-world a.wd-pic').first().click()
  // The address gains its trailing slash on the way (a redirect), so wait
  // for the page that stays, then for it to open.
  await page.waitForURL(/\/portfolio\/?\?/, {timeout: 15_000})
  await page.waitForLoadState('load')
  await page.waitForFunction(() => document.querySelector('.wd-piece.is-open'), null, {timeout: 10_000}).catch(() => {})
  const opened = await page.evaluate(() => ({
    url: location.href,
    open: !!document.querySelector('.wd-piece.is-open'),
    focus: document.querySelector('.wd-world')?.classList.contains('has-focus'),
    pieces: document.querySelectorAll('.wd-piece').length,
  }))
  check(`${name}, homepage: a piece opens the portfolio at it`, /\/portfolio\/?\?.*view=all.*open=|\/portfolio\/?\?.*open=.*view=all/.test(opened.url) && opened.open, JSON.stringify(opened))
  check(`${name}, homepage: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

/*
  Moments (preview, /next/moments/home): the homepage mock as bands of one
  CSS grid - no tile over another, words as tiles on the grid, nothing
  wider than the screen, and a click freezing its moment.
*/
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (!(await page.goto(`${BASE}/next/moments/home`, {waitUntil: 'domcontentloaded', timeout: 60_000}))?.ok()) {
    console.log(`skip  ${name}, moments: not on this site (preview only)`)
    await page.close()
    continue
  }
  await page.waitForTimeout(800)
  const mo = await page.evaluate(() => {
    const bands = Array.from(document.querySelectorAll('.mo-band'))
    let overlap = 0
    let tiles = 0
    for (const b of bands) {
      const rs = Array.from(b.querySelectorAll('.mo-tile')).map((t) => t.getBoundingClientRect())
      tiles += rs.length
      for (let a = 0; a < rs.length; a++)
        for (let z = a + 1; z < rs.length; z++) {
          const A = rs[a], Z = rs[z]
          if (Math.min(A.right, Z.right) - Math.max(A.left, Z.left) > 1 && Math.min(A.bottom, Z.bottom) - Math.max(A.top, Z.top) > 1) overlap++
        }
    }
    return {
      bands: bands.length,
      tiles,
      overlap,
      words: document.querySelectorAll('.mo-words').length,
      clustered: document.querySelectorAll('.mo-cluster .mo-pic--sketch').length,
      clusterWide: Math.max(0, ...Array.from(document.querySelectorAll('.mo-cluster')).map((c) => c.getBoundingClientRect().width / innerWidth)),
      sketches: document.querySelectorAll('.mo-pic--sketch').length,
      wide: document.documentElement.scrollWidth > innerWidth,
    }
  })
  check(`${name}, moments: bands of the grid, no tile over another`, mo.bands >= 1 && mo.tiles > 50 && mo.overlap === 0, `${mo.bands} moments, ${mo.tiles} tiles, ${mo.overlap} overlap(s)`)
  check(`${name}, moments: words as tiles, among the sketches`, mo.words >= 1 && mo.sketches > 50, `${mo.words} word tiles, ${mo.sketches} sketches`)
  // Chris: "you don't need to spread such small sketches across the width of the screen, I'd be okay with a cluster".
  check(`${name}, moments: the sketches gathered in clusters, not across the screen`, mo.clustered === mo.sketches && (name === 'phone' || mo.clusterWide < 0.66), `${mo.clustered} of ${mo.sketches} clustered, widest ${(mo.clusterWide * 100).toFixed(0)}% of the screen`)
  check(`${name}, moments: nothing wider than the screen`, !mo.wide, '')
  const sketch = page.locator('.mo-band[data-band="chateau"] .mo-pic--sketch').first()
  const small = await sketch.evaluate((el) => el.getBoundingClientRect().width)
  await sketch.click()
  await page.waitForTimeout(300)
  const frozen = await page.evaluate(() => {
    const b = document.querySelector('.mo-band[data-band="chateau"]')
    const open = b.querySelector('.mo-tile.is-open')
    return {focus: b.classList.contains('has-focus'), lit: b.querySelectorAll('.is-lit').length, card: !!b.querySelector('.mo-words.is-lit'), w: open ? open.getBoundingClientRect().width : 0}
  })
  check(`${name}, moments: a sketch opens a size up, its set and its card lit`, frozen.focus && frozen.lit > 10 && frozen.card && frozen.w > small * 1.5, `${JSON.stringify(frozen)} (was ${Math.round(small)}px)`)
  // Chris: "those blocks should be clickable, expandable parts just as much as anything else".
  const card = page.locator('.mo-band[data-band="chateau"] .mo-words').first()
  const shut = await card.evaluate((el) => el.getBoundingClientRect().height)
  await card.click({position: {x: 10, y: 10}})
  await page.waitForTimeout(300)
  const opened = await card.evaluate((el) => ({open: el.classList.contains('is-open'), h: el.getBoundingClientRect().height, more: getComputedStyle(el.querySelector('.mo-more')).display !== 'none'}))
  check(`${name}, moments: a block of words opens too, larger, with more in it`, opened.open && opened.more && opened.h > shut, `${JSON.stringify(opened)} (was ${Math.round(shut)}px)`)
  const overlapOpen = await page.evaluate(() => {
    const rs = Array.from(document.querySelectorAll('.mo-band[data-band="chateau"] .mo-tile')).map((t) => t.getBoundingClientRect())
    let n = 0
    for (let a = 0; a < rs.length; a++)
      for (let z = a + 1; z < rs.length; z++) {
        const A = rs[a], Z = rs[z]
        if (Math.min(A.right, Z.right) - Math.max(A.left, Z.left) > 1 && Math.min(A.bottom, Z.bottom) - Math.max(A.top, Z.top) > 1) n++
      }
    return n
  })
  check(`${name}, moments: open, still no tile over another`, overlapOpen === 0, `${overlapOpen}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check(`${name}, moments: Escape lets it go`, !(await page.evaluate(() => !!document.querySelector('.mo-band.has-focus'))), '')
  check(`${name}, moments: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

/*
  RESULTS AS TILES and PEOPLE, preview only for now (skipped where absent).
  Chris: "those information blocks ... can be clicked on to shift the grid
  around too", and "names involved".
*/
{
  const page = await browser.newPage({viewport: {width: 1440, height: 900}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/portfolio?view=all&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  const n = await page.locator('.wd-piece--result:not([hidden])').count()
  if (n) {
    const opens = await page.locator('.wd-piece--result:not([hidden])').first().getAttribute('data-opens')
    await page.locator('.wd-piece--result:not([hidden]) .wd-pic').first().click()
    await page.waitForTimeout(900)
    const open = await page.evaluate(() => {
      const o = document.querySelector('.wd-piece.is-open')
      const r = document.querySelector('.wd-piece--result')
      return {i: o?.dataset.i, lit: r ? r.classList.contains('is-sibling') : null}
    })
    check(`results: ${n} result tiles; one opens its project's own piece`, open.i === opens, `${JSON.stringify(open)} (wanted ${opens})`)
    check('results: no script errors', errors.length === 0, errors.join(' | '))
  } else console.log('(no result tiles here - skipped)')
  const res = await page.goto(`${BASE}/people/`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  if (res?.status() === 200) {
    const pp = await page.evaluate(() => ({
      rows: document.querySelectorAll('.pp-row').length,
      named: Array.from(document.querySelectorAll('.pp-row__name')).filter((x) => x.textContent.trim()).length,
      work: Array.from(document.querySelectorAll('.pp-row')).every((r) => r.querySelectorAll('.pp-work').length > 0),
      links: Array.from(document.querySelectorAll('.pp-work')).every((a) => /\/portfolio\?view=all&open=/.test(a.getAttribute('href'))),
    }))
    check('people: a named row per person, each with the work they are on, opening it in the All view', pp.rows > 0 && pp.named === pp.rows && pp.work && pp.links, JSON.stringify(pp))
  } else console.log('(no people page here - skipped)')
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
