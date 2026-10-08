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
    out.push({
      text: strip(label.textContent),
      tileW: Math.round(el.getBoundingClientRect().width),
      imgH: Math.round(img?.getBoundingClientRect().height ?? 0),
      barW: Math.round(jr.width),
      barH: Math.round(jr.height),
      labelW: Math.round(lr.width),
      oneLine: Math.round(oneLine),
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
console.log('  bar    image   label box   needs 1 line   clipped   title')
for (const d of data) {
  console.log(
    `  ${String(d.barH + 'px').padStart(5)}  ${String(d.imgH + 'px').padStart(5)}  ` +
      `${String(d.labelW + 'px').padStart(9)}  ${String(d.oneLine + 'px').padStart(12)}  ` +
      `${(d.clamped ? 'yes' : 'no').padStart(7)}   ${d.text}`,
  )
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
