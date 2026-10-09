/*
  Why do Shuffle and Gather do nothing?

  Chris, twice, across several browsers. The first version of this script
  reported "Shuffle changed the DOM order: true" and I believed it - but
  that was the wrong question. Isotope positions every tile absolutely, so
  the DOM order and what the visitor SEES are two different facts. A reorder
  that never gets repositioned looks exactly like a button that does
  nothing, and it would have reported true every time.

  So this measures GEOMETRY. Where is each tile on screen before the click,
  and where is it after.

  It also stops trusting el.click(). A dispatched click skips the pointer
  pipeline entirely, so it cannot see an overlay sitting on top of the
  button - elementFromPoint at the button's centre is the test for that, and
  real mouse clicks are used throughout.

  And it checks production, because Shuffle is NOT preview-gated: if Shuffle
  is broken there too then the cause is something shipped, not something
  behind the flag.

  READ-ONLY.

  Usage: node scripts/diagnose-toolbar.mjs [preview-url] [prod-url]
*/
import {chromium} from 'playwright'

const PREVIEW = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PROD = (process.argv[3] ?? 'https://rumeaudesign.co').replace(/\/$/, '')

const browser = await chromium.launch()

/*
  WHAT A PERSON WOULD ACTUALLY JUDGE.

  "Tile positions moved" is true even when the change is invisible - a
  one-slot rotation shifts every box and leaves the top of the page looking
  identical. Chris is reporting what he SEES, so this reports the same
  thing: of the pieces visible on the first screenful, how many are
  different afterwards. Zero means nothing happened as far as a visitor is
  concerned, however much the geometry moved.
*/
const FIRST_SCREEN = `(() => {
  return [...document.querySelectorAll('.pf-grid .pf-item')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && r.width > 0;
    })
    .map((el) => el.querySelector('img')?.getAttribute('alt')?.slice(0, 20) ?? '?');
})()`

const changedOnScreen = (before, after) => {
  const b = new Set(before)
  const gone = before.filter((x) => !after.includes(x)).length
  const fresh = after.filter((x) => !b.has(x)).length
  return {before: before.length, after: after.length, gone, fresh}
}

/* Where every tile sits on screen, as a fingerprint. */
const GEOM = `(() => {
  const items = [...document.querySelectorAll('.pf-grid .pf-item')];
  return {
    order: items.map((el) => el.querySelector('img')?.getAttribute('alt')?.slice(0, 14) ?? '?').join('|'),
    boxes: items.map((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.left) + ',' + Math.round(r.top + window.scrollY);
    }).join('|'),
    gridHeight: Math.round(document.querySelector('.pf-grid')?.getBoundingClientRect().height ?? 0),
  };
})()`

