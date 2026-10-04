/*
  Every image on a page: what it is painted at, what was served, and what
  exists to serve.

  WHY THIS EXISTS

  Chris: the thumbnail on /video looks low res - is it the same problem as
  the Portfolio tiles? "The same problem" is three different problems that
  all look identical, and they need different fixes:

    PROMISE   the file is big enough and a `sizes` attribute too small made
              the browser pick a smaller candidate. Fix the attribute.
    CEILING   the srcset stops below what the slot needs. Raise the cap.
    SOURCE    the upload itself is smaller than the slot. No code change can
              help; it needs a bigger file.

  There is also a fourth on this page specifically: a YouTube facade poster
  falls back to sddefault, which is 640x480 and fixed. Nothing in Sanity
  governs it, so it is reported separately rather than as an undersized
  upload.

  Reading the served width: from the URL's own w= where there is one, and
  from naturalWidth only when the image carries NO srcset. Chromium reports
  naturalWidth divided by the density implied by `sizes` for an image chosen
  from a srcset, which produced a confidently wrong answer earlier in this
  work. The uploaded size comes from the Sanity filename, which carries it.

  READ-ONLY.

  Usage: node scripts/audit-page-resolution.mjs [base-url] [path]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const PATH = process.argv[3] ?? '/video'

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})
await page.goto(`${BASE}${PATH}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
await page.waitForTimeout(2500)
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 200))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(2500)

const imgs = await page.evaluate(() => {
  const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
  const out = []
  for (const img of document.querySelectorAll('img')) {
    const src = img.currentSrc || img.src
    if (!src) continue
    const r = img.getBoundingClientRect()
    if (r.width < 8) continue
    out.push({
      alt: strip(img.getAttribute('alt')) || '(no alt)',
      src,
      hasSrcset: !!img.getAttribute('srcset'),
      sizes: img.getAttribute('sizes'),
      srcsetMax: Math.max(
        0,
        ...(img.getAttribute('srcset') ?? '')
          .split(',')
          .map((p) => Number(p.trim().match(/(\d+)w$/)?.[1] ?? 0)),
      ),
      naturalW: img.naturalWidth,
      cssW: Math.round(r.width),
      cssH: Math.round(r.height),
    })
  }
  return out
})

console.log(`${BASE}${PATH}  (1920 viewport, 2x)\n`)

if (!imgs.length) {
  console.log('  no images found')
  await browser.close()
  process.exit(0)
}

const verdicts = []
for (const i of imgs) {
  const needed = i.cssW * 2
  const askedFor = Number(i.src.match(/[?&]w=(\d+)/)?.[1] ?? 0)
  // Trustworthy only without a srcset; see the header.
  const served = askedFor || (i.hasSrcset ? 0 : i.naturalW)
  const uploaded = Number(i.src.match(/-(\d+)x\d+\.\w+(?:\?|$)/)?.[1] ?? 0)
  const youtube = i.src.includes('i.ytimg.com')

  let verdict = 'ok'
  if (youtube) verdict = 'YOUTUBE POSTER (fixed 640x480, no Sanity image set)'
  else if (uploaded && uploaded < needed) verdict = `SOURCE too small - upload is ${uploaded}px`
  else if (served && served < needed && i.srcsetMax && i.srcsetMax < needed)
    verdict = `CEILING - srcset stops at ${i.srcsetMax}px`
  else if (served && served < needed) verdict = `PROMISE - sizes picked ${served}px`

  verdicts.push({...i, needed, served, uploaded, verdict})
}

console.log('  painted     needed@2x   served    uploaded   image')
for (const v of verdicts) {
  console.log(
    `  ${String(v.cssW + 'x' + v.cssH).padEnd(11)} ${String(v.needed + 'px').padStart(9)}  ` +
      `${String(v.served ? v.served + 'px' : '?').padStart(7)}  ` +
      `${String(v.uploaded ? v.uploaded + 'px' : '-').padStart(9)}   ${v.alt.slice(0, 40)}`,
  )
  if (v.verdict !== 'ok') console.log(`              -> ${v.verdict}`)
  if (v.sizes) console.log(`                 sizes: ${v.sizes}`)
}

const bad = verdicts.filter((v) => v.verdict !== 'ok')
console.log(`\n  ${bad.length} of ${verdicts.length} image(s) are short of what the slot needs at 2x.`)
if (bad.length) {
  const byKind = {}
  for (const b of bad) {
    const kind = b.verdict.split(' ')[0]
    byKind[kind] = (byKind[kind] ?? 0) + 1
  }
  for (const [kind, n] of Object.entries(byKind)) console.log(`    ${kind}: ${n}`)
  console.log(
    `\n  SOURCE and YOUTUBE need a different file, not a code change.` +
      `\n  PROMISE and CEILING are fixable in the template.`,
  )
}

await browser.close()
