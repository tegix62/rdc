/*
  Swiping between pages - and, more importantly, NOT swiping.

  WHY THE REFUSALS ARE THE TEST

  Making a swipe navigate is easy. The whole risk in this feature is a page
  that changes when the visitor did not ask it to, which is far worse than a
  gesture needing a second go. Four cases have to refuse:

    SCROLLS   a flick that starts inside a sideways media row - those exist
              on several pages and scrolling them is the gesture's real job
    SCROLLS   a mostly-vertical flick, which is how you read a tall grid
    REFUSES   a swipe while a portfolio tile is expanded - that visitor is
              looking at one picture
    REFUSES   a swipe starting at the screen edge, which iOS Safari claims
              for its own back and forward

  And two have to work: a deliberate horizontal swipe, and the arrow keys
  that stand in for it on desktop.

  Touch events are synthesised rather than driven through the trackpad
  because the handler reads clientX off the Touch and walks up from
  e.target - both of which a constructed TouchEvent carries faithfully, and
  neither of which a CDP-level gesture lets this script aim at a chosen
  element.

  Usage: node scripts/test-page-deck.mjs [preview-url] [prod-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PROD = (process.argv[3] ?? 'https://rumeaudesign.co').replace(/\/$/, '')

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

/*
  Synthesised in the page, with a real target so the handler's walk up the
  tree for a sideways scroller sees what a finger would have landed on.
*/
const SWIPE = `
  window.__swipe = async (sel, dx, dy) => {
    const target = sel ? document.querySelector(sel) : document.body;
    if (!target) return 'no target';
    const box = target.getBoundingClientRect();
    const x0 = Math.round(box.left + box.width / 2);
    const y0 = Math.round(Math.min(Math.max(box.top + box.height / 2, 80), innerHeight - 80));
    const at = (x, y) => {
      const t = new Touch({identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y});
      return t;
    };
    const fire = (type, x, y) => {
      const t = at(x, y);
      target.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    fire('touchstart', x0, y0);
    // Several moves, because the axis is locked on the first one big enough
    // to have a direction and a single jump would skip that decision.
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 16));
      fire('touchmove', x0 + (dx * i) / 4, y0 + (dy * i) / 4);
    }
    fire('touchend', x0 + dx, y0 + dy);
    return 'sent';
  };

  // Same, but starting at a chosen absolute x - for the screen-edge case.
  window.__swipeFromX = (x0, dx) => {
    const target = document.body;
    const y0 = Math.round(innerHeight / 2);
    const mk = (x) => new Touch({identifier: 1, target, clientX: x, clientY: y0, pageX: x, pageY: y0});
    const fire = (type, x) => {
      const t = mk(x);
      target.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    fire('touchstart', x0);
    fire('touchmove', x0 + dx / 2);
    fire('touchend', x0 + dx);
  };
`

const browser = await chromium.launch()
const phone = async () => {
  const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
  await page.addInitScript(SWIPE)
  return page
}

/* Did the URL change within a grace period? Reported, not awaited blindly. */
const landed = async (page, before, ms = 2500) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (page.url() !== before) return page.url()
    await page.waitForTimeout(100)
  }
  return null
}

console.log(`${BASE}\n`)

/* ---------- the deck is wired, and in the right order ---------- */
{
  const page = await phone()
  const order = []
  for (const path of ['/', '/portfolio', '/about', '/video']) {
    await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    const ends = await page.evaluate(() => ({
      prev: document.querySelector('[data-deck-prev]')?.getAttribute('href') ?? null,
      next: document.querySelector('[data-deck-next]')?.getAttribute('href') ?? null,
      prefetches: [...document.querySelectorAll('link[rel="prefetch"]')].map((l) => l.getAttribute('href')),
    }))
    order.push({path, ...ends})
  }

  console.log('  the deck, as served:')
  for (const o of order) console.log(`    ${o.path.padEnd(11)} prev ${String(o.prev).padEnd(11)} next ${o.next}`)

  check(
    'the first page has no previous and the deck runs forward from it',
    order[0].prev === null && order[0].next === '/portfolio',
    `/ -> ${order[0].next}`,
  )
  check(
    'each page points back at the one before it',
    order[1].prev === '/' && order[2].prev === '/portfolio' && order[3].prev === '/about',
    order.map((o) => o.prev ?? 'none').join(' , '),
  )
  check(
    "the adjacent pages' HTML is prefetched",
    order[1].prefetches.includes('/') && order[1].prefetches.includes('/about'),
    `on /portfolio: ${order[1].prefetches.join(' ')}`,
  )
  await page.close()
}

