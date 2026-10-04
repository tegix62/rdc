/*
  Which sizes of each YouTube poster actually exist.

  WHY THIS EXISTS

  The facade falls back to sddefault (640x480) with a comment explaining the
  choice: maxresdefault only exists for videos uploaded at 1080p or above and
  404s for the rest, and a broken image is worse than a soft one.

  That reasoning is about the video's UPLOAD resolution. Chris points out the
  thing it misses: he sets custom thumbnails on YouTube, and a custom
  thumbnail is uploaded at 1280x720 regardless of the video. So maxresdefault
  may well exist for these, and the fallback is being conservative about a
  risk that does not apply.

  "May well" is not a basis for changing anything, so this asks. Every
  YouTube poster on the site, every size variant, with what comes back.

  A 404 is not the only failure to watch for: YouTube answers a missing
  maxresdefault with a 404, but historically has also served a 120x90 grey
  placeholder for some missing variants. So this records the DIMENSIONS, not
  just the status - a 200 that is 120x90 is a miss wearing a success.

  READ-ONLY.

  Usage: node scripts/probe-youtube-posters.mjs [base-url] [path,path,...]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const PATHS = (process.argv[3] ?? '/video,/').split(',')
const VARIANTS = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault']

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1920, height: 1080}})

const ids = new Set()
for (const p of PATHS) {
  try {
    await page.goto(`${BASE}${p}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  } catch {
    console.log(`  ${p}: could not load`)
    continue
  }
  await page.waitForTimeout(1500)
  const found = await page.evaluate(() => {
    const out = []
    // Posters in use, plus any embed URL on the page, so a video whose
    // poster is already set in Studio is still reported - knowing its
    // maxresdefault exists is what makes the fallback safe to change.
    for (const img of document.querySelectorAll('img')) {
      const m = (img.currentSrc || img.src || '').match(/i\.ytimg\.com\/vi\/([\w-]+)\//)
      if (m) out.push(m[1])
    }
    for (const el of document.querySelectorAll('[data-embed], iframe, a')) {
      const raw = el.getAttribute('data-embed') || el.getAttribute('src') || el.getAttribute('href') || ''
      const m = raw.match(/youtube\.com\/embed\/([\w-]+)/)
      if (m) out.push(m[1])
    }
    return out
  })
  for (const id of found) ids.add(id)
}

if (!ids.size) {
  console.log('No YouTube videos found on those pages.')
  await browser.close()
  process.exit(0)
}

console.log(`${ids.size} YouTube video(s)\n`)

let maxresOk = 0
for (const id of ids) {
  console.log(`  ${id}`)
  for (const v of VARIANTS) {
    const url = `https://i.ytimg.com/vi/${id}/${v}.jpg`
    const dims = await page.evaluate(
      (u) =>
        new Promise((resolve) => {
          const i = new Image()
          i.onload = () => resolve({w: i.naturalWidth, h: i.naturalHeight})
          i.onerror = () => resolve(null)
          i.src = u
        }),
      url,
    )
    if (!dims) {
      console.log(`    ${v.padEnd(15)} MISSING`)
      continue
    }
    // The grey placeholder YouTube serves for some absent variants.
    const placeholder = dims.w <= 120 && dims.h <= 90
    console.log(
      `    ${v.padEnd(15)} ${dims.w}x${dims.h}${placeholder ? '  <- placeholder, treat as missing' : ''}`,
    )
    if (v === 'maxresdefault' && !placeholder && dims.w >= 1280) maxresOk += 1
  }
}

console.log(
  `\n  maxresdefault exists for ${maxresOk} of ${ids.size} video(s).` +
    (maxresOk === ids.size
      ? '\n  All of them - so preferring it costs nothing and doubles the poster width.'
      : '\n  Not all - so it has to be probed per video, not assumed.'),
)

await browser.close()
