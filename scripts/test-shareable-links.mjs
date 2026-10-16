/*
  Shareable links on the Portfolio: the address bar says what is on screen,
  and arriving at that address puts the page back in that state.

  Chris: "I like 1 as long as it stays speedy." So alongside behaviour this
  measures cost - what each address update takes, that browsing adds no
  history entries for Back to walk through, and how long an arriving link
  takes to show its piece opened.

  Usage: node scripts/test-shareable-links.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const MERCH = '.merch-apparel'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()

async function open(path, {width = 1440, height = 900} = {}) {
  const page = await browser.newPage({viewport: {width, height}})
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
    // Time every address update the page makes, so the cost is measured
    // rather than asserted.
    window.__linkWrites = []
    const replace = history.replaceState.bind(history)
    history.replaceState = (...args) => {
      const t = performance.now()
      replace(...args)
      window.__linkWrites.push(performance.now() - t)
    }
  })
  const t0 = Date.now()
  await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  return {page, t0}
}

const query = (page) => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)))
const opened = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('#pf-grid .pf-item.is-expanded')
    return el ? {slug: el.dataset.slug ?? null, piece: el.dataset.piece} : null
  })

// ---------------------------------------------------------------- browsing writes the address
let shared = null
let sharedNested = null
{
  const {page} = await open('/portfolio')
  await page.waitForTimeout(2500)
  const historyBefore = await page.evaluate(() => history.length)

  await page.click(`.pf-btn[data-filter="${MERCH}"]`)
  await page.waitForTimeout(600)
  check('pressing Merch puts it in the address', (await query(page)).view === 'merch', JSON.stringify(await query(page)))

  // A shirt with a project to gather, so the arrival test below has something to check.
  const i = await page.evaluate((MERCH) => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
    return all.findIndex(
      (el) =>
        el.matches(MERCH) &&
        el.dataset.merch === 'lead' &&
        el.dataset.slug &&
        getComputedStyle(el).display !== 'none' &&
        href(el) &&
        all.filter((o) => href(o) === href(el)).length >= 3,
    )
  }, MERCH)
  const tile = page.locator('#pf-grid .pf-item').nth(i)
  await tile.scrollIntoViewIfNeeded()
  await tile.locator('.pf-item__img').click()
  await page.waitForTimeout(1500)
  const q = await query(page)
  const o = await opened(page)
  check('opening a shirt names it in the address', !!o && q.open === o.slug && q.view === 'merch', JSON.stringify(q))
  shared = q.open

  // A closeup parented to a shirt, for the nested arrival.
  sharedNested = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
        // A merch closeup hanging off a merch shirt: the kind the Merch view
    // keeps under its shirt until the shirt is opened.
    const merch = (el) => el.classList.contains('merch-apparel')
    const shirts = new Set(all.filter(merch).map((el) => el.dataset.piece))
    const child = all.find((el) => merch(el) && el.dataset.slug && shirts.has(el.dataset.pieceParent))
    return child ? {slug: child.dataset.slug, parent: child.dataset.pieceParent} : null
  })

  await page.locator('#pf-grid .pf-item.is-expanded .pf-item__img').click()
  await page.waitForTimeout(1200)
  const q2 = await query(page)
  check('closing it takes it back out', !q2.open && q2.view === 'merch', JSON.stringify(q2))

  // A run of ordinary browsing.
  for (let k = 0; k < 6; k++) {
    await page.locator('#pf-grid .pf-item:visible .pf-item__img:visible').nth(k * 2).click()
    await page.waitForTimeout(500)
  }
  await page.click('.pf-btn[data-filter="*"]')
  await page.waitForTimeout(600)
  const q3 = await query(page)
  check('All clears the view from the address', !q3.view, JSON.stringify(q3))

  const historyAfter = await page.evaluate(() => history.length)
  check('browsing adds nothing for Back to walk through', historyAfter === historyBefore, `history ${historyBefore} -> ${historyAfter}`)

  const writes = await page.evaluate(() => window.__linkWrites)
  const worst = Math.max(...writes)
  check(
    'each address update is effectively free',
    writes.length > 0 && worst < 2,
    `${writes.length} updates, worst ${worst.toFixed(3)}ms, mean ${(writes.reduce((a, b) => a + b, 0) / writes.length).toFixed(3)}ms`,
  )
  await page.close()
}

// ---------------------------------------------------------------- arriving on a link
for (const [label, size] of [
  ['desktop', {width: 1440, height: 900}],
  ['phone', {width: 390, height: 664}],
]) {
  if (!shared) break
  const {page, t0} = await open(`/portfolio?view=merch&open=${encodeURIComponent(shared)}`, size)
  await page.waitForSelector('#pf-grid .pf-item.is-expanded', {timeout: 8000}).catch(() => {})
  const ms = Date.now() - t0
  await page.waitForTimeout(1500)
  console.log('')
  const s = await page.evaluate((MERCH) => {
    const grid = document.querySelector('#pf-grid')
    const el = grid.querySelector('.pf-item.is-expanded')
    const href = (x) => x.querySelector('.pf-item__jump')?.getAttribute('href')
    const set = el
      ? Array.from(grid.querySelectorAll('.pf-item')).filter(
          (x) => href(x) === href(el) && getComputedStyle(x).display !== 'none',
        )
      : []
    let top = Infinity
    let bottom = -Infinity
    for (const x of set) {
      const b = x.getBoundingClientRect()
      top = Math.min(top, b.top)
      bottom = Math.max(bottom, b.bottom)
    }
    const o = el?.getBoundingClientRect()
    return {
      openedTop: o ? Math.round(o.top) : null,
      openedBottom: o ? Math.round(o.bottom) : null,
      merch: grid.classList.contains('is-merch-view'),
      active: document.querySelector(`.pf-btn[data-filter="${MERCH}"]`)?.classList.contains('is-active'),
      slug: el?.dataset.slug ?? null,
      set: set.length,
      top: Math.round(top),
      bottom: Math.round(bottom),
      vh: innerHeight,
    }
  }, MERCH)
  check(`${label}: a link to a shirt arrives in the Merch view`, s.merch && s.active)
  check(`${label}: with that shirt open`, s.slug === shared, `${s.slug}, opened ${ms}ms after the request`)
  check(`${label}: its project gathered round it`, s.set >= 3, `${s.set} pieces`)
  if (label === 'desktop') {
    check(`${label}: and the whole set in the window`, s.top >= 0 && s.bottom <= s.vh, `${s.top}..${s.bottom} of ${s.vh}`)
  } else {
    // Four columns make DumpStat's 22 pieces taller than a phone; there the
    // set starts at the top of the screen with the shirt itself whole.
    check(
      `${label}: the set starts at the top with the shirt whole`,
      s.top >= 0 && s.top < 80 && s.openedBottom <= s.vh,
      `set ${s.top}..${s.bottom}, shirt ${s.openedTop}..${s.openedBottom} of ${s.vh}`,
    )
  }
  check(`${label}: the address is left as it was sent`, (await query(page)).open === shared)
  await page.close()
}

if (sharedNested) {
  const {page} = await open(`/portfolio?view=merch&open=${encodeURIComponent(sharedNested.slug)}`)
  await page.waitForTimeout(3200)
  const o = await opened(page)
  console.log('')
  check('a link to a closeup in the Merch view opens the shirt it hangs off', o?.piece === sharedNested.parent, JSON.stringify(o))
  await page.close()
} else {
  console.log('\n(no closeup parented to a shirt - nested arrival not tested)')
}

{
  const {page} = await open('/portfolio?view=nonsense&open=no-such-piece')
  await page.waitForTimeout(3000)
  const s = await page.evaluate(() => ({
    shown: Array.from(document.querySelectorAll('#pf-grid .pf-item')).filter((el) => getComputedStyle(el).display !== 'none').length,
    total: document.querySelectorAll('#pf-grid .pf-item').length,
    open: !!document.querySelector('#pf-grid .pf-item.is-expanded'),
  }))
  console.log('')
  check('a link to nothing lands on the whole portfolio, untouched', s.shown === s.total && !s.open, `${s.shown} of ${s.total}, open: ${s.open}`)
  await page.close()
}

{
  const {page} = await open('/portfolio?view=brand')
  await page.waitForTimeout(1500)
  const s = await page.evaluate(() => document.querySelector('.pf-btn[data-filter=".brand-identity"]')?.classList.contains('is-active'))
  check('a plain filter travels in a link too', !!s)
  await page.close()
}

await browser.close()
console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('Shareable links behave as asked.')
