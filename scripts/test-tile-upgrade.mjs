/*
  Is the click-to-sharpen swap seamless?

  "It looks fine" is not a measurement, and the two ways this can be bad are
  both invisible in a screenshot:

    A BLANK   assigning srcset can drop the painted frame while the new file
              decodes, so the tile flashes empty mid-open. img.complete going
              false at any point during the swap is that flash.

    A SHIFT   a different candidate can come back at a different aspect, and
              the tile jumps after it has already opened. Measured as the
              box's own aspect before and after.

  And the point of the whole exercise - whether the picture actually got
  sharper - needs the FILE width, not img.naturalWidth. Chromium reports
  naturalWidth divided by the density implied by `sizes`, which is what made
  an earlier run of this investigation report a 3.24x upscale that was not
  real. So the width is read from the chosen URL's own w= parameter.

  Three paths are exercised, because they have different code:
    click        the mechanism, and the only one touch devices get
    hover+click  the optimisation, which should make the swap already done
    no upgrade   a pass-through tile, which must be left alone

  Usage: node scripts/test-tile-upgrade.mjs [base-url] [match]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const WANTED = (process.argv[3] ?? 'Luna Tee').toLowerCase()

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const widthOf = (url) => Number(url?.match(/[?&]w=(\d+)/)?.[1] ?? 0)

const browser = await chromium.launch()

/* ---------- the click path ---------- */
{
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
  await page.waitForTimeout(3000)

  const result = await page.evaluate(async (wanted) => {
    const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
    let item = null
    for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
      const img = el.querySelector('img')
      if (img && strip(img.getAttribute('alt')).toLowerCase().includes(wanted)) {
        item = el
        break
      }
    }
    if (!item) return null
    const img = item.querySelector('img')

    const before = {
      currentSrc: img.currentSrc,
      hasUpgrade: !!img.dataset.upgradeSrcset,
      sizes: img.getAttribute('sizes'),
      aspect: img.getBoundingClientRect().width / Math.max(img.getBoundingClientRect().height, 1),
    }

    // Watch for a dropped frame across the whole swap, not just at the end.
    let everIncomplete = false
    const t0 = performance.now()
    item.click()
    let changedAt = null
    for (let i = 0; i < 160; i++) {
      if (!img.complete) everIncomplete = true
      if (changedAt === null && img.currentSrc !== before.currentSrc && img.complete) {
        changedAt = performance.now() - t0
      }
      if (changedAt !== null && i > 20) break
      await new Promise((r) => requestAnimationFrame(r))
    }
    await new Promise((r) => setTimeout(r, 600))

    const r = img.getBoundingClientRect()
    return {
      before,
      after: {
        currentSrc: img.currentSrc,
        sizes: img.getAttribute('sizes'),
        upgraded: img.dataset.upgraded,
        complete: img.complete,
        aspect: r.width / Math.max(r.height, 1),
        cssW: Math.round(r.width),
      },
      everIncomplete,
      changedAt,
    }
  }, WANTED)

  if (!result) {
    console.log(`no tile matching "${WANTED}"`)
    await browser.close()
    process.exit(2)
  }

  const wBefore = widthOf(result.before.currentSrc)
  const wAfter = widthOf(result.after.currentSrc)

  console.log('CLICK')
  console.log(`  file before      w=${wBefore}`)
  console.log(`  file after       w=${wAfter}`)
  console.log(`  sizes before     ${result.before.sizes}`)
  console.log(`  sizes after      ${result.after.sizes}`)
  console.log(`  tile is now      ${result.after.cssW}px css = ${result.after.cssW * 2}px real`)
  console.log(`  swap completed   ${result.changedAt === null ? '(no change seen)' : `${Math.round(result.changedAt)}ms after the click`}`)

  check('the tile offered an upgrade', result.before.hasUpgrade)
  check('a bigger file is now in use', wAfter > wBefore, `${wBefore} -> ${wAfter}`)
  check(
    'the file now covers the expanded tile',
    wAfter >= result.after.cssW * 2,
    `needs ${result.after.cssW * 2}px, has ${wAfter}px`,
  )
  check('sizes was updated alongside srcset', result.after.sizes !== result.before.sizes)
  /*
    `complete` is NOT a blank.

    The first version of this failed here and the failure was the check's,
    not the code's: assigning srcset starts a load, so img.complete goes
    false - but the HTML spec keeps the current frame painted until the
    pending one has decoded, so nothing disappears. Reporting that as "the
    picture blanked" would have sent me rewriting working code.

    So complete is reported as information, and the verdict comes from the
    pixels: screenshots of the tile across the swap window, compared by PNG
    byte size against the frame before the click. A blank or near-uniform
    frame compresses to a small fraction of a photograph's size, so a
    collapse in that number is the gap a visitor would see. Crude, but it
    measures the thing asked about rather than something correlated with it.
  */
  console.log(`  img.complete went false at some point: ${result.everIncomplete} (expected; not a blank)`)
  check(
    'no aspect change, so the tile did not jump',
    Math.abs(result.before.aspect - result.after.aspect) < 0.02,
    `${result.before.aspect.toFixed(3)} -> ${result.after.aspect.toFixed(3)}`,
  )
  /* ---------- did a visitor actually see a gap? ---------- */
  {
    const page2 = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})
    await page2.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    await page2.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
    await page2.waitForTimeout(3000)

    const handle = await page2.evaluateHandle((wanted) => {
      const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
      for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
        const img = el.querySelector('img')
        if (img && strip(img.getAttribute('alt')).toLowerCase().includes(wanted)) return el
      }
      return null
    }, WANTED)
    const tile = handle.asElement()

    if (tile) {
      /*
      BYTES PER PIXEL, NOT BYTES.

      The first version compared PNG byte size against the frame before the
      click, and on the re-packing grid it reported a 9 KB frame as a blank.
      It is not necessarily one: the grid now re-flows on click, so the tile
      is being moved and resized while these are captured, and a screenshot
      taken mid-move is of a SMALLER BOX. A small picture and an empty one
      are both small files.

      Density tells them apart. A blank or flat frame costs very little per
      pixel however large it is; a photograph costs a lot however small the
      crop. So each frame is measured against its own area, and the verdict
      is whether any frame's density collapsed against the baseline's.
    */
      const shot = async () => {
        const box = await tile.boundingBox()
        const bytes = (await tile.screenshot()).length
        const px = Math.max(1, (box?.width ?? 1) * (box?.height ?? 1))
        return {bytes, px, density: bytes / px, w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0)}
      }

      const baseline = await shot()
      // Click without hovering first, so this is the cold path - the one a
      // touch device and a fast click both take.
      await tile.evaluate((n) => n.click())
      const frames = []
      for (let i = 0; i < 10; i++) {
        try {
          frames.push(await shot())
        } catch {
          break
        }
      }

      const leanest = frames.reduce((a, b) => (b.density < a.density ? b : a), frames[0])
      const ratio = baseline.density ? leanest.density / baseline.density : 1
      console.log(`\n  PIXELS DURING THE SWAP (cold click, no hover)`)
      console.log(
        `    before the click   ${baseline.w}x${baseline.h}, ${(baseline.bytes / 1024).toFixed(0)} KB ` +
          `(${(baseline.density * 1000).toFixed(1)} bytes per 1000px)`,
      )
      console.log(
        `    leanest frame      ${leanest.w}x${leanest.h}, ${(leanest.bytes / 1024).toFixed(0)} KB ` +
          `(${(leanest.density * 1000).toFixed(1)} bytes per 1000px)`,
      )
      console.log(`    density ratio      ${(ratio * 100).toFixed(0)}% of the frame before the click`)
      check(
        'the tile never went blank for the viewer',
        ratio > 0.4,
        `a blank frame costs almost nothing per pixel; this held ${(ratio * 100).toFixed(0)}% of its density`,
      )
    }
    await page2.close()
  }

  await page.close()
}

