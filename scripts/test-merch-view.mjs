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
      THE SHIRT'S HEIGHT FIRST, THE MIDDLE FIRST WITHIN IT.

      Chris, twice. First: "I would rather Gather populate from the middle
      out, rather than going for long rows across the screen." Then, on a
      version that grew a round cluster and pushed pieces under the shirt
      and off the screen: "a lot of elements are appearing at the bottom...
      okay with shrinking elements... if it means they can fit the viewport
      as a row (but filling out the middle is priority)".

      So, measured in underlying columns across the opened shirt's height:
        band   no piece sits below the shirt while some column beside it
               still has room in that height for the piece that went below
        middle on each side, the column next to the shirt's strip is no
               emptier than the outermost one - the middle fills first
    */
    const band = await page.evaluate(() => {
      const grid = document.querySelector('#pf-grid')
      const g = grid.getBoundingClientRect()
      const n = Math.round(g.width / grid.querySelector('.pf-sizer').getBoundingClientRect().width)
      const colW = g.width / n
      const shirt = grid.querySelector('.pf-item.is-expanded').getBoundingClientRect()
      // The band runs from the top of the project's block, when there is
      // one, to the foot of the shirt: the block and the shirt are one stack.
      const block = grid.querySelector('.pf-item.is-card')?.getBoundingClientRect()
      const opened = {left: shirt.left, right: shirt.right, bottom: shirt.bottom, top: block ? block.top : shirt.top}
      const set = Array.from(grid.querySelectorAll('.pf-item.is-sibling'))
        .filter(
          (el) =>
            getComputedStyle(el).display !== 'none' &&
            !el.classList.contains('is-expanded') &&
            !el.classList.contains('is-card'),
        )
        .map((el) => el.getBoundingClientRect())
      // The block takes room in its columns like any piece, but is not one of
      // the pieces that could have gone below.
      const occupied = block ? [...set, block] : set
      // Free height inside the band, per column.
      const free = []
      for (let c = 0; c < n; c++) {
        const l = g.left + c * colW
        const r = l + colW
        if (l >= opened.left - 1 && r <= opened.right + 1) {
          free.push(null) // the shirt's own columns
          continue
        }
        let used = 0
        for (const b of occupied) {
          if (b.left < r - 1 && b.right > l + 1) {
            used += Math.max(0, Math.min(b.bottom, opened.bottom) - Math.max(b.top, opened.top))
          }
        }
        free.push(Math.max(0, opened.bottom - opened.top - used))
      }
      const below = set.filter((b) => b.top >= opened.bottom - 2)
      const smallest = below.length ? Math.min(...below.map((b) => b.height)) : Infinity
      const roomy = free.filter((f) => f !== null && f >= smallest + 2).length
      const firstOpen = free.findIndex((f) => f === null)
      const lastOpen = free.length - 1 - [...free].reverse().findIndex((f) => f === null)
      // Middle vs edge, per side: the column just outside the shirt's strip
      // of shots (two columns out) against the outermost column.
      const innerL = free[Math.max(0, firstOpen - 3)]
      const innerR = free[Math.min(n - 1, lastOpen + 3)]
      return {
        n,
        set: set.length,
        below: below.length,
        roomy,
        free: free.map((f) => (f === null ? '#' : Math.round(f))),
        /*
          40px of tolerance, less than any piece is tall: the failure this
          exists for is a whole outer column left standing empty (610px free
          beside a full middle), not 13px of difference between two columns
          that are both full - which is what a left-anchored shirt with
          every column packed measured.
        */
        middleFirst:
          (innerL === null || innerL <= free[0] + 40) && (innerR === null || innerR <= free[n - 1] + 40),
      }
    })
    check(
      'pieces fill the band beside the shirt before going below it',
      band.below === 0 || band.roomy === 0,
      `${band.set} pieces, ${band.below} below the shirt, ${band.roomy} column(s) with room left; free px per column [${band.free.join(' ')}]`,
    )
    check('the middle fills before the outer edges', band.middleFirst, `free px per column [${band.free.join(' ')}]`)
    check('and shown whole, in its own proportions - not cropped square', sizes.cropped === 0, `${sizes.cropped} cropped`)

    /*
      THE PROJECT'S BLOCK. Chris: "the cluster with type, the main clickable
      block above it". The case study's own tile, set in type, at the shirt's
      width directly on top of it, and one link into the project.
    */
    const blk = await page.evaluate((h) => {
      const grid = document.querySelector('#pf-grid')
      const el = grid.querySelector('.pf-item.is-card')
      const shirt = grid.querySelector('.pf-item.is-expanded')
      const hasOne = Array.from(grid.querySelectorAll('.pf-item')).some(
        (x) => x.querySelector('.pf-card')?.getAttribute('href') === h,
      )
      if (!el) return {hasOne, shown: false}
      const b = el.getBoundingClientRect()
      const s = shirt.getBoundingClientRect()
      const link = el.querySelector('.pf-card')
      return {
        hasOne,
        shown: getComputedStyle(el).display !== 'none' && b.height > 0 && getComputedStyle(link).display !== 'none',
        picture: getComputedStyle(el.querySelector('.pf-item__frame')).display !== 'none',
        // Desktop: to the shirt's right, level with its top. Phone: on top of it.
        beside: Math.abs(b.left - s.right) < 2 && Math.abs(b.top - s.top) < 2 && s.left - grid.getBoundingClientRect().left < 2,
        over: Math.abs(b.left - s.left) < 2 && Math.abs(b.width - s.width) < 2 && Math.abs(b.bottom - s.top) < 2,
        geometry: `block ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}; shirt ${Math.round(s.left)},${Math.round(s.top)} ${Math.round(s.width)}x${Math.round(s.height)}`,
        href: link.getAttribute('href'),
        title: link.querySelector('.pf-card__title')?.textContent.trim(),
        mark: (() => {
          const img = link.querySelector('.pf-card__mark img')
          if (!img) return 'none set'
          const r = img.getBoundingClientRect()
          return r.width > 0 && r.right <= link.querySelector('.pf-card__text').getBoundingClientRect().left + 1
            ? 'beside the type'
            : 'misplaced'
        })(),
        // Kinds of the rest, in the order they were laid out: 0 merch,
        // 1 logo/wordmark, 2 everything else.
        kinds: Array.from(grid.querySelectorAll('.pf-item.is-minor')).map((x) =>
          x.classList.contains('merch-apparel') ? 0 : x.classList.contains('pf-item--mark') ? 1 : 2,
        ),
      }
    }, target.h)
    if (!blk.hasOne) {
      console.log('      (this project has no case study block to show)')
    } else {
      check("the project's block is on screen", blk.shown && !blk.picture, `title "${blk.title}"`)
      // Chris: "move the main shirt object to the left, and put the text to the right of it".
      check('the shirt at the left edge, the block to its right, level with its top', blk.beside, blk.geometry)
      check('and the whole of it one link into the project', blk.href === target.h, blk.href)
      check("the project's logo sits beside the type, when it has one", blk.mark !== 'misplaced', blk.mark)
      // Chris: related merch first, then logos/wordmarks together, then the rest.
      const sorted = blk.kinds.every((k, i) => i === 0 || blk.kinds[i - 1] <= k)
      check('the rest runs merch, then logos and wordmarks, then everything else', sorted, blk.kinds.join(''))
    }

    // Closing it hides the revealed pieces again: the view is garments at rest.
    // By the open tile itself, not its old place in the grid: the project's
    // block now goes in front of it.
    await page.locator('#pf-grid .pf-item.is-expanded .pf-item__img').click()
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
        // Centred when there is no project block; at the left edge beside one.
        placed: grid.querySelector('.pf-item.is-card')
          ? o.left - g.left < 2
          : Math.abs((o.left + o.right) / 2 - (g.left + g.right) / 2) <= g.width / 10,
        shown: !!p && shown.includes(p),
        next: !!p && shown.indexOf(p) === shown.indexOf(opened) + 1,
        ordinary: !!p && !p.classList.contains('is-minor') && Math.abs(p.getBoundingClientRect().width / (grid.clientWidth / 5) - 1) < 0.05,
      }
    }, child.parent)
    console.log('')
    check("opening a piece brings the piece it hangs off right beside it", near.shown && near.next, JSON.stringify(near))
    check('at ordinary size, not half', near.ordinary)
    check('and hugging it - sharing an edge with the opened piece', near.hugs)
    check('with the opened piece where its layout puts it (left beside its block, else centred)', near.placed)
    await page.locator('#pf-grid .pf-item.is-expanded .pf-item__img').click()
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
      // A clean address, not reload(): the page now writes the open piece
      // into its address, and reloading would replay it - see SHAREABLE LINKS.
      await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded'})
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

