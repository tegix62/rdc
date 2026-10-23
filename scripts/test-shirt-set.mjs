/*
  A shirt and its own shots, with no project above them, open together.

  Chris parented the BalloonShop Blood Comes Home alternate lockup to the
  19th Anniversary Tee so that opening the tee brings it beside it, and
  BalloonShop has no project page ("not fully ready for its own
  buildout"). See A SHIRT AND ITS OWN SHOTS in portfolio.astro.

  On the All grid at a desktop and a phone, and in the Merch view: every
  shirt set on the page (data-family="#shirt-...") is opened from its
  shirt, and the test checks that the shots are lit with it, that they sit
  next to it, and that nothing overlaps. Then that a real project still
  gathers as it did, so the fallback took nothing from the projects.

  Usage: node scripts/test-shirt-set.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()
async function open(w, h, filter) {
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
  await page.waitForTimeout(2500)
  if (filter) {
    await page.click(`.pf-btn[data-filter="${filter}"]`)
    await page.waitForTimeout(1500)
  }
  return {page, errors}
}

const sets = (page) =>
  page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const by = new Map()
    all.forEach((el, i) => {
      const k = el.dataset.family
      if (k) by.set(k, [...(by.get(k) ?? []), {i, root: !el.dataset.pieceParent, title: el.querySelector('img')?.alt ?? ''}])
    })
    return [...by.entries()].map(([key, members]) => ({key, members}))
  })

const state = (page, key) =>
  page.evaluate((key) => {
    const grid = document.querySelector('#pf-grid')
    const shown = Array.from(grid.querySelectorAll('.pf-item')).filter((el) => getComputedStyle(el).display !== 'none')
    const members = shown.filter((el) => el.dataset.family === key)
    const opened = grid.querySelector('.pf-item.is-expanded')
    const o = opened?.getBoundingClientRect()
    const gap = (b) =>
      o ? Math.max(0, Math.max(b.left - o.right, o.left - b.right), Math.max(b.top - o.bottom, o.top - b.bottom)) : Infinity
    const boxes = shown.map((el) => el.getBoundingClientRect())
    let overlaps = 0
    for (let a = 0; a < boxes.length; a++)
      for (let z = a + 1; z < boxes.length; z++) {
        const w = Math.min(boxes[a].right, boxes[z].right) - Math.max(boxes[a].left, boxes[z].left)
        const h = Math.min(boxes[a].bottom, boxes[z].bottom) - Math.max(boxes[a].top, boxes[z].top)
        if (w > 2 && h > 2) overlaps++
      }
    return {
      openedIsMember: !!opened && opened.dataset.family === key,
      shown: members.length,
      lit: members.filter((el) => el.classList.contains('is-sibling')).length,
      dimmed: grid.classList.contains('has-focus'),
      farthest: Math.round(Math.max(...members.filter((el) => el !== opened).map((el) => gap(el.getBoundingClientRect())))),
      overlaps,
    }
  }, key)

async function tryView(name, w, h, filter) {
  const {page, errors} = await open(w, h, filter)
  const found = await sets(page)
  check(`${name}: the page names at least one shirt set`, found.length > 0, found.map((s) => `${s.members.length} in ${s.key.slice(0, 20)}`).join(', '))
  for (const s of found) {
    const root = s.members.find((m) => m.root) ?? s.members[0]
    const tile = page.locator('#pf-grid .pf-item').nth(root.i)
    if (!(await tile.isVisible())) {
      console.log(`      (${s.key.slice(0, 20)} not in this view)`)
      continue
    }
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1800)
    const st = await state(page, s.key)
    const tag = `${name}, ${root.title.slice(0, 40) || s.key}`
    check(`${tag}: opens`, st.openedIsMember)
    check(`${tag}: its shots are lit with it`, st.dimmed && st.lit === st.shown, `${st.lit} of ${st.shown}`)
    check(`${tag}: and sit next to it`, st.farthest <= 48, `${st.farthest}px away at most`)
    check(`${tag}: nothing overlaps`, st.overlaps === 0, `${st.overlaps}`)
    await page.locator('#pf-grid .pf-item.is-expanded .pf-item__img').click()
    await page.waitForTimeout(1200)
  }
  check(`${name}: no script errors`, errors.length === 0, errors.join(' | '))
  return page
}

await tryView('All, desktop', 1440, 900)
await tryView('All, phone', 390, 844)
await tryView('Merch view, desktop', 1440, 900, '.merch-apparel')

// A real project still gathers as before: the biggest one's piece.
{
  const {page} = await open(1440, 900)
  const pick = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
    const size = (h) => all.filter((x) => href(x) === h).length
    const best = all.filter((el) => href(el) && !el.classList.contains('pf-item--study')).sort((a, b) => size(href(b)) - size(href(a)))[0]
    return best ? {i: all.indexOf(best), n: size(href(best))} : null
  })
  const tile = page.locator('#pf-grid .pf-item').nth(pick.i)
  await tile.scrollIntoViewIfNeeded()
  await tile.locator('.pf-item__img').click()
  await page.waitForTimeout(1800)
  const lit = await page.evaluate(() => document.querySelectorAll('#pf-grid .pf-item.is-sibling').length)
  check('a project still gathers its whole set', lit === pick.n, `${lit} of ${pick.n}`)
}

// A small project - three tiles, the least that gathers (FAMILY_MIN) - gathers too.
{
  const {page} = await open(1440, 900)
  const pick = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
    const size = (h) => all.filter((x) => href(x) === h).length
    const t = all.find((el) => href(el) && size(href(el)) === 3 && !el.classList.contains('pf-item--study'))
    return t ? {i: all.indexOf(t), href: href(t)} : null
  })
  if (!pick) console.log('      (no three-tile project on the page)')
  else {
    const tile = page.locator('#pf-grid .pf-item').nth(pick.i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1800)
    const lit = await page.evaluate(() => document.querySelectorAll('#pf-grid .pf-item.is-sibling').length)
    check(`a three-tile project (${pick.href}) gathers`, lit === 3, `${lit} of 3`)
  }
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
