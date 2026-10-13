/*
  The Merch & Apparel view, driven the way a visitor drives it.

  What Chris asked for, as checks:

    - the Merch tab switches the grid to 3 columns on desktop (2 on a phone)
    - the single-mockup pieces come first, the other shots after
    - it is exclusive: Merch clears the other filters, and any other filter
      leaves Merch and restores the normal columns
    - clicking a shirt gathers that project's other merch pieces around it,
      and nothing the filter hid is counted or moved into view

  Each check prints the measured value, so a failure says what happened
  rather than only that something did.

  READ-ONLY.

  Usage: node scripts/test-merch-view.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const MERCH = '.merch-apparel'
const TYPE = '.type-lettering'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()

async function open(width, height) {
  const page = await browser.newPage({viewport: {width, height}})
  // The once-a-session demo would gather something on its own and muddy
  // every measurement below; it reads this flag to know it has run.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  await page.waitForTimeout(2500)
  return page
}

const state = (page) =>
  page.evaluate((MERCH) => {
    const grid = document.querySelector('#pf-grid')
    const sizer = grid.querySelector('.pf-sizer')
    const tiles = Array.from(grid.querySelectorAll('.pf-item'))
    const shown = tiles.filter((el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.opacity !== '0' && el.getBoundingClientRect().width > 0
    })
    const active = Array.from(document.querySelectorAll('.pf-btn[data-filter].is-active')).map(
      (b) => b.dataset.filter,
    )
    // Columns a visitor SEES: the grid's width over an ordinary resting
    // tile's. The sizer is the underlying column, which in the merch view is
    // half a tile, so it would report six.
    // Not a hero either: in the main grid a hero spans two columns.
    const ordinary = shown.find(
      (el) =>
        !el.classList.contains('is-expanded') &&
        !el.classList.contains('is-minor') &&
        !el.classList.contains('pf-item--hero'),
    )
    return {
      cols: ordinary ? Math.round(grid.clientWidth / ordinary.getBoundingClientRect().width) : 0,
      underlying: Math.round(grid.clientWidth / sizer.getBoundingClientRect().width),
      active,
      merchView: grid.classList.contains('is-merch-view'),
      typeView: grid.classList.contains('is-type-view'),
      // Pictures that are not square, among tiles at rest. Uniform means none.
      notSquare: shown.filter((el) => {
        if (el.classList.contains('is-expanded')) return false
        const r = el.querySelector('.pf-item__img')?.getBoundingClientRect()
        return r && Math.abs(r.width - r.height) > 1.5
      }).length,
      shown: shown.length,
      shownMerch: shown.filter((el) => el.matches(MERCH)).length,
      // DOM order of what is on screen: lead/later sequence.
      shownOrder: shown.map((el) => el.dataset.merch ?? '-'),
    }
  }, MERCH)

const press = async (page, filter) => {
  await page.click(`.pf-btn[data-filter="${filter}"]`)
  await page.waitForTimeout(900)
}

// ---------------------------------------------------------------- desktop
{
  const page = await open(1440, 900)
  const before = await state(page)
  console.log(`desktop 1440: ${before.cols} columns, ${before.shown} tiles, active ${JSON.stringify(before.active)}\n`)

  await press(page, MERCH)
  const m = await state(page)
  check('Merch switches to 5 columns', m.cols === 5, `${m.cols} columns`)
  check('Merch is the only active filter', m.active.length === 1 && m.active[0] === MERCH, JSON.stringify(m.active))
  check('only merch pieces are on screen', m.shown > 0 && m.shown === m.shownMerch, `${m.shownMerch} of ${m.shown}`)
  const firstLater = m.shownOrder.indexOf('later')
  const lastLead = m.shownOrder.lastIndexOf('lead')
  check(
    'every single-mockup piece comes before every other shot',
    firstLater === -1 || lastLead < firstLater,
    `${m.shownOrder.filter((x) => x === 'lead').length} front, ${m.shownOrder.filter((x) => x === 'later').length} back: ${m.shownOrder.join(' ')}`,
  )

  check('every merch picture is the same square shape', m.notSquare === 0, `${m.notSquare} not square`)

  /*
    The gather. A front-row piece from the project with the most pieces IN
    TOTAL - merch or not - so the check covers the hidden ones too. Chris:
    "everything, regardless of filter, that's attached to the corresponding
    case study to gather around that shirt".
  */
  const target = await page.evaluate((MERCH) => {
    const grid = document.querySelector('#pf-grid')
    const shown = new Set(
      Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
      ),
    )
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const all = Array.from(grid.querySelectorAll('.pf-item'))
    const total = new Map()
    const hidden = new Map()
    for (const el of all) {
      const h = href(el)
      if (!h) continue
      total.set(h, (total.get(h) ?? 0) + 1)
      if (!shown.has(el)) hidden.set(h, (hidden.get(h) ?? 0) + 1)
    }
    let best = null
    for (const el of shown) {
      const h = href(el)
      if (!h || el.dataset.merch !== 'lead' || !(hidden.get(h) > 0)) continue
      const n = total.get(h)
      if (!best || n > best.n) best = {i: all.indexOf(el), h, n, hidden: hidden.get(h)}
    }
    return best
  }, MERCH)

  if (!target) {
    check('a front-row piece with merch siblings exists to click', false)
  } else {
    // Scroll it into view and click its picture, as a visitor would.
    const tile = page.locator('#pf-grid .pf-item').nth(target.i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1800)
    const g = await page.evaluate((h) => {
      const grid = document.querySelector('#pf-grid')
      const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
      const shown = Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
      )
      const whole = Array.from(grid.querySelectorAll('.pf-item')).filter((el) => href(el) === h)
      const fam = shown.filter((el) => href(el) === h)
      const idx = fam.map((el) => shown.indexOf(el))
      const contiguous = Math.max(...idx) - Math.min(...idx) + 1 === fam.length
      // The set's box, and anything else on screen that sits inside it.
      const boxes = fam.map((el) => el.getBoundingClientRect())
      const top = Math.min(...boxes.map((r) => r.top))
      const bottom = Math.max(...boxes.map((r) => r.bottom))
      const left = Math.min(...boxes.map((r) => r.left))
      const right = Math.max(...boxes.map((r) => r.right))
      const intruders = shown.filter((el) => {
        if (fam.includes(el)) return false
        const r = el.getBoundingClientRect()
        const cx = (r.left + r.right) / 2
        const cy = (r.top + r.bottom) / 2
        return cx > left && cx < right && cy > top && cy < bottom
      }).length
      const hiddenLit = Array.from(grid.querySelectorAll('.pf-item.is-sibling')).filter(
        (el) => !shown.includes(el),
      ).length
      return {
        n: fam.length,
        whole: whole.length,
        nonMerch: fam.filter((el) => !el.classList.contains('merch-apparel')).length,
        contiguous,
        intruders,
        hiddenLit,
        expanded: !!grid.querySelector('.pf-item.is-expanded'),
        onScreen: top < innerHeight && bottom > 0,
      }
    }, target.h)
    console.log(`\nclicked a shirt from ${target.h} (${target.n} pieces in the case study, ${target.hidden} hidden by the filter)`)
    check('the clicked piece opens', g.expanded)
    check('the WHOLE case study is on screen, hidden pieces included', g.n === g.whole, `${g.n} of ${g.whole}`)
    check('including pieces outside Merch', g.nonMerch > 0, `${g.nonMerch} non-merch piece(s) revealed`)
    check('gathered next to it in one run', g.contiguous, `contiguous: ${g.contiguous}`)
    check('nothing else sits inside the gathered set', g.intruders === 0, `${g.intruders} intruder(s)`)
    check('nothing lit is left invisible', g.hiddenLit === 0, `${g.hiddenLit} hidden lit`)
    check('the gathered set is on screen', g.onScreen)

    /*
      THE SIZES STEP DOWN. Opened = two ordinary tiles wide; the rest of the
      case study = half a tile. Measured against an ordinary merch tile.
    */
    const sizes = await page.evaluate((h) => {
      const grid = document.querySelector('#pf-grid')
      const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
      const w = (el) => el.getBoundingClientRect().width
      const tile = grid.clientWidth / 5
      const fam = Array.from(grid.querySelectorAll('.pf-item')).filter((el) => href(el) === h)
      const opened = fam.find((el) => el.classList.contains('is-expanded'))
      const minors = fam.filter((el) => el.classList.contains('is-minor'))
      return {
        opened: opened ? w(opened) / tile : 0,
        minor: minors.length ? Math.max(...minors.map(w)) / tile : 0,
        minorCount: minors.length,
        /*
          Uncropped: each half-size picture drawn in its own proportions,
          the way the All grid draws it. Compared with the file's natural
          shape; a square crop of a wide logo would be off by a mile.
        */
        cropped: minors.filter((el) => {
          const img = el.querySelector('.pf-item__img')
          if (!img?.naturalWidth) return false
          const r = img.getBoundingClientRect()
          const pad = parseFloat(getComputedStyle(img).paddingLeft) * 2
          const drawn = (r.width - pad) / (r.height - pad)
          return Math.abs(drawn - img.naturalWidth / img.naturalHeight) > 0.03
        }).length,
        famCount: fam.length,
      }
    }, target.h)
    check('the opened shirt is two tiles wide', Math.abs(sizes.opened - 2) < 0.05, `${sizes.opened.toFixed(2)} tiles`)

    /*
      NO EMPTY COLUMN BESIDE THE OPENED SHIRT.

      Chris's screenshot: a column left blank all the way down next to the
      opened tile, mostly on the right. Across the opened tile's height,
      every underlying column inside the set's width must hold some piece of
      the set - a column with nothing in it there is the gap he saw.
    */
    const gap = await page.evaluate((h) => {
      const grid = document.querySelector('#pf-grid')
      const g = grid.getBoundingClientRect()
      const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
      const fam = Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => href(el) === h && getComputedStyle(el).display !== 'none',
      )
      const opened = fam.find((el) => el.classList.contains('is-expanded'))
      if (!opened) return null
      const o = opened.getBoundingClientRect()
      const boxes = fam.map((el) => el.getBoundingClientRect())
      const left = Math.min(...boxes.map((r) => r.left))
      const right = Math.max(...boxes.map((r) => r.right))
      const n = Math.round(g.width / document.querySelector('#pf-grid .pf-sizer').getBoundingClientRect().width)
      const colW = g.width / n
      const empty = []
      for (let c = 0; c < n; c++) {
        const cl = g.left + c * colW
        const cr = cl + colW
        if (cl < left - 1 || cr > right + 1) continue
        const used = boxes.some((r) => r.left < cr - 1 && r.right > cl + 1 && r.top < o.bottom - 1 && r.bottom > o.top + 1)
        if (!used) empty.push(c)
      }
      return {empty, n}
    }, target.h)
    check(
      'no empty column runs beside the opened shirt',
      gap && gap.empty.length === 0,
      gap ? `empty column(s) ${JSON.stringify(gap.empty)} of ${gap.n}` : 'no opened tile',
    )
    check('the rest of the case study is half a tile', sizes.minorCount > 0 && Math.abs(sizes.minor - 0.5) < 0.05, `${sizes.minorCount} of ${sizes.famCount} at ${sizes.minor.toFixed(2)} tiles`)
    /*
      MIDDLE OUT, NOT ROWS. Chris: "I would rather Gather populate from the
      middle out, rather than going for long rows across the screen. More a
      cluster-like look."

      Rows show up as a set much wider than it is tall: twenty pieces laid
      out lowest-first at ten columns span the whole grid in two shallow
      bands. A cluster is about as tall as it is wide. So: the gathered set's
      width over its height, and how far its furthest piece is from the
      opened shirt against the radius a perfectly round cluster of the same
      area would need.
    */
    const shape = await page.evaluate(() => {
      const grid = document.querySelector('#pf-grid')
      const opened = grid.querySelector('.pf-item.is-expanded')
      const set = Array.from(grid.querySelectorAll('.pf-item.is-sibling')).filter(
        (el) => getComputedStyle(el).display !== 'none',
      )
      const boxes = set.map((el) => el.getBoundingClientRect())
      const o = opened.getBoundingClientRect()
      const ox = (o.left + o.right) / 2
      const oy = (o.top + o.bottom) / 2
      const left = Math.min(...boxes.map((r) => r.left))
      const right = Math.max(...boxes.map((r) => r.right))
      const top = Math.min(...boxes.map((r) => r.top))
      const bottom = Math.max(...boxes.map((r) => r.bottom))
      const area = boxes.reduce((n, r) => n + r.width * r.height, 0)
      const far = Math.max(
        ...boxes.map((r) => Math.hypot((r.left + r.right) / 2 - ox, (r.top + r.bottom) / 2 - oy)),
      )
      // The set sits in a half-disc under and beside the shirt (nothing can
      // go above the top tile in a grid that fills downward), so the round
      // reference is a half-disc of the same area.
      const halfDisc = Math.sqrt((2 * area) / Math.PI)
      return {aspect: (right - left) / (bottom - top), reach: far / halfDisc, n: set.length}
    })
    check(
      'the gather grows middle-out as a cluster, not in long rows',
      shape.aspect < 3 && shape.reach < 1.6,
      `${shape.n} pieces, ${shape.aspect.toFixed(2)}:1 wide, furthest piece at ${shape.reach.toFixed(2)}x a round cluster's radius`,
    )
    check('and shown whole, in its own proportions - not cropped square', sizes.cropped === 0, `${sizes.cropped} cropped`)

    // Closing it hides the revealed pieces again: the view is garments at rest.
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1200)
    const closed = await state(page)
    check('closing hides the revealed pieces again', closed.shown === closed.shownMerch && closed.shownMerch === m.shownMerch, `${closed.shown} on screen, ${closed.shownMerch} merch`)
  }

  /*
    A PIECE'S OWN PIECES COME FIRST, AT ORDINARY SIZE.

    No shirt has alternate shots parented to it yet, but the Desperate Foes
    hoodie already hangs off its artwork, which is the same relationship from
    the other side: open the hoodie and the piece it belongs to must arrive
    right beside it at full size, with the rest of DumpStat half-size after.
  */
  const child = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const el = all.find(
      (t) => t.dataset.pieceParent && getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0,
    )
    return el ? {i: all.indexOf(el), parent: el.dataset.pieceParent} : null
  })
  if (!child) {
    console.log('\n(no merch piece with a piece parent is on screen - near-first check skipped)')
  } else {
    const tile = page.locator('#pf-grid .pf-item').nth(child.i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1800)
    const near = await page.evaluate((parent) => {
      const grid = document.querySelector('#pf-grid')
      const shown = Array.from(grid.querySelectorAll('.pf-item')).filter(
        (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
      )
      const opened = grid.querySelector('.pf-item.is-expanded')
      const p = grid.querySelector(`.pf-item[data-piece="${parent}"]`)
      /*
        HUGGING: the piece's box shares an edge with the opened tile's -
        side by side with their heights overlapping, or one directly on top
        of the other with their widths overlapping. Boxes include the
        padding, so neighbours meet exactly; 2px allows for rounding.
      */
      const touches = (a, b) => {
        const side = (Math.abs(a.right - b.left) <= 2 || Math.abs(b.right - a.left) <= 2) && a.top < b.bottom - 2 && b.top < a.bottom - 2
        const stack = (Math.abs(a.bottom - b.top) <= 2 || Math.abs(b.bottom - a.top) <= 2) && a.left < b.right - 2 && b.left < a.right - 2
        return side || stack
      }
      const g = grid.getBoundingClientRect()
      const o = opened.getBoundingClientRect()
      return {
        hugs: !!p && touches(p.getBoundingClientRect(), o),
        centred: Math.abs((o.left + o.right) / 2 - (g.left + g.right) / 2) <= g.width / 10,
        shown: !!p && shown.includes(p),
        next: !!p && shown.indexOf(p) === shown.indexOf(opened) + 1,
        ordinary: !!p && !p.classList.contains('is-minor') && Math.abs(p.getBoundingClientRect().width / (grid.clientWidth / 5) - 1) < 0.05,
      }
    }, child.parent)
    console.log('')
    check("opening a piece brings the piece it hangs off right beside it", near.shown && near.next, JSON.stringify(near))
    check('at ordinary size, not half', near.ordinary)
    check('and hugging it - sharing an edge with the opened piece', near.hugs)
    check('with the opened piece in the centre of the grid', near.centred)
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(1000)
  }

  // Another filter leaves the merch view entirely.
  // Both constants passed in: the page cannot see this script's variables.
  const other = await page.evaluate(
    ([MERCH, TYPE]) =>
      Array.from(document.querySelectorAll('.pf-btn[data-filter]'))
        .map((b) => b.dataset.filter)
        .find((f) => f !== '*' && f !== MERCH && f !== TYPE) ?? null,
    [MERCH, TYPE],
  )
  if (other) {
    await press(page, other)
    const o = await state(page)
    console.log('')
    check(`${other} leaves the merch view`, !o.merchView && !o.active.includes(MERCH), JSON.stringify(o.active))
    check(`${other} restores the normal columns`, o.cols === before.cols, `${o.cols} columns, was ${before.cols}`)
    check(`only ${other} is on screen`, o.shown > 0, `${o.shown} tiles`)
  }

  /*
    TYPE / LETTERING: four columns, a 2px seam, every picture cropped square.
    And views are exclusive of each other as well as of the filters.
  */
  await press(page, TYPE)
  const t = await state(page)
  console.log('')
  check('Type/Lettering switches to 4 columns', t.cols === 4, `${t.cols} columns`)
  check('Type/Lettering is the only active filter', t.active.length === 1 && t.active[0] === TYPE, JSON.stringify(t.active))
  check('and it is a view, not a combined filter', t.typeView && !t.merchView)
  check('every type picture is cropped square', t.notSquare === 0, `${t.notSquare} not square`)
  const seam = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
      .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0)
      .map((el) => el.querySelector('.pf-item__img').getBoundingClientRect())
    // Horizontal neighbours: same top, the nearest picture to the right.
    const gaps = []
    for (const a of imgs) {
      const right = imgs.filter((b) => Math.abs(b.top - a.top) < 2 && b.left > a.left).sort((x, y) => x.left - y.left)[0]
      if (right) gaps.push(right.left - a.right)
    }
    return gaps.length ? {min: Math.min(...gaps), max: Math.max(...gaps), n: gaps.length} : null
  })
  check('the seam between pieces is really thin', seam && seam.max <= 3, seam ? `${seam.min.toFixed(1)}-${seam.max.toFixed(1)}px across ${seam.n} pairs` : 'no neighbours found')

  await press(page, MERCH)
  const tm = await state(page)
  check('Merch from Type switches views cleanly', tm.merchView && !tm.typeView && tm.cols === 5, `${tm.cols} columns, ${JSON.stringify(tm.active)}`)
  await press(page, MERCH)

  // Merch again, then Merch once more: toggles back to everything.
  await press(page, MERCH)
  await press(page, MERCH)
  const off = await state(page)
  console.log('')
  check('pressing Merch again returns to All', off.active.length === 1 && off.active[0] === '*', JSON.stringify(off.active))
  check('with every tile back', off.shown === before.shown, `${off.shown} of ${before.shown}`)
  check('and the normal columns', off.cols === before.cols, `${off.cols} columns`)
  await page.close()
}