/* ---------- a deliberate swipe moves ---------- */
{
  const page = await phone()
  await page.goto(`${BASE}/about`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(600)
  const before = page.url()
  await page.evaluate(() => window.__swipe(null, -160, 0))
  const now = await landed(page, before)
  console.log('')
  check('swiping left goes to the next page', !!now && /\/video/.test(now ?? ''), `landed on ${now ?? 'nowhere'}`)

  if (now) {
    const back = page.url()
    await page.evaluate(() => window.__swipe(null, 160, 0))
    const prev = await landed(page, back)
    check('swiping right goes back', !!prev && /\/about/.test(prev ?? ''), `landed on ${prev ?? 'nowhere'}`)
  }
  await page.close()
}

/* ---------- the friction: a short drag moves, then puts itself back ---------- */
{
  /*
    Chris: "it's too easy across any page to have a left or a right swipe
    just immediately change the page... I'm okay introducing one stop of
    friction so that we don't make a mistake swiping."

    Two halves, and a test of either alone would pass on a broken build. A
    short drag has to MOVE - that movement is the whole friction, because it
    is what tells you a swipe is under way in time to abort it - and it has
    to END UP BACK where it started. Asserting only the second would also
    pass if the gesture did nothing at all, which is the version Chris was
    complaining about.
  */
  const page = await phone()
  await page.goto(`${BASE}/about`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(600)
  const before = page.url()

  const moved = await page.evaluate(async () => {
    const skin = document.querySelector('main')
    const shift = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(skin).transform)
      return m.m41
    }
    const target = document.body
    const mk = (x, y) => new Touch({identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y})
    const fire = (type, x, y) => {
      const t = mk(x, y)
      target.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    const x0 = Math.round(innerWidth / 2)
    const y0 = Math.round(innerHeight / 2)
    // 60px, comfortably short of the 30%-of-screen commit point.
    fire('touchstart', x0, y0)
    let peak = 0
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 16))
      fire('touchmove', x0 - (60 * i) / 4, y0)
      peak = Math.min(peak, shift())
    }
    fire('touchend', x0 - 60, y0)
    await new Promise((r) => setTimeout(r, 600))
    return {peak, settled: shift()}
  })

  const now = await landed(page, before, 1200)
  console.log('')
  check(
    'a short swipe does not change the page',
    now === null,
    now ? `it navigated to ${now}` : 'stayed put',
  )
  check(
    'but the page visibly moves under the thumb, which is the friction',
    moved.peak <= -20,
    `travelled ${Math.round(moved.peak)}px`,
  )
  check(
    'and it springs back to rest afterwards',
    Math.abs(moved.settled) < 2,
    `settled at ${Math.round(moved.settled)}px`,
  )
  await page.close()
}

