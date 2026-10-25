/*
  The world page (/portfolio/all, preview) in a browser, with blank
  pictures. For the lands, the page's one mode now (also sorted by colour), at a desktop and a phone:
  every piece shown, none overlapping; a piece opened is larger than it
  was and opens as on the main grid - the navy hairline frame, its project
  bar, its set lit round it and the rest dropped back, nothing moving; the
  project's block of type floating in view; picking it
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
    await page.goto(`${BASE}/portfolio/all?mode=${mode}&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
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
    // By its own number: the pieces are re-ordered in the page as they are laid.
    const i = await page.evaluate((k) => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden)[k]?.dataset.i, k)
    const where = (i) => page.evaluate((i) => {
      const r = document.querySelector(`.wd-piece[data-i="${i}"]`).getBoundingClientRect()
      return {x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width)}
    }, i)
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).scrollIntoViewIfNeeded()
    const before = await where(i)
    await page.locator(`.wd-piece[data-i="${i}"] .wd-pic`).click({position: {x: 4, y: 4}})
    await page.waitForTimeout(700)
    const open = await state(page)
    const after = await where(i)
    // Lands opens in place (Chris: "throw transparency on everything else"): nothing moves.
    check(`${tag}: it opens in place - nothing moves`, after.x === before.x && after.y === before.y && after.w === before.w, `${JSON.stringify(before)} then ${JSON.stringify(after)}`)
    check(`${tag}: the rest dims, its set does not`, open.dim > 0 && open.dim < open.shown, `${open.dim} of ${open.shown} dimmed`)
    check(`${tag}: it opens as on the main grid - the navy frame and its project bar`, open.framed && open.bar === true)
    const floats = await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('.wd-card')).find((x) => !x.hidden)
      if (!c) return null
      const r = c.getBoundingClientRect()
      return {fixed: getComputedStyle(c).position === 'fixed', inView: r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1}
    })
    check(`${tag}: the project's block of type floats in view`, open.card && open.card.text.length > 0 && floats?.fixed && floats?.inView, open.card ? `"${open.card.text}" ${JSON.stringify(floats)}` : 'no card')
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
    check(`${tag}: so does the browser's back, staying on the page`, !back.framed && back.dim === 0 && page.url().includes('/portfolio/all'), page.url())
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
  await page.goto(`${BASE}/portfolio/all`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  const shown = () => page.evaluate(() => Array.from(document.querySelectorAll('.wd-piece')).filter((t) => !t.hidden).map((t) => ({i: Number(t.dataset.i), w: t.getBoundingClientRect().width})))
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
  check(`${name}: from there, All comes back to Lands`, there.url().includes('/portfolio/all'), there.url())
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
  check(`${name}, index: a row opens its piece in Up close`, /\/portfolio\/up-close\/?#/.test(page.url()) && landed !== null && landed < 200, `${page.url()} at ${landed}px`)
  for (const path of ['/portfolio/all', '/portfolio', '/portfolio/up-close', '/next/index/home']) {
    await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    const bar = await page.evaluate(() => Array.from(document.querySelectorAll('.pf-group--filters .pf-btn')).map((b) => [b.textContent.trim(), b.getAttribute('href')]))
    check(`${name}, ${path}: Type/Lettering in the toolbar, to the rows`, bar.some(([t, h]) => t === 'Type/Lettering' && h === '/portfolio/type') && !bar.some(([t]) => t === 'Up close'), bar.map(([t]) => t).join(' | '))
  }

  // Type/Lettering: a row per project, each named, its pieces at one
  // height, sideways inside the row and never the page; a piece opens in
  // Up close.
  await page.goto(`${BASE}/portfolio/type`, {waitUntil: 'domcontentloaded', timeout: 60_000})
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
  check(`${name}, type rows: and back again returns to the rows`, page.url().includes('/portfolio/type'), page.url())
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
  await page.goto(`${BASE}/next/front/home`, {waitUntil: 'domcontentloaded', timeout: 60_000})
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
      doors: tiles.filter((t) => /\/portfolio\/all\?open=/.test(t.querySelector('a.wd-pic')?.getAttribute('href') ?? '')).length,
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
  await page.waitForURL(/\/portfolio\/all\/\?/, {timeout: 15_000})
  await page.waitForLoadState('load')
  await page.waitForFunction(() => document.querySelector('.wd-piece.is-open'), null, {timeout: 10_000}).catch(() => {})
  const opened = await page.evaluate(() => ({
    url: location.href,
    open: !!document.querySelector('.wd-piece.is-open'),
    focus: document.querySelector('.wd-world')?.classList.contains('has-focus'),
    pieces: document.querySelectorAll('.wd-piece').length,
  }))
  check(`${name}, homepage: a piece opens the portfolio at it`, /\/portfolio\/all\/?\?.*open=/.test(opened.url) && opened.open, JSON.stringify(opened))
  check(`${name}, homepage: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
