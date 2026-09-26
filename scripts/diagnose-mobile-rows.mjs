/*
  What a case study page actually does at phone width.

  WHY THIS EXISTS

  Chris sent three screenshots of the live site on a phone: a grey panel
  sitting at the left edge with nothing in it, a video block followed by
  half a screen of white, and a pair of photographs with a gap between
  them wide enough to read as a mistake. Every layout check in this repo
  runs at 1512x900, which is exactly the width at which none of that
  happens.

  So this measures the things a phone screenshot shows and a desktop
  check cannot:

    - anything sticking out past the viewport, which is what a stray
      grey block at the edge of the screen IS
    - the gap between items in a row, as a share of the screen
    - dead vertical space between blocks, which is what "not slotting"
      looks like from the reader's side
    - each row's own geometry: strip or fitted, panel or none, where the
      items sit inside it

  READ-ONLY. Reports; changes nothing.

  Usage: node scripts/diagnose-mobile-rows.mjs [baseUrl] [path ...]
*/
import {chromium} from 'playwright'

const BASE = process.argv[2] ?? 'https://rumeaudesign.co'
const ARGS = process.argv.slice(3)
const VIEWPORT = {width: 390, height: 844}
// An iPhone reports 3x; layout is in CSS pixels either way, but a device
// pixel ratio of 1 would let a 0.5px difference round the wrong way.
const SCALE = 3

const browser = await chromium.launch()
const page = await browser.newPage({viewport: VIEWPORT, deviceScaleFactor: SCALE, isMobile: true})

/*
  The pages to look at. Given ones, or every case study the sitemap knows -
  because the bug is in a layout, and which page happens to show it is an
  accident of what Chris put in which block.
*/
let paths = ARGS
if (!paths.length) {
  const res = await fetch(`${BASE}/sitemap-0.xml`).catch(() => null)
  const xml = res && res.ok ? await res.text() : ''
  paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => p.startsWith('/work/'))
  if (!paths.length) paths = ['/work/two-point-oh']
}

console.log(`${BASE} at ${VIEWPORT.width}x${VIEWPORT.height} (dpr ${SCALE})`)
console.log(`${paths.length} page(s)\n`)

const report = []