async function survey(label, base) {
  const page = await browser.newPage({viewport: {width: 1600, height: 1000}})
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  console.log(`\n=== ${label}: ${base}/portfolio ===`)
  await page.goto(`${base}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('.pf-grid .pf-item', {state: 'attached', timeout: 30_000}).catch(() => {})
  await page.waitForTimeout(3500)

  const present = await page.evaluate(() => ({
    tiles: document.querySelectorAll('.pf-grid .pf-item').length,
    shuffle: !!document.querySelector('#pf-shuffle'),
    gather: !!document.querySelector('#pf-gather'),
  }))
  console.log(`  ${present.tiles} tiles | #pf-shuffle ${present.shuffle} | #pf-gather ${present.gather}`)
  if (errors.length) {
    console.log(`  page errors: ${errors.length}`)
    for (const e of errors) console.log(`    ${e}`)
  } else {
    console.log('  page errors: 0')
  }

  /*
    IS ANYTHING SITTING ON TOP OF THE BUTTON?

    A dispatched click lands on the element whatever is over it; a real one
    hits whatever is topmost at that point. If these disagree, that is the
    bug and nothing else matters.
  */
  for (const sel of ['#pf-shuffle', '#pf-gather']) {
    const hit = await page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
      return {
        self: !!top && (top === el || el.contains(top)),
        topmost: top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}${top.className ? '.' + String(top.className).split(' ').slice(0, 2).join('.') : ''}` : 'nothing',
        rect: `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`,
        visible: !!el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).pointerEvents !== 'none',
      }
    }, sel)
    if (hit) {
      console.log(`  ${sel}: ${hit.rect} | topmost at centre: ${hit.topmost} | is itself: ${hit.self} | clickable: ${hit.visible}`)
    }
  }

  if (!present.shuffle) {
    await page.close()
    return
  }

  /* ---------- SHUFFLE, measured by geometry and with a real click ---------- */
  const before = await page.evaluate(GEOM)
  const screenBefore = await page.evaluate(FIRST_SCREEN)
  await page.click('#pf-shuffle')
  await page.waitForTimeout(1800)
  const after = await page.evaluate(GEOM)
  const screenAfter = await page.evaluate(FIRST_SCREEN)

  console.log(`\n  Shuffle (real mouse click):`)
  console.log(`    DOM order changed:     ${before.order !== after.order}`)
  console.log(`    TILE POSITIONS moved:  ${before.boxes !== after.boxes}`)
  console.log(`    grid height ${before.gridHeight} -> ${after.gridHeight}`)
  const vis = changedOnScreen(screenBefore, screenAfter)
  console.log(
    `    VISIBLE on first screen: ${vis.before} tiles -> ${vis.after}, ${vis.fresh} of them new, ${vis.gone} gone`,
  )
  if (before.order !== after.order && before.boxes === after.boxes) {
    console.log(`    >>> the order changed and nothing moved: Isotope is not relaying out.`)
  }
  if (vis.fresh === 0) {
    console.log(`    >>> nothing a visitor can see changed, whatever the geometry says.`)
  }

  /* ---------- GATHER ---------- */
  if (present.gather) {
    await page.click('#pf-gather')
    await page.waitForTimeout(400)
    const state = await page.evaluate(() => ({
      text: document.querySelector('#pf-gather')?.textContent?.trim(),
      pressed: document.querySelector('#pf-gather')?.getAttribute('aria-pressed'),
    }))
    console.log(`\n  Gather toggle after a real click: "${state.text}" aria-pressed=${state.pressed}`)

    const g0 = await page.evaluate(GEOM)
    const clicked = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
      const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
      const sizes = {}
      for (const el of tiles) {
        const k = hrefOf(el)
        if (k) sizes[k] = (sizes[k] ?? 0) + 1
      }
      const t = tiles.filter((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)[2]
      if (!t) return null
      t.setAttribute('data-probe', '')
      return hrefOf(t)
    })
    if (clicked) {
      await page.click('[data-probe]')
      await page.waitForTimeout(1800)
      const g1 = await page.evaluate(GEOM)
      console.log(`  clicked a tile from ${clicked}`)
      console.log(`    DOM order changed:     ${g0.order !== g1.order}`)
      console.log(`    TILE POSITIONS moved:  ${g0.boxes !== g1.boxes}`)
    }
  }

  if (errors.length) {
    console.log(`\n  page errors at end: ${errors.length}`)
    for (const e of errors) console.log(`    ${e}`)
  }
  await page.close()
}

await survey('PREVIEW desktop', PREVIEW)
await survey('PRODUCTION desktop', PROD)

/*
  A REAL TAP ON A PHONE, which is how Chris said he was testing. Playwright's
  tap() drives the actual touch pipeline rather than dispatching an event, so
  it is subject to everything a thumb is subject to.
*/
{
  const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  console.log(`\n=== PREVIEW phone, real taps: ${PREVIEW}/portfolio ===`)
  await page.goto(`${PREVIEW}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(4000)

  const bar = await page.evaluate(() => {
    const b = document.querySelector('#pf-shuffle')
    if (!b) return null
    const r = b.getBoundingClientRect()
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return {
      rect: `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`,
      topmost: top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}` : 'nothing',
      cols: document.querySelector('.pf-sizer')?.offsetWidth ?? null,
    }
  })
  console.log(`  #pf-shuffle ${bar?.rect} | topmost ${bar?.topmost} | column width ${bar?.cols}`)

  const b0 = await page.evaluate(GEOM)
  const s0 = await page.evaluate(FIRST_SCREEN)
  await page.tap('#pf-shuffle')
  await page.waitForTimeout(1800)
  const b1 = await page.evaluate(GEOM)
  const s1 = await page.evaluate(FIRST_SCREEN)
  const v = changedOnScreen(s0, s1)
  console.log(`  Shuffle by real tap:`)
  console.log(`    DOM order changed:    ${b0.order !== b1.order}`)
  console.log(`    TILE POSITIONS moved: ${b0.boxes !== b1.boxes}`)
  console.log(`    VISIBLE on first screen: ${v.before} -> ${v.after}, ${v.fresh} new, ${v.gone} gone`)
  console.log(`  page errors: ${errs.length}${errs.length ? ' - ' + errs.join(' | ') : ''}`)
  await page.close()
}

await browser.close()
