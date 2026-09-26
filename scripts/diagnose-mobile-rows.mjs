/*
  What a case study page actually does at phone width.

  WHY THIS EXISTS

  Chris sent three screenshots of the live site on a phone: a grey block
  sitting at the left edge with nothing in it, a video followed by half a
  screen of white, and a pair of photographs with a gap between them wide
  enough to read as a mistake. Every layout check in this repo runs at
  1512x900, which is exactly the width at which none of that happens.

  So this measures the things a phone screenshot shows and a desktop
  check cannot:

    - anything drawn past the viewport, which is what a stray grey block
      at the edge of the screen IS
    - every painted background inside the band, with its box and colour,
      so "what is that grey thing" is a fact rather than a theory
    - the gap between items in a row, against the width of the row
    - dead vertical space below a block's last picture
    - each row's geometry: strip or fitted, panelled or not, and where
      the items sit relative to the panel they are supposed to be on

  At three widths, because two of the three screenshots are wider than a
  phone and a bug living between the phone rules and the desktop rules is
  one nothing here would ever have looked at.

  READ-ONLY. Reports; changes nothing.

  Usage: [WIDTHS=390,430,744] node scripts/diagnose-mobile-rows.mjs [baseUrl] [path ...]
*/
import {chromium} from 'playwright'

const BASE = process.argv[2] ?? 'https://rumeaudesign.co'
const ARGS = process.argv.slice(3)
const WIDTHS = (process.env.WIDTHS ?? '390,430,744').split(',').map(Number)
const HEIGHT = 844

const browser = await chromium.launch()