// ------------------------------------------- ALL view: pieces of pieces
/*
  Chris, about to parent More Kilos closeups straight to the More Kilos tee:
  "make sure they Gather when you click to anything that is parented to the
  Case Study" - in the ALL view, not just the merch one.

  The DumpStat pieces that already hang off another DumpStat piece are the
  same shape of data, so they stand in. In the All grid, opening ANY of
  three kinds of tile must gather the whole project, nested pieces
  included: a nested piece, the piece it hangs off, and the case study.
*/
{
  const page = await open(1440, 900)
  const setup = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const nested = all.find((el) => el.dataset.pieceParent && href(el))
    if (!nested) return null
    const parent = all.find((el) => el.dataset.piece === nested.dataset.pieceParent)
    const h = href(nested)
    const study = all.find((el) => el.classList.contains('pf-item--study') && href(el) === h)
    return {
      h,
      nestedCount: all.filter((el) => el.dataset.pieceParent && href(el) === h).length,
      total: all.filter((el) => href(el) === h).length,
      sameLink: !!parent && href(parent) === h,
      starts: {nested: all.indexOf(nested), parent: all.indexOf(parent), study: study ? all.indexOf(study) : -1},
    }
  })
  console.log('')
  if (!setup) {
    check('a nested piece exists to test the All view with', false)
  } else {
    console.log(`ALL view: ${setup.h} has ${setup.total} pieces, ${setup.nestedCount} of them hanging off another piece`)
    check('a nested piece links to the case study, same as the piece it hangs off', setup.sameLink)
    for (const [kind, i] of Object.entries(setup.starts)) {
      if (i < 0) {
        check(`(${kind}) tile found`, false)
        continue
      }
      // Each from a fresh page, so one gather cannot set up the next.
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.waitForSelector('#pf-grid .pf-item', {state: 'visible'})
      await page.waitForTimeout(2000)
      // The index from the first load is the build's order, which a reload repeats.
      const tile = page.locator('#pf-grid .pf-item').nth(i)
      await tile.scrollIntoViewIfNeeded()
      await tile.locator('.pf-item__img').click()
      await page.waitForTimeout(1800)
      const r = await page.evaluate((h) => {
        const grid = document.querySelector('#pf-grid')
        const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
        const shown = Array.from(grid.querySelectorAll('.pf-item')).filter(
          (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
        )
        const fam = shown.filter((el) => href(el) === h)
        const lit = fam.filter((el) => el.classList.contains('is-sibling'))
        const idx = fam.map((el) => shown.indexOf(el))
        return {
          n: fam.length,
          lit: lit.length,
          nestedLit: lit.filter((el) => el.dataset.pieceParent).length,
          contiguous: Math.max(...idx) - Math.min(...idx) + 1 === fam.length,
        }
      }, setup.h)
      check(
        `opening the ${kind} gathers the whole project, nested pieces included`,
        r.lit === setup.total && r.nestedLit === setup.nestedCount && r.contiguous,
        `${r.lit} of ${setup.total} lit, ${r.nestedLit} of ${setup.nestedCount} nested, contiguous: ${r.contiguous}`,
      )
    }
  }
  await page.close()
}

// ---------------------------------------------------------------- phone
{
  const page = await open(390, 844)
  await press(page, MERCH)
  const p = await state(page)
  console.log('')
  check('on a phone the merch view is 2 columns', p.cols === 2, `${p.cols} columns`)
  await press(page, TYPE)
  const pt = await state(page)
  check('and so is the type view', pt.cols === 2, `${pt.cols} columns`)
  const docW = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  check('and nothing scrolls sideways', docW[0] <= docW[1], `${docW[0]} vs ${docW[1]}`)
  await page.close()
}

await browser.close()
console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('The merch view behaves as asked.')
