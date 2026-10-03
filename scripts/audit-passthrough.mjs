/*
  Every pass-through image, with what it holds against what it shows.

  WHY THIS EXISTS

  "Serve exactly as uploaded" is on by default (initialValue: true in
  studio/schemaTypes/imageFields.ts) because Chris compresses his own files
  and would rather the CDN left them alone. That reasoning is sound and this
  does not argue with it.

  The same note says the other half out loud: a pass-through image gets no
  srcset, so a phone downloads the file a desktop does, and the advice is to
  turn it off for "photography, hero tiles, anything wide and detailed". With
  the switch defaulting to ON, nothing enforces that second half - an image
  gets pass-through by arriving, not by anyone deciding it suits.

  So this is a list to decide from, not a recommendation. Per image: what was
  uploaded, what the page actually paints, what came down the wire, and how
  many times more pixels than needed. A hand-tuned 1200px mark shown at 1100
  is the switch working. A 5000px photograph in a 272px tile is the case the
  original note warned about.

  WHY naturalWidth IS SAFE HERE, having been a trap twice today: Chromium
  reports it divided by the density implied by `sizes`, but only for an image
  chosen from a srcset. A pass-through image is emitted with no srcset at all
  - that is what pass-through means - so there is no correction and the number
  is the file.

  READ-ONLY.

  Usage: node scripts/audit-passthrough.mjs [base-url] [path,path,...]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const PATHS = (process.argv[3] ?? '/portfolio,/,/merchfolio,/collage,/video').split(',')

const kb = (b) => `${(b / 1024).toFixed(0)} KB`
const browser = await chromium.launch()

const rows = []
const seenAsset = new Set()

for (const path of PATHS) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})

  const bytes = new Map()
  page.on('response', async (res) => {
    const u = res.url()
    if (!u.includes('cdn.sanity.io/images')) return
    try {
      bytes.set(u, (await res.body()).length)
    } catch {
      /* redirect or aborted; no body to measure */
    }
  })

  try {
    await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  } catch {
    console.log(`  ${path}: could not load`)
    await page.close()
    continue
  }
  await page.waitForTimeout(2500)
  // Scroll so lazy images below the fold are included; a heavy file does not
  // stop being heavy because it loads a second later.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 200))
    }
  })
  await page.waitForTimeout(2500)

  const imgs = await page.evaluate(() => {
    const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
    const out = []
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src
      if (!src.includes('cdn.sanity.io/images')) continue
      // Pass-through is exactly "no width asked for, and no srcset to choose
      // from". Both, because a URL can lack w= while still being one of
      // several candidates.
      if (/[?&]w=\d+/.test(src)) continue
      if (img.getAttribute('srcset')) continue
      const r = img.getBoundingClientRect()
      out.push({
        alt: strip(img.getAttribute('alt')) || '(no alt)',
        src,
        fileW: img.naturalWidth,
        fileH: img.naturalHeight,
        cssW: Math.round(r.width),
      })
    }
    return out
  })

  for (const i of imgs) {
    // An asset used on two pages is one file to fix, not two.
    const assetId = i.src.split('/').pop()?.split('?')[0] ?? i.src
    if (seenAsset.has(assetId)) continue
    seenAsset.add(assetId)
    rows.push({...i, path, bytes: bytes.get(i.src) ?? null})
  }

  await page.close()
}

await browser.close()

if (!rows.length) {
  console.log('No pass-through images found.')
  process.exit(0)
}

/*
  "Needed" is the painted width times 2, for a retina screen - the case that
  decides whether a file is oversized, since a 1x screen needs half as much
  and would make everything look fine.
*/
for (const r of rows) {
  r.needed = r.cssW * 2
  r.over = r.needed > 0 ? r.fileW / r.needed : 0
}
rows.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))

console.log(`${rows.length} pass-through image(s) across ${PATHS.join(' ')}\n`)
console.log('  bytes     uploaded     painted   needed@2x   over   image')
let total = 0
let wasted = 0
for (const r of rows) {
  total += r.bytes ?? 0
  if (r.over > 1) wasted += (r.bytes ?? 0) * (1 - 1 / r.over)
  const flag = r.over >= 2 ? '  <-' : ''
  console.log(
    `  ${String(r.bytes ? kb(r.bytes) : '?').padStart(8)}  ` +
      `${`${r.fileW}x${r.fileH}`.padEnd(11)}  ` +
      `${String(r.cssW + 'px').padStart(7)}  ` +
      `${String(r.needed + 'px').padStart(9)}  ` +
      `${r.over ? r.over.toFixed(1) + 'x' : '-'}`.padStart(7) +
      `   ${r.alt.slice(0, 44)}${flag}`,
  )
}

console.log(`\n  total ${kb(total)} in pass-through images`)
console.log(`  roughly ${kb(wasted)} of that is pixels nobody sees, even on a retina screen`)

const fine = rows.filter((r) => r.over < 1.5).length
console.log(
  `\n  ${fine} of ${rows.length} are close to the size they are shown at - for those the switch` +
    `\n  is doing its job and there is nothing to change.`,
)