/*
  The pages to look at. Given ones, or every case study the sitemap knows -
  the bug is in a layout, and which page shows it is an accident of what
  Chris put in which block.
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

console.log(`${BASE}`)
console.log(`${paths.length} page(s) at ${WIDTHS.join(', ')}px wide\n`)

const measure = (vw) => {
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
  const name = (el) =>
    `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.')}`

  /*
    OVERFLOW: anything drawn outside the viewport's width. A phone shows
    this as a thing half off the screen. Inside a sideways scroller,
    hanging off the edge is the whole point, so those are skipped.
  */
  const overflow = []
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect()
    if (b.width < 2 || b.height < 2) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    if (el.closest('.is-strip') && !el.classList.contains('is-strip')) continue
    const left = b.left + window.scrollX
    const right = left + b.width
    if (left < -1 || right > vw + 1) {
      overflow.push({el: name(el), box: boxOf(el), past: round(Math.max(-left, right - vw)), bg: style.backgroundColor})
    }
  }

  /*
    PAINTED: every element in the band that puts a colour down. This is
    how a grey rectangle in a screenshot gets a name - without it, the
    only way to say what it was would be to guess from its colour.
  */
  const painted = []
  for (const el of document.querySelectorAll('.work-band *, .work-band')) {
    const style = getComputedStyle(el)
    const bg = style.backgroundColor
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue
    const b = el.getBoundingClientRect()
    if (b.width < 8 || b.height < 8) continue
    painted.push({el: name(el), box: boxOf(el), bg})
  }

  const rows = Array.from(document.querySelectorAll('.media-row__items')).map((row) => {
    const items = Array.from(row.querySelectorAll('.media-row__item')).map((fig) => {
      const media = fig.querySelector('img, video')
      /*
        THE CEILINGS, not just the box.

        A <video> whose metadata has not arrived reports the HTML default
        of 300x150, and in a headless browser it usually has not - so the
        measured box of a clip says nothing about how it was sized. What
        can be read either way is what the stylesheet is telling it: the
        shelf height the row hands out, and the two ceilings the clip
        itself carries. A picture and a clip on one shelf should be under
        the same numbers, and that is checkable with nothing loaded.
      */
      const ceilings =
        media && media.tagName === 'VIDEO'
          ? (() => {
              const s = getComputedStyle(media)
              return {
                stripH: getComputedStyle(fig).getPropertyValue('--strip-h').trim(),
                videoFit: getComputedStyle(fig).getPropertyValue('--video-fit').trim(),
                maxH: s.maxHeight,
                maxW: s.maxWidth,
              }
            })()
          : null
      return {
        fig: boxOf(fig),
        media: media ? boxOf(media) : null,
        tag: media ? media.tagName.toLowerCase() : null,
        ceilings,
        caption: fig.querySelector('figcaption')?.textContent?.trim().slice(0, 34) ?? null,
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
      /*
        THE PANEL'S JOB, as a number.

        The first version of this counted items whose box fell outside the
        panel's, which is a fair question for a fitted row and a
        meaningless one for a strip: everything past the first screen of a
        scroller is "outside" whatever contains it, before and after any
        fix. It reported 3 of 4 either way and could not have told them
        apart.

        What actually distinguishes them is where the SCROLLER sits. If
        the row's own box is the panel's content box, the sheet is under
        the work the whole way across and the rest is scrolling. If it is
        the viewport, the row has broken out of the sheet.
      */
      panelFit: panel
        ? (() => {
            const p = boxOf(panel)
            const s = getComputedStyle(panel)
            const contentX = p.x + parseFloat(s.paddingLeft || '0')
            const contentW = p.w - parseFloat(s.paddingLeft || '0') - parseFloat(s.paddingRight || '0')
            const b = boxOf(row)
            return {
              content: `x${round(contentX)} ${round(contentW)}`,
              row: `x${b.x} ${b.w}`,
              inside: Math.abs(b.x - contentX) <= 1 && b.w <= contentW + 1,
            }
          })()
        : null,
      gaps,
      items,
    }
  })

  /*
    DEAD SPACE: how much of a block's height sits below everything it drew.
  */
  const blocks = Array.from(document.querySelectorAll('.work-band__inner > *')).map((el) => {
    const drawn = Array.from(el.querySelectorAll('img, video, .work-video-frame'))
      .map((m) => m.getBoundingClientRect())
      .filter((b) => b.width > 1 && b.height > 1)
    const bottom = drawn.length ? Math.max(...drawn.map((b) => b.bottom + window.scrollY)) : null
    const box = boxOf(el)
    return {el: name(el), box, tail: bottom === null ? null : round(box.y + box.h - bottom)}
  })

  return {scrollWidth: round(document.documentElement.scrollWidth), overflow, painted, rows, blocks}
}

for (const width of WIDTHS) {
  const page = await browser.newPage({
    viewport: {width, height: HEIGHT},
    deviceScaleFactor: 3,
    isMobile: width < 700,
  })

  console.log(`\n########## ${width}x${HEIGHT} ##########`)

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
          Array.from(document.images).map((i) => (i.complete ? null : within(3000, i.decode().catch(() => {})))),
        ),
      )
    })

    const found = await page.evaluate(measure, width)

    console.log(`\n=== ${path} ===`)
    console.log(`document scrollWidth ${found.scrollWidth} (viewport ${width})`)

    if (found.overflow.length) {
      console.log(`  ${found.overflow.length} element(s) outside the viewport:`)
      for (const o of found.overflow.slice(0, 10)) {
        console.log(`    ${o.past}px past  ${o.el}  x${o.box.x} y${o.box.y} ${o.box.w}x${o.box.h}  bg ${o.bg}`)
      }
    } else {
      console.log('  nothing outside the viewport')
    }

    if (found.painted.length) {
      console.log(`  ${found.painted.length} painted background(s) in the band:`)
      for (const p of found.painted.slice(0, 14)) {
        console.log(`    ${p.bg.padEnd(22)} ${p.el}  x${p.box.x} y${p.box.y} ${p.box.w}x${p.box.h}`)
      }
    }

    console.log(`  ${found.rows.length} media row(s):`)
    found.rows.forEach((row, i) => {
      const how = [
        row.strip && 'strip',
        row.slots && `slots ${row.fit ?? 'NO FIT'}`,
        row.panel && `${row.panel.kind} panel`,
      ]
        .filter(Boolean)
        .join(', ')
      console.log(
        `    row ${i}: ${row.items.length} item(s)${how ? ` [${how}]` : ''}  ` +
          `box x${row.box.x} y${row.box.y} ${row.box.w}x${row.box.h}  scrollW ${row.scrollWidth}  css gap ${row.cssGap}`,
      )
      if (row.panel) {
        console.log(
          `      panel x${row.panel.box.x} y${row.panel.box.y} ${row.panel.box.w}x${row.panel.box.h}` +
            `  content ${row.panelFit.content}  row ${row.panelFit.row}  ` +
            (row.panelFit.inside ? 'the row is ON the sheet' : 'the row has BROKEN OUT of the sheet'),
        )
      }
      if (row.gaps.length) {
        const share = ((row.gaps[0] / Math.max(row.box.w, 1)) * 100).toFixed(1)
        console.log(`      gaps between items: ${row.gaps.join(', ')}px  (${share}% of the row)`)
      }
      row.items.forEach((it, j) => {
        console.log(
          `      item ${j}: ${it.tag ?? '?'} fig x${it.fig.x} y${it.fig.y} ${it.fig.w}x${it.fig.h}` +
            (it.media ? `  media ${it.media.w}x${it.media.h}` : '  (no media)') +
            (it.caption ? `  "${it.caption}"` : ''),
        )
        if (it.ceilings) {
          console.log(
            `         ceilings: shelf ${it.ceilings.stripH || '(none)'}  ` +
              `--video-fit ${it.ceilings.videoFit || '(none)'}  ` +
              `max-height ${it.ceilings.maxH}  max-width ${it.ceilings.maxW}`,
          )
        }
      })
    })

    const dead = found.blocks.filter((b) => b.tail !== null && b.tail > 48)
    if (dead.length) {
      console.log(`  block(s) with empty space below their last picture:`)
      for (const b of dead) console.log(`    ${b.tail}px  ${b.el}  ${b.box.w}x${b.box.h}`)
    }
  }

  await page.close()
}

await browser.close()
console.log('\nmeasured.')