/* ---------- the hover path ---------- */
{
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
  await page.waitForTimeout(3000)

  const handle = await page.evaluateHandle((wanted) => {
    const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
    for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
      const img = el.querySelector('img')
      if (img && strip(img.getAttribute('alt')).toLowerCase().includes(wanted)) return el
    }
    return null
  }, WANTED)

  const el = handle.asElement()
  if (el) {
    await el.hover()
    await page.waitForTimeout(1200)
    const afterHover = await el.evaluate((node) => {
      const img = node.querySelector('img')
      return {upgraded: img.dataset.upgraded, currentSrc: img.currentSrc, complete: img.complete}
    })
    console.log('\nHOVER (before any click)')
    console.log(`  marked upgraded  ${afterHover.upgraded ?? '(no)'}`)
    console.log(`  file in use      w=${widthOf(afterHover.currentSrc)}`)
    check('hovering alone pre-loads the larger file', afterHover.upgraded === '1')
    check('the pre-loaded file finished decoding before any click', afterHover.complete)
  }
  await page.close()
}

/* ---------- a tile with nothing to upgrade ---------- */
{
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2})
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('.pf-grid .pf-item', {state: 'visible', timeout: 30_000}).catch(() => {})
  await page.waitForTimeout(3000)

  const noUpgrade = await page.evaluate(async () => {
    const strip = (s) => String(s ?? '').replace(/[​-‏⁠-⁤﻿]/g, '')
    for (const el of document.querySelectorAll('.pf-grid .pf-item')) {
      const img = el.querySelector('img')
      if (!img || img.dataset.upgradeSrcset) continue
      const src = img.currentSrc
      el.click()
      await new Promise((r) => setTimeout(r, 800))
      return {alt: strip(img.getAttribute('alt')), same: img.currentSrc === src, marked: img.dataset.upgraded}
    }
    return null
  })

  console.log('\nA TILE WITH NO UPGRADE TO OFFER')
  if (noUpgrade) {
    console.log(`  ${noUpgrade.alt}`)
    check('its source is left alone', noUpgrade.same)
    check('it is marked so it is not re-checked', noUpgrade.marked === 'none')
  } else {
    console.log('  every tile offers an upgrade; nothing to check')
  }
  await page.close()
}

await browser.close()
console.log(failures === 0 ? '\nThe swap is seamless.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
