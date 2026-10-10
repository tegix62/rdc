/*
  How the case-study bar behaves at phone width.

  WHY THIS EXISTS

  On a phone the Portfolio grid is four columns, and the bar that reads as a
  quiet marker on a desktop tile becomes a navy block with a word broken
  across two lines: "ADELAN TE...", "DUMPS TAT, A...". Two separate faults,
  and guessing which one to fix is how a tweak turns into two tweaks:

    - overflow-wrap: anywhere breaks mid-word rather than between words. It
      was added so a single long word could not overflow, and at this width
      it fires on every title.
    - the tile is too narrow for a project title at all, in which case no
      wrapping rule saves it and the text has to go.

  So: the tile's real width, the bar's height against the image's, and
  whether the longest title could fit on one line if it were allowed to.
  That last number is the one that decides between fixing the wrap and
  dropping the text.

  READ-ONLY.

  Usage: node scripts/measure-study-bar.mjs [base-url] [viewport-width]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const WIDTH = Number(process.argv[3] ?? 390)

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: {width: WIDTH, height: 844},
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})
await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
await page.waitForTimeout(2500)

const data = await page.evaluate(() => {
  const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '').trim()
  const out = []
  for (const el of document.querySelectorAll('.pf-item--study')) {
    const jump = el.querySelector('.pf-item__jump')
    const label = el.querySelector('.pf-item__jump-label')
    const img = el.querySelector('img')
    if (!jump || !label) continue

    const cs = getComputedStyle(label)
    /*
      Measure the text unwrapped, in the same font, to learn whether it COULD
      fit on one line. scrollWidth of the clamped box reports the wrapped
      width, which is the thing being questioned rather than evidence about it.
    */
    const probe = document.createElement('span')
    probe.textContent = label.textContent
    probe.style.cssText =
      `position:absolute;visibility:hidden;white-space:nowrap;` +
      `font:${cs.font};letter-spacing:${cs.letterSpacing};text-transform:${cs.textTransform}`
    document.body.appendChild(probe)
    const oneLine = probe.getBoundingClientRect().width
    probe.remove()

    const jr = jump.getBoundingClientRect()
    const lr = label.getBoundingClientRect()
    const tr = el.getBoundingClientRect()
    out.push({
      text: strip(label.textContent),
      /*
        How far the mark hangs off its own tile, each side, in px. The
        `strips` ratio below asks whether the mark is wide RELATIVE to the
        tile, which a mark that has escaped the tile entirely also answers
        badly - but these two numbers say the thing directly, and they are
        what a person sees: navy painted over the neighbouring pictures.
      */
      spillLeft: Math.round(Math.max(0, tr.left - jr.left)),
      spillRight: Math.round(Math.max(0, jr.right - tr.right)),
      tileW: Math.round(tr.width),
      imgH: Math.round(img?.getBoundingClientRect().height ?? 0),
      barW: Math.round(jr.width),
      barH: Math.round(jr.height),
      labelW: Math.round(lr.width),
      oneLine: Math.round(oneLine),
      barPos: getComputedStyle(jump).position,
      barW2: Math.round(jr.width),
      clamped: label.scrollHeight > label.clientHeight + 1,
      fontSize: cs.fontSize,
    })
  }
  return out
})

await browser.close()

console.log(`${BASE}/portfolio at ${WIDTH}px, 3x\n`)
if (!data.length) {
  console.log('  no case study tiles found')
  process.exit(1)
}

console.log(`  tile ${data[0].tileW}px wide, label font ${data[0].fontSize}\n`)
console.log('  mark      image   label box   needs 1 line   clipped   title')
for (const d of data) {
  console.log(
    `  ${String(d.barW2 + 'x' + d.barH).padStart(8)}  ${String(d.imgH + 'px').padStart(5)}  ` +
      `${String(d.labelW + 'px').padStart(9)}  ${String(d.oneLine + 'px').padStart(12)}  ` +
      `${(d.clamped ? 'yes' : 'no').padStart(7)}   ${d.text}`,
  )
}

/*
  The verdict, so this stops being a report and starts being a check.

  Below 40rem the bar is a corner mark: no label, absolutely positioned, so
  it adds no height. Both numbers are asserted because fixing one and not the
  other was the obvious half-job here - hiding the text would have left a
  full-width navy strip under five tiles, and slimming the strip would have
  left the broken words in it.
*/
const labelled = data.filter((d) => d.labelW > 0)
/*
  Out of flow is the assertion, not a height ratio.

  The first version of this compared the mark's height to the image's and
  failed at 24% - which measured the wrong thing twice over. The mark is a
  fixed-size chip, so that ratio says more about how short the tile is than
  about the mark: on Two Point Oh's 55px image the same 24px chip scores 44%
  and on a tall one it scores 15%. And a chip laid OVER the picture adds no
  layout height at all, which is the property that actually mattered.

  So: absolutely positioned, and a chip rather than a strip - both
  dimensions small and similar. Plus a floor, because a 24px target is mean
  for a thumb.
*/
const inFlow = data.filter((d) => d.barPos !== 'absolute')
const strips = data.filter((d) => d.barW2 > d.tileW * 0.6)
const tiny = data.filter((d) => d.barH < 30 || d.barW2 < 26)
const spilling = data.filter((d) => d.spillLeft > 1 || d.spillRight > 1)
let failed = false

/*
  Checked at every width, and checked first - because this is the one that
  fired in the wild. The chip rule hid the title but not the piece count
  that was added to the bar later, and with width:auto against right:0 the
  nowrap count grew leftwards out of the tile and across four of its
  neighbours. A mark may never paint outside the thing it marks.
*/
if (spilling.length) {
  for (const d of spilling) {
    console.log(`\n  "${d.text}" hangs ${d.spillLeft}px off the left and ${d.spillRight}px off the right of its tile.`)
  }
  failed = true
}

if (WIDTH <= 640) {
  if (labelled.length) {
    console.log(`\n  ${labelled.length} tile(s) still render the title at this width.`)
    failed = true
  }
  if (inFlow.length) {
    console.log(`\n  ${inFlow.length} mark(s) are in flow, so they add height to the tile.`)
    failed = true
  }
  if (strips.length) {
    console.log(`\n  ${strips.length} mark(s) span most of the tile - that is a strip, not a chip.`)
    failed = true
  }
  if (tiny.length) {
    console.log(`\n  ${tiny.length} mark(s) are too small to tap comfortably.`)
    failed = true
  }
}

const widest = Math.max(...data.map((d) => d.oneLine))
const room = data[0].labelW
const tallest = Math.max(...data.map((d) => d.barH))
const img = Math.max(...data.map((d) => d.imgH))

console.log(`\n  the longest title needs ${widest}px on one line; the label box is ${room}px.`)
console.log(
  widest > room * 2
    ? `  Over twice the space available - no wrapping rule fixes this, the text has to go.`
    : widest > room
      ? `  Fits in two lines if words are allowed to stay whole.`
      : `  Fits on one line already; the wrap rule is breaking it for no reason.`,
)
console.log(`  the bar is ${tallest}px against a ${img}px image - ${Math.round((tallest / img) * 100)}% of the picture.`)

if (failed) {
  console.log('\nThe phone treatment is not applied as intended.')
  process.exit(1)
}
