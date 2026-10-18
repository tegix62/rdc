/*
  The collage magnifier, driven by a real mouse in a real browser.

  For each collage page under /collage/study/: hover the middle of the
  piece and check the glass opens, sits under the pointer, and fills with
  sharp patches - and how long that takes, which is the number the whole
  idea depends on. Then a click (closer), a move (new patches), and leaving
  the picture (glass gone). Screenshots of the glass open are kept for a
  look by eye.

  Usage: node scripts/test-loupe.mjs [base-url] [out-dir] [piece,piece]
*/
import {chromium} from 'playwright'
import {mkdirSync} from 'node:fs'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const OUT = process.argv[3] ?? 'loupe-shots'
const PIECES = (process.argv[4] ?? 'magnesium-mildness').split(',')
mkdirSync(OUT, {recursive: true})

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()
for (const piece of PIECES) {
  for (const [label, w, h, dpr] of [['desktop', 1440, 900, 2], ['laptop', 1280, 800, 1]]) {
    const page = await browser.newPage({viewport: {width: w, height: h}, deviceScaleFactor: dpr})
    const res = await page.goto(`${BASE}/collage/study/${piece}`, {waitUntil: 'load', timeout: 60_000})
    console.log(`\n${piece} at ${w}x${h} @${dpr}x`)
    check('the page exists', res?.status() === 200, `HTTP ${res?.status()}`)
    await page.waitForSelector('.loupe__img', {timeout: 15_000})
    await page.waitForFunction(() => document.querySelector('.loupe__img')?.complete)

    const box = await page.locator('.loupe__img').boundingBox()
    check('the whole square is in the window', box && box.y + box.height <= h + 1, `${Math.round(box.width)}px square, bottom at ${Math.round(box.y + box.height)}`)

    // Hover a spot and time how long until every patch under the glass is in.
    const spot = async (fx, fy, name) => {
      const x = box.x + box.width * fx
      const y = box.y + box.height * fy
      const t0 = Date.now()
      await page.mouse.move(x, y, {steps: 4})
      const settled = await page
        .waitForFunction(
          () => {
            const g = document.querySelector('.loupe__glass')
            if (!g || g.hidden) return false
            const gb = g.getBoundingClientRect()
            const under = [...document.querySelectorAll('.loupe__tile')].filter((t) => {
              if (t.style.display === 'none') return false
              const b = t.getBoundingClientRect()
              return b.right > gb.left && b.left < gb.right && b.bottom > gb.top && b.top < gb.bottom
            })
            return under.length > 0 && under.every((t) => t.classList.contains('is-in')) ? under.length : false
          },
          null,
          {timeout: 15_000},
        )
        .then((h) => h.jsonValue())
        .catch(() => 0)
      const ms = Date.now() - t0
      if (!settled) {
        // Which patch is holding the glass soft, and in what state.
        const stuck = await page.evaluate(() => {
          const gb = document.querySelector('.loupe__glass').getBoundingClientRect()
          return [...document.querySelectorAll('.loupe__tile')]
            .filter((t) => t.style.display !== 'none')
            .map((t) => {
              const b = t.getBoundingClientRect()
              const over = b.right > gb.left && b.left < gb.right && b.bottom > gb.top && b.top < gb.bottom
              return `${t.dataset.x},${t.dataset.y} over=${over} in=${t.classList.contains('is-in')} complete=${t.complete} natural=${t.naturalWidth}`
            })
        })
        console.log('    patches near the glass:\n      ' + stuck.join('\n      '))
      }
      const g = await page.locator('.loupe__glass').boundingBox()
      const centred = g && Math.abs(g.x + g.width / 2 - x) < 3 && Math.abs(g.y + g.height / 2 - y) < 3
      const mag = await page.locator('[data-loupe-mag]').textContent()
      check(`${name}: glass open, centred on the pointer`, Boolean(centred))
      check(`${name}: sharp under the glass`, settled > 0, `${settled} patch(es) in ${ms} ms, ${mag}`)
      return ms
    }

    // Each patch fades in over 180 ms once it arrives; a picture taken the
    // moment the last one lands shows them half-transparent, which reads as
    // patches that do not match. Wait out the fade before the camera.
    const settle = () => page.waitForTimeout(400)
    await spot(0.5, 0.5, 'centre')
    await settle()
    await page.screenshot({path: `${OUT}/${piece}-${label}-centre.png`})
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.waitForTimeout(150)
    await spot(0.5, 0.5, 'click: closer')
    await settle()
    await page.screenshot({path: `${OUT}/${piece}-${label}-closer.png`})
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await spot(0.22, 0.3, 'moved')
    await settle()
    await page.screenshot({path: `${OUT}/${piece}-${label}-moved.png`})
    await spot(0.8, 0.78, 'moved again')

    await page.mouse.move(box.x - 40, box.y + 20)
    await page.waitForTimeout(150)
    check('leaving the picture puts the glass away', await page.locator('.loupe__glass').isHidden())

    // The cost of the page before anyone touches it.
    const bytes = await page.evaluate(() =>
      performance.getEntriesByType('resource').reduce(
        (acc, r) => {
          if (r.name.includes('rect=')) acc.patches += r.transferSize || r.encodedBodySize || 0
          else acc.page += r.transferSize || r.encodedBodySize || 0
          return acc
        },
        {page: 0, patches: 0},
      ),
    )
    console.log(`  bytes: page ${(bytes.page / 1024).toFixed(0)} KB, patches fetched ${(bytes.patches / 1024).toFixed(0)} KB`)
    await page.close()
  }
}
await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nThe magnifier behaves as asked.')
process.exit(failures ? 1 : 0)