for (const path of paths) {
  const response = await page.goto(`${BASE}${path}`, {waitUntil: 'load', timeout: 60000})
  if (!response || !response.ok()) {
    console.log(`=== ${path} === HTTP ${response ? response.status() : 'no response'}`)
    continue
  }
  // Same raced waits as test-media-row-slots: an image whose request never
  // completes must not be able to hang this.
  await page.evaluate(() => {
    const within = (ms, p) => Promise.race([p, new Promise((r) => setTimeout(r, ms))])
    return within(
      8000,
      Promise.all(
        Array.from(document.images).map((i) =>
          i.complete ? null : within(3000, i.decode().catch(() => {})),
        ),
      ),
    )
  })

  const found = await page.evaluate((vw) => {
    const round = (n) => Math.round(n)
    const boxOf = (el) => {
      const b = el.getBoundingClientRect()
      return {
        x: round(b.left + window.scrollX),
        y: round(b.top + window.scrollY),
        w: round(b.width),
        h: round(b.height),
      }
    }

    /*
      OVERFLOW: anything drawn outside the viewport's width. A phone shows
      this as a thing half off the screen, and a horizontal scrollbar where
      the page has one. Elements with no size are skipped - a hidden or
      empty node hanging off the edge harms nobody.
    */
    const overflow = []
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect()
      if (b.width < 2 || b.height < 2) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      // Inside a sideways scroller, hanging off the edge is the point.
      if (el.closest('.is-strip, [style*="overflow"]') && !el.classList.contains('is-strip')) continue
      const left = b.left + window.scrollX
      const right = left + b.width
      if (left < -1 || right > vw + 1) {
        overflow.push({
          el: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.')}`,
          box: boxOf(el),
          past: round(Math.max(-left, right - vw)),
          background: style.backgroundColor,
        })
      }
    }

    /*
      ROWS: what each Media Row is doing here - strip or fitted, on a panel
      or not, and where its items landed inside it.
    */
    const rows = Array.from(document.querySelectorAll('.media-row__items')).map((row) => {
      const items = Array.from(row.querySelectorAll('.media-row__item')).map((fig) => {
        const media = fig.querySelector('img, video')
        return {
          fig: boxOf(fig),
          media: media ? boxOf(media) : null,
          caption: fig.querySelector('figcaption')?.textContent?.trim().slice(0, 40) ?? null,
        }
      })
      const panel = row.closest('.media-row__panel')
      const gaps = []
      for (let i = 1; i < items.length; i += 1) {
        const prev = items[i - 1].fig
        gaps.push(round(items[i].fig.x - (prev.x + prev.w)))
      }
      return {
        strip: row.classList.contains('is-strip'),
        slots: row.classList.contains('has-slots'),
        fit: row.dataset.fit ?? null,
        cssGap: getComputedStyle(row).columnGap,
        box: boxOf(row),
        scrollWidth: round(row.scrollWidth),
        panel: panel ? {box: boxOf(panel), kind: panel.dataset.panel ?? null} : null,
        gaps,
        items,
      }
    })

    /*
      DEAD SPACE: the vertical distance between one block's bottom and the
      next block's top. A block whose box is taller than what it drew shows
      up here as a large number with nothing in it.
    */
    const blocks = Array.from(document.querySelectorAll('.work-band__inner > *')).map((el) => {
      const media = el.querySelectorAll('img, video, .work-video-frame')
      const drawn = Array.from(media)
        .map((m) => m.getBoundingClientRect())
        .filter((b) => b.width > 1 && b.height > 1)
      const bottom = drawn.length ? Math.max(...drawn.map((b) => b.bottom + window.scrollY)) : null
      const box = boxOf(el)
      return {
        el: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`,
        box,
        // How much of the block's own height is below everything it drew.
        tail: bottom === null ? null : round(box.y + box.h - bottom),
        text: (el.textContent || '').trim().slice(0, 30),
      }
    })

    return {
      scrollWidth: round(document.documentElement.scrollWidth),
      overflow,
      rows,
      blocks,
    }
  }, VIEWPORT.width)

  report.push({path, ...found})

  console.log(`=== ${path} ===`)
  console.log(`document scrollWidth ${found.scrollWidth} (viewport ${VIEWPORT.width})`)

  if (found.overflow.length) {
    console.log(`\n  ${found.overflow.length} element(s) outside the viewport:`)
    for (const o of found.overflow.slice(0, 12)) {
      console.log(
        `    ${o.past}px past  ${o.el}  x${o.box.x} y${o.box.y} ${o.box.w}x${o.box.h}  bg ${o.background}`,
      )
    }
  } else {
    console.log('  nothing outside the viewport')
  }

  console.log(`\n  ${found.rows.length} media row(s):`)
  found.rows.forEach((row, i) => {
    const how = [row.strip && 'strip', row.slots && `slots ${row.fit ?? 'NO FIT'}`, row.panel && `${row.panel.kind} panel`]
      .filter(Boolean)
      .join(', ')
    console.log(
      `    row ${i}: ${row.items.length} item(s)${how ? ` [${how}]` : ''}  ` +
        `box x${row.box.x} ${row.box.w}x${row.box.h}  scrollW ${row.scrollWidth}  css gap ${row.cssGap}`,
    )
    if (row.panel) {
      console.log(`      panel  x${row.panel.box.x} y${row.panel.box.y} ${row.panel.box.w}x${row.panel.box.h}`)
    }
    if (row.gaps.length) {
      console.log(`      gaps between items: ${row.gaps.join(', ')}px`)
    }
    row.items.forEach((it, j) => {
      console.log(
        `      item ${j}: fig x${it.fig.x} y${it.fig.y} ${it.fig.w}x${it.fig.h}` +
          (it.media ? `  media ${it.media.w}x${it.media.h}` : '  (no media)') +
          (it.caption ? `  "${it.caption}"` : ''),
      )
    })
  })

  const dead = found.blocks.filter((b) => b.tail !== null && b.tail > 48)
  if (dead.length) {
    console.log(`\n  block(s) with empty space below their last picture:`)
    for (const b of dead) console.log(`    ${b.tail}px  ${b.el}  ${b.box.w}x${b.box.h}`)
  }
  console.log('')
}

await browser.close()
console.log(`\n${report.length} page(s) measured.`)
