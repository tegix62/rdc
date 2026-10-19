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
      /*
        Centred on the pointer unless that would put it off the screen, in
        which case it slides to stay inside the window: so the checks are
        that the pointer is inside it, and that the glass is wholly on screen.
      */
      const vp = page.viewportSize()
      const holds = g && x > g.x && x < g.x + g.width && y > g.y && y < g.y + g.height
      const onScreen = g && g.x >= 0 && g.y >= 0 && g.x + g.width <= vp.width && g.y + g.height <= vp.height
      const mag = await page.locator('[data-loupe-mag]').textContent()
      check(
        `${name}: glass open around the pointer, on screen`,
        Boolean(holds && onScreen),
        g ? `${Math.round(g.width)}x${Math.round(g.height)} at ${Math.round(g.x)},${Math.round(g.y)}` : 'no glass',
      )
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
    /*
      The patches must form a grid: every patch in a row at the same height,
      every patch in a column at the same left, neighbours touching. This is
      the check that would have caught the build deleting position:absolute
      - the patches fell into a diagonal, and every other check still passed.
    */
    const geometry = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('.loupe__tile')].filter((t) => t.style.display !== 'none')
      const box = (t) => t.getBoundingClientRect()
      const bad = []
      for (const a of shown)
        for (const b of shown) {
          if (a === b) continue
          const A = box(a), B = box(b)
          if (a.dataset.y === b.dataset.y && Math.abs(A.top - B.top) > 1) bad.push(`row ${a.dataset.y}`)
          if (a.dataset.x === b.dataset.x && Math.abs(A.left - B.left) > 1) bad.push(`column ${a.dataset.x}`)
          if (a.dataset.y === b.dataset.y && Number(b.dataset.x) - Number(a.dataset.x) === 512 && Math.abs(A.right - B.left) > 1)
            bad.push(`gap ${a.dataset.x}->${b.dataset.x}`)
        }
      return {n: shown.length, bad: [...new Set(bad)]}
    })
    check('the patches form a seamless grid', geometry.n > 0 && geometry.bad.length === 0, `${geometry.n} patches${geometry.bad.length ? ', broken: ' + geometry.bad.slice(0, 4).join(', ') : ''}`)
    // Every shown patch, as the browser has it: what it asked for, where it
    // put it, and what came back. Relative to the glass's own box.
    console.log(
      '  patches at the centre:\n    ' +
        (
          await page.evaluate(() => {
            const gb = document.querySelector('.loupe__glass').getBoundingClientRect()
            return [...document.querySelectorAll('.loupe__tile')]
              .filter((t) => t.style.display !== 'none')
              .map((t) => {
                const b = t.getBoundingClientRect()
                const rect = new URL(t.currentSrc || t.src).searchParams.get('rect')
                return (
                  `data ${t.dataset.x},${t.dataset.y} rect=${rect} natural=${t.naturalWidth}x${t.naturalHeight} ` +
                  `complete=${t.complete} in=${t.classList.contains('is-in')} opacity=${getComputedStyle(t).opacity} ` +
                  `box=(${Math.round(b.left - gb.left)},${Math.round(b.top - gb.top)} ${Math.round(b.width)}x${Math.round(b.height)})`
                )
              })
          })
        ).join('\n    '),
    )
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
/*
  A phone, with real touch: press and hold through the DevTools protocol,
  since Playwright's touchscreen only taps. Reports the magnification the
  glass opens at and whether it sits above the finger and on the screen -
  the phone version had only ever been tested by Chris's own hand.
*/
for (const piece of PIECES) {
  const ctx = await browser.newContext({
    viewport: {width: 390, height: 844},
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/collage/study/${piece}`, {waitUntil: 'load', timeout: 60_000})
  await page.waitForFunction(() => document.querySelector('.loupe__img')?.complete)
  console.log(`\n${piece} on a phone (390x844 @3x, touch)`)
  const env = await page.evaluate(() => ({
    hoverNone: matchMedia('(hover: none)').matches,
    script: [...document.scripts].some((s) => /touchy \? 0\.4/.test(s.textContent ?? '')) ? 'inline, new' : 'bundled or old',
  }))
  console.log(`  (hover: none) = ${env.hoverNone}; magnifier script ${env.script}`)
  const box = await page.locator('.loupe__img').boundingBox()
  await page.evaluate((y) => scrollTo(0, y), box.y - 200)
  await page.waitForTimeout(300)
  const b = await page.locator('.loupe__img').boundingBox()
  const x = b.x + b.width * 0.5
  const y = b.y + b.height * 0.6
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]})
  await page.waitForTimeout(450)
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + 6, y: y + 4}]})
  await page.waitForTimeout(900)
  const g = await page.locator('.loupe__glass').boundingBox().catch(() => null)
  const mag = await page.locator('[data-loupe-mag]').textContent()
  const vp = page.viewportSize()
  check('phone: press and hold opens the glass', Boolean(g), mag || 'no readout')
  if (g) {
    check('phone: the glass sits above the finger', g.y + g.height <= y, `glass bottom ${Math.round(g.y + g.height)}, finger at ${Math.round(y)}`)
    check('phone: the glass is on the screen', g.x >= 0 && g.x + g.width <= vp.width && g.y >= 0, `${Math.round(g.width)}x${Math.round(g.height)} at ${Math.round(g.x)},${Math.round(g.y)}`)
    console.log(`  opens at ${mag}`)
  }
  await page.screenshot({path: `${OUT}/${piece}-phone-hold.png`})
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nThe magnifier behaves as asked.')
process.exit(failures ? 1 : 0)
