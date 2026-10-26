/*
  Are the site's pictures sharp? Chris: "Images don't seem so sharp on the
  site". For every picture in view in each portfolio view, on a retina
  desktop and a phone, compares three numbers:

    need     the pixels the screen shows it across - its rendered width
             times the screen's device pixel ratio
    got      the pixels the file the browser chose actually has
    upload   the pixels the original in Sanity has (from its address)

  got < need means the browser is stretching the picture - soft, whatever
  the format. If got is also about the upload, the upload is the limit; if
  the upload is bigger, the page asked for too small a file (srcset/sizes).
  Also reports the format and quality the files came back as.

  Downloads no pictures in the browser: test browsers are answered with
  blanks made at exactly the size asked for, so the sizes measure true.
  A few real files are fetched once at the end, for their format.

  Usage: node scripts/diagnose-sharpness.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const VIEWS = ['/portfolio?view=all', '/portfolio', '/portfolio?view=type', '/portfolio/up-close']
const SCREENS = [
  ['desktop 2x', {viewport: {width: 1440, height: 900}, deviceScaleFactor: 2}],
  ['phone 3x', {viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true}],
]
const browser = await chromium.launch()
for (const [screen, opts] of SCREENS) {
  for (const view of VIEWS) {
    const page = await browser.newPage(opts)
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('pf-demo-shown', '1')
      } catch {}
    })
    await page.goto(BASE + view, {waitUntil: 'networkidle', timeout: 90_000}).catch(() => {})
    await page.waitForTimeout(2500)
    const rows = await page.evaluate(() => {
      const dpr = devicePixelRatio
      return Array.from(document.images)
        .filter((img) => {
          const r = img.getBoundingClientRect()
          return r.width > 40 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && img.complete && img.naturalWidth > 0
        })
        .map((img) => {
          const r = img.getBoundingClientRect()
          const src = img.currentSrc || img.src
          const q = new URL(src, location.href).searchParams
          const up = src.match(/-(\d+)x(\d+)\.[a-z0-9]+(?:\?|$)/i)
          // The picture's own box: an image drawn whole inside its element
          // (object-fit: contain) shows at the smaller of the two scales.
          const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
          const shownW = img.naturalWidth * Math.min(scale, Infinity)
          return {
            need: Math.round(Math.min(r.width, shownW > 0 ? shownW : r.width) * dpr),
            // The FILE's pixels: what was asked for (w), never more than the
            // upload. Not naturalWidth - for a srcset picture the browser
            // reports that already divided by the density it chose.
            got: Math.min(Number(q.get('w')) || Infinity, up ? Number(up[1]) : Infinity, Number(q.get('w')) || up ? Infinity : img.naturalWidth),
            upload: up ? Number(up[1]) : null,
            w: q.get('w'),
            q: q.get('q'),
            sizes: img.sizes,
            title: (img.closest('[aria-label]')?.getAttribute('aria-label') ?? img.alt ?? '').slice(0, 40),
          }
        })
    })
    const soft = rows.filter((r) => r.got < r.need * 0.9)
    const byPage = soft.filter((r) => r.upload && r.upload > r.got * 1.15)
    const byUpload = soft.filter((r) => !r.upload || r.upload <= r.got * 1.15)
    console.log(`\n=== ${screen}  ${view}: ${rows.length} pictures in view`)
    console.log(`  sharp enough: ${rows.length - soft.length}; stretched: ${soft.length} - ${byPage.length} because the page asked for too small a file, ${byUpload.length} because the upload is that small`)
    for (const r of soft.slice(0, 12)) {
      console.log(`    ${r.title.padEnd(40)} needs ${r.need}px, got ${r.got}px (asked w=${r.w}, q=${r.q}), upload ${r.upload ?? '?'}px, sizes="${r.sizes}"`)
    }
    await page.close()
  }
}
await browser.close()

/*
  What the files come back as, for a few pictures: the route's format,
  quality and weight. Fetched here in Node, outside the test browser, whose
  picture requests are answered with blanks (scripts/lib/test-images-off.mjs).
*/
const html = await (await fetch(`${BASE}/portfolio`)).text()
const srcs = [...html.matchAll(/\ssrc="(\/img\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')).slice(0, 4)
for (const src of srcs) {
  const r = await fetch(BASE + src, {headers: {accept: 'image/avif,image/webp,image/*;q=0.8'}})
  const kb = Math.round((await r.arrayBuffer()).byteLength / 1024)
  console.log(`format: ${r.headers.get('content-type')} ${kb} KB  ${src.slice(0, 120)}`)
}
