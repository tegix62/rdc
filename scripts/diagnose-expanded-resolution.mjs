/*
  What resolution a Portfolio tile is actually served, collapsed and expanded.

  WHY THIS EXISTS

  Chris says tiles look soft once clicked - "my original image had more detail
  than this" - and named Two Point Oh Luna Tee. The grid declares:

    sizes = "(max-width: 48rem) 33vw, 17vw"
    width = 800

  while clicking a tile doubles its width:

    .pf-item.is-expanded { width: calc(var(--pf-col-w) * 2) }

  `sizes` is a promise the author makes about how wide the image WILL be
  displayed; the browser never measures the element. So it resolves 17vw,
  picks the candidate for that, and keeps it when the box doubles. If that is
  what is happening, every expanded tile is an upscale - and the srcset's 800px
  ceiling caps how much could be fixed by sizes alone.

  Three separate things can each cost detail, and they need different fixes,
  so this reports all three rather than one verdict:

    1. UPSCALE     rendered CSS width vs the file's natural width
    2. DPR         a 2x screen needs twice the CSS width in real pixels
    3. CEILING     what the uploaded asset holds vs the largest srcset offer

  Measured at 1x and 2x device pixel ratio, because a retina screen is where
  Chris is looking and it doubles the shortfall.

  Usage: node scripts/diagnose-expanded-resolution.mjs [base-url] [slug-or-title]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const WANTED = (process.argv[3] ?? 'Luna Tee').toLowerCase()
const URL = `${BASE}/portfolio`

const clean = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')

const browser = await chromium.launch()

for (const dpr of [1, 2]) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: dpr})
  await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
  await page.waitForTimeout(2500)

  console.log(`\n=== device pixel ratio ${dpr}x ===`)

  // Collapsed: the state every tile is in before a click.
  const before = await page.evaluate((wanted) => {
    const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
    const out = []
    for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
      const img = el.querySelector('img')
      if (!img) continue
      const alt = strip(img.getAttribute('alt'))
      if (wanted && !alt.toLowerCase().includes(wanted)) continue
      out.push({
        alt,
        cssW: Math.round(img.getBoundingClientRect().width),
        naturalW: img.naturalWidth,
        currentSrc: img.currentSrc,
        sizes: img.getAttribute('sizes'),
        srcset: img.getAttribute('srcset'),
      })
    }
    return out
  }, WANTED)

  if (!before.length) {
    console.log(`  no tile matching "${WANTED}" - is the title right?`)
    await page.close()
    continue
  }

  for (const t of before) {
    console.log(`\n  ${t.alt}`)
    console.log(`    sizes attribute   ${t.sizes}`)
    const offers = (t.srcset ?? '')
      .split(',')
      .map((s) => s.trim().split(/\s+/).pop())
      .filter(Boolean)
    console.log(`    srcset offers     ${offers.join(', ') || '(none)'}`)
    console.log(`    COLLAPSED         rendered ${t.cssW}px css = ${t.cssW * dpr}px real`)
    console.log(`                      served file is ${t.naturalW}px wide`)
    const ratioC = t.naturalW ? ((t.cssW * dpr) / t.naturalW).toFixed(2) : '?'
    console.log(`                      ${ratioC}x upscale${Number(ratioC) > 1.05 ? '  <- soft already' : ''}`)
    console.log(`    url               ${t.currentSrc.replace(/^https:\/\/cdn\.sanity\.io\/images\/[^/]+\/[^/]+\//, '')}`)
  }

  // Now click it and let the browser settle - including any chance it takes
  // to pick a larger candidate, which is the thing in question.
  const after = await page.evaluate(async (wanted) => {
    const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
    let target = null
    for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
      const img = el.querySelector('img')
      if (!img) continue
      if (strip(img.getAttribute('alt')).toLowerCase().includes(wanted)) {
        target = el
        break
      }
    }
    if (!target) return null
    target.click()
    await new Promise((r) => setTimeout(r, 2500))
    const img = target.querySelector('img')
    return {
      expanded: target.classList.contains('is-expanded'),
      cssW: Math.round(img.getBoundingClientRect().width),
      naturalW: img.naturalWidth,
      currentSrc: img.currentSrc,
    }
  }, WANTED)

  if (after) {
    console.log(`\n    EXPANDED          ${after.expanded ? 'yes' : 'NO - the click did not expand it'}`)
    console.log(`                      rendered ${after.cssW}px css = ${after.cssW * dpr}px real`)
    console.log(`                      served file is still ${after.naturalW}px wide`)
    const ratio = after.naturalW ? ((after.cssW * dpr) / after.naturalW).toFixed(2) : '?'
    console.log(`                      ${ratio}x upscale${Number(ratio) > 1.05 ? '  <- THIS is the softness' : ''}`)
    console.log(`    url after click   ${after.currentSrc.replace(/^https:\/\/cdn\.sanity\.io\/images\/[^/]+\/[^/]+\//, '')}`)
  }

  await page.close()
}

/*
  The ceiling. The srcset cannot offer more than the upload holds, and the
  filename carries the uploaded dimensions - so this says whether the detail
  Chris remembers is actually in the dataset, or whether the upload itself is
  the limit. Those are opposite conclusions and the fix differs completely.
*/
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})
await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForTimeout(2000)
const refs = await page.evaluate((wanted) => {
  const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
  const out = []
  for (const img of document.querySelectorAll('.pf-grid .pf-item img')) {
    const alt = strip(img.getAttribute('alt'))
    if (wanted && !alt.toLowerCase().includes(wanted)) continue
    out.push({alt, src: img.currentSrc})
  }
  return out
}, WANTED)

console.log('\n=== what the upload actually holds ===')
for (const r of refs) {
  // Sanity filenames carry the uploaded dimensions: <hash>-WIDTHxHEIGHT.ext
  const m = r.src.match(/-(\d+)x(\d+)\.\w+/)
  console.log(`  ${r.alt}`)
  console.log(`    uploaded ${m ? `${m[1]}x${m[2]}` : '(could not read from the filename)'}`)
}

await browser.close()
