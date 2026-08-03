/*
  Finds horizontal overflow and names the elements causing it.

  "You can scroll sideways" is easy to see and hard to attribute - the culprit
  is usually one element a few pixels wider than the viewport, and it can be
  anywhere on the page. This measures documentElement.scrollWidth against
  clientWidth, then walks the DOM for every element whose right edge sits past
  the viewport, reporting a usable selector and how far over it goes.

  Runs at phone, tablet and desktop widths, and with print mode both off and on,
  because the question that prompted it was whether print mode introduced this.

  Usage: node scripts/test-overflow.mjs [baseUrl]
*/
import {chromium} from 'playwright'

const BASE = process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev'
const PATHS = ['/', '/portfolio', '/about', '/video']
const WIDTHS = [
  {name: 'phone', width: 390, height: 844},
  {name: 'tablet', width: 768, height: 1024},
  {name: 'desktop', width: 1440, height: 900},
]

const findOverflow = async (page) =>
  page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth
    const scrollWidth = document.documentElement.scrollWidth
    const offenders = []

    const describe = (el) => {
      const id = el.id ? `#${el.id}` : ''
      const cls = typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : ''
      return `${el.tagName.toLowerCase()}${id}${cls}`
    }

    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      // Only elements that actually extend past the right edge, and by enough
      // to matter rather than a sub-pixel rounding artefact.
      const over = Math.round(r.right - docWidth)
      if (over > 1) {
        const style = getComputedStyle(el)
        offenders.push({
          selector: describe(el),
          over,
          width: Math.round(r.width),
          cssWidth: style.width,
          position: style.position,
          marginLeft: style.marginLeft,
        })
      }
    }

    // The outermost offenders are the cause; their children are usually just
    // carried along, so report the widest few rather than all of them.
    offenders.sort((a, b) => b.over - a.over)
    return {docWidth, scrollWidth, overflow: scrollWidth - docWidth, offenders: offenders.slice(0, 6)}
  })

const browser = await chromium.launch()
let problems = 0

for (const vp of WIDTHS) {
  console.log(`\n${'='.repeat(70)}\n${vp.name} — ${vp.width}px\n${'='.repeat(70)}`)

  for (const path of PATHS) {
    const context = await browser.newContext({viewport: {width: vp.width, height: vp.height}})
    const page = await context.newPage()
    await page.goto(BASE + path, {waitUntil: 'load', timeout: 60000})
    await page.waitForTimeout(1500)

    const off = await findOverflow(page)

    // Now switch print mode on and re-measure the same page, which is the
    // only way to say whether it introduced the overflow or merely inherited it.
    await page.evaluate(() => {
      const root = document.documentElement
      root.setAttribute('data-ink', 'blood')
      root.setAttribute('data-ink-grain', 'on')
      root.style.setProperty('--ink-paper', '#e5473c')
      root.style.setProperty('--ink-ink', '#150605')
    })
    await page.waitForTimeout(600)
    const on = await findOverflow(page)

    const flag = off.overflow > 1 || on.overflow > 1 ? 'OVERFLOW' : 'ok'
    if (off.overflow > 1 || on.overflow > 1) problems += 1

    console.log(
      `\n  ${path.padEnd(12)} ${flag}   ink off: ${off.overflow}px over   ink on: ${on.overflow}px over`,
    )

    const worst = off.overflow > 1 ? off : on
    if (worst.overflow > 1) {
      for (const o of worst.offenders) {
        console.log(
          `      +${String(o.over).padStart(4)}px  ${o.selector}` +
            `   [width:${o.cssWidth} pos:${o.position} ml:${o.marginLeft}]`,
        )
      }
      if (on.overflow > off.overflow) {
        console.log(`      note: print mode adds ${on.overflow - off.overflow}px on top`)
      }
    }

    await context.close()
  }
}

console.log(
  problems
    ? `\n\n${problems} page/width combination(s) scroll sideways.`
    : '\n\nNo horizontal overflow anywhere.',
)
await browser.close()
process.exit(problems ? 1 : 0)