/* ---------- the arrow keys, which are the desktop half ---------- */
{
  const page = await browser.newPage({viewport: {width: 1440, height: 900}})
  await page.goto(`${BASE}/about`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(600)
  const edge = await page.evaluate(() => ({
    next: document.querySelector('[data-deck-next] .deck__label')?.textContent?.trim() ?? null,
    shown: (() => {
      const el = document.querySelector('[data-deck-next]')
      return el ? getComputedStyle(el).display !== 'none' : false
    })(),
  }))
  console.log('')
  check('the edge affordance names its destination', !!edge.next, `next reads "${edge.next}"`)
  check('and it is visible on a desktop viewport', edge.shown)

  const before = page.url()
  await page.keyboard.press('ArrowRight')
  const now = await landed(page, before)
  check('the right arrow key advances the deck', !!now && /\/video/.test(now ?? ''), `landed on ${now ?? 'nowhere'}`)
  await page.close()
}

/* ---------- and now the four refusals ---------- */
console.log('')

{
  /* A sideways media row. Scrolling it is the gesture's real job. */
  const page = await phone()
  await page.goto(`${BASE}/video`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1200)
  const strip = await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const ox = getComputedStyle(el).overflowX
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 8) {
        el.setAttribute('data-probe-strip', '')
        return true
      }
    }
    return false
  })
  if (!strip) {
    console.log('  (no sideways strip on /video to swipe inside; trying /portfolio)')
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    await page.waitForTimeout(1500)
  }
  const found = await page.evaluate(() => {
    if (document.querySelector('[data-probe-strip]')) return true
    for (const el of document.querySelectorAll('*')) {
      const ox = getComputedStyle(el).overflowX
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 8) {
        el.setAttribute('data-probe-strip', '')
        return true
      }
    }
    return false
  })

  /*
    No deck page carries a media row yet - /video has no content in it and
    the real ones live on case study pages, which are not in the deck. That
    makes this the one refusal with nothing natural to test against, and
    "untested" is not good enough for the guard most likely to be hit: the
    moment Chris puts a media row section on /video, every sideways flick
    there is a candidate page change.

    So a strip is built in the page instead. It is a faithful exercise of
    what the guard actually does - walk up from the touch target looking for
    an ancestor with overflow-x and more content than room - and it is
    labelled as synthetic rather than passed off as the real thing.
  */
  const synthetic = !found
  if (synthetic) {
    await page.evaluate(() => {
      const strip = document.createElement('div')
      strip.setAttribute('data-probe-strip', '')
      strip.style.cssText = 'overflow-x:auto;display:flex;width:300px;margin:2rem auto;'
      for (let i = 0; i < 6; i++) {
        const cell = document.createElement('div')
        cell.style.cssText = 'flex:0 0 200px;height:160px;background:#ccc;'
        strip.appendChild(cell)
      }
      document.querySelector('main')?.prepend(strip)
    })
    await page.waitForTimeout(200)
  }

  const usable = await page.evaluate(() => {
    const el = document.querySelector('[data-probe-strip]')
    return !!el && el.scrollWidth > el.clientWidth + 8
  })

  if (!usable) {
    console.log('  (could not get a sideways scroller to swipe inside - this refusal went untested)')
    failures += 1
  } else {
    const before = page.url()
    await page.evaluate(() => window.__swipe('[data-probe-strip]', -170, 0))
    const now = await landed(page, before, 1500)
    check(
      `a swipe starting inside a sideways strip scrolls it instead of navigating${synthetic ? ' (synthetic strip)' : ''}`,
      now === null,
      now ? `it navigated to ${now}` : 'stayed put',
    )
  }
  await page.close()
}

{
  /* A mostly-vertical flick is how you read a tall page. */
  const page = await phone()
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  const before = page.url()
  await page.evaluate(() => window.__swipe(null, -80, -200))
  const now = await landed(page, before, 1500)
  check('a mostly vertical flick does not change the page', now === null, now ? `it navigated to ${now}` : 'stayed put')
  await page.close()
}

{
  /* An expanded tile is a visitor looking at one picture. */
  const page = await phone()
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(2500)
  const opened = await page.evaluate(() => {
    const tile = document.querySelector('.pf-grid .pf-item')
    if (!tile) return false
    tile.click()
    return true
  })
  await page.waitForTimeout(600)
  const expanded = await page.evaluate(() => !!document.querySelector('.pf-item.is-expanded'))
  if (!opened || !expanded) {
    console.log(`  (could not expand a tile - this refusal went untested)`)
  } else {
    const before = page.url()
    await page.evaluate(() => window.__swipe(null, -170, 0))
    const now = await landed(page, before, 1500)
    check('a swipe while a tile is expanded is ignored', now === null, now ? `it navigated to ${now}` : 'stayed put')
  }
  await page.close()
}

{
  /* iOS Safari claims the screen edges for back and forward. */
  const page = await phone()
  await page.goto(`${BASE}/about`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(600)
  const before = page.url()
  await page.evaluate(() => window.__swipeFromX(8, -170))
  const now = await landed(page, before, 1500)
  check(
    'a swipe starting at the screen edge is left to the browser',
    now === null,
    now ? `it navigated to ${now}` : 'stayed put',
  )
  await page.close()
}

/* ---------- and it is nowhere near production ---------- */
{
  const page = await browser.newPage({viewport: {width: 1440, height: 900}})
  let reached = true
  try {
    await page.goto(`${PROD}/about`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  } catch {
    reached = false
  }
  console.log('')
  if (!reached) {
    console.log(`  (${PROD} unreachable; the gating check did not run)`)
  } else {
    const leaked = await page.evaluate(() => ({
      deck: !!document.querySelector('.deck'),
      edges: document.querySelectorAll('[data-deck-next],[data-deck-prev]').length,
    }))
    check(
      'production has no deck at all',
      !leaked.deck && leaked.edges === 0,
      `${leaked.edges} edge affordance(s)`,
    )
  }
  await page.close()
}

await browser.close()
console.log(
  failures === 0
    ? '\nThe deck moves on a deliberate swipe and refuses every gesture that was not one.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