/*
  ---------------------------------------------------------------- in the window

  Chris: "the way it puts together is not fully in the viewport, so you kind
  of have to scroll down a little bit (on desktop that is)". Measured before
  the fix: 12 of 12 gathers ran 9-137px off the bottom of laptop windows.

  Each shirt is clicked where a visitor scrolling down would meet it - the
  middle of the window - and the whole gathered set must then sit inside the
  window. 1536x730 is a common laptop with browser toolbars; 2560x1000 is a
  wide, short window where the opened shirt (four tenths of the width) would
  be taller than the window if nothing capped it.
*/
for (const [w, h] of [[1536, 730], [2560, 1000]]) {
  console.log('')
  const misses = []
  let tried = 0
  // A fresh page per shirt, so one gather's reordering cannot steer the next.
  for (const pick of ['first', 'middle', 'last']) {
    const page = await open(w, h)
    await press(page, MERCH)
    const i = await page.evaluate((pick) => {
      const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
      const leads = all.filter((el) => getComputedStyle(el).display !== 'none' && el.dataset.merch === 'lead')
      const k = pick === 'first' ? 0 : pick === 'middle' ? Math.floor(leads.length / 2) : leads.length - 1
      return leads[k] ? all.indexOf(leads[k]) : -1
    }, pick)
    if (i >= 0) {
      tried++
      const tile = page.locator('#pf-grid .pf-item').nth(i)
      await tile.evaluate((el) => el.scrollIntoView({block: 'center'}))
      await page.waitForTimeout(400)
      await tile.locator('.pf-item__img').click()
      await page.waitForTimeout(2200)
      const r = await page.evaluate(() => {
        const grid = document.querySelector('#pf-grid')
        const opened = grid.querySelector('.pf-item.is-expanded')
        const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
        let top = Infinity
        let bottom = -Infinity
        // A piece with no case study opens alone: no link is not a project.
        const h = href(opened)
        for (const el of grid.querySelectorAll('.pf-item')) {
          if (el !== opened && (!h || href(el) !== h || getComputedStyle(el).display === 'none')) continue
          const b = el.getBoundingClientRect()
          top = Math.min(top, b.top)
          bottom = Math.max(bottom, b.bottom)
        }
        return {top: Math.round(top), bottom: Math.round(bottom), vh: innerHeight}
      })
      if (r.top < 0 || r.bottom > r.vh) misses.push(`${pick} ${r.top}..${r.bottom} of ${r.vh}`)
      else console.log(`      ${pick}: ${r.top}..${r.bottom} of ${r.vh}`)
    }
    await page.close()
  }
  check(
    `at ${w}x${h} the gathered set lands inside the window`,
    tried > 0 && misses.length === 0,
    misses.length ? `${misses.length} of ${tried} cut: ${misses.join(', ')}` : `${tried} of ${tried} whole`,
  )
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
