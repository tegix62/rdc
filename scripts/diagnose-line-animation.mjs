/*
  Do the constellation lines actually animate?

  WHY THIS EXISTS

  Chris has said three times that he cannot see the animation. Twice I
  reported it fixed on the strength of tests that assert the lines EXIST
  and how long the draw takes - neither of which says anything about
  whether a stroke grows. The one property he is describing has never been
  measured.

  The mechanism is a CSS transition on stroke-dashoffset from the line's
  length down to zero. So that is what gets sampled: the computed value
  over the frames after a draw. A series that starts near the full length
  and falls to zero is an animation. A series that is zero from the first
  sample is a line that simply appeared.

  Also reports the things that would silently disable or break it:

    - prefers-reduced-motion, which skips the animation branch entirely and
      which Playwright defaults to "no-preference" so no test here would
      ever have caught it
    - the viewBox-to-pixel scale, because stroke-dasharray is in user units
      and `vector-effect: non-scaling-stroke` makes the dash pattern resolve
      in screen space instead. If those two disagree, the dash is the wrong
      length and the line is either fully drawn from the start or never
      drawn at all - both of which look like "no animation"

  READ-ONLY. Reports, asserts nothing.

  Usage: node scripts/diagnose-line-animation.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')

const browser = await chromium.launch()

/*
  Sample one line's dash state across several frames. Taken with rAF rather
  than setTimeout so the samples land on real frame boundaries, which is
  where a transition is actually interpolated.
*/
const SAMPLER = `
  window.__sampleDash = (frames) =>
    new Promise((resolve) => {
      const out = [];
      let n = 0;
      const tick = () => {
        const line = document.querySelector('.pf-links line');
        if (!line) {
          out.push({t: Math.round(performance.now()), missing: true});
        } else {
          const cs = getComputedStyle(line);
          out.push({
            t: Math.round(performance.now()),
            offset: Math.round(parseFloat(cs.strokeDashoffset) || 0),
            array: cs.strokeDashArray,
            transition: cs.transitionProperty + ' ' + cs.transitionDuration + ' ' + cs.transitionDelay,
          });
        }
        if (++n < frames) requestAnimationFrame(tick);
        else resolve(out);
      };
      requestAnimationFrame(tick);
    });
`

async function look(label, reducedMotion) {
  const page = await browser.newPage({
    viewport: {width: 1600, height: 1000},
    reducedMotion,
  })
  await page.addInitScript(SAMPLER)
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(3500)

  console.log(`\n=== ${label} (prefers-reduced-motion: ${reducedMotion}) ===`)

  const env = await page.evaluate(() => {
    const svgOf = () => document.querySelector('.pf-grid .pf-links')
    return {
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      finePointer: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
      hasSvgNow: !!svgOf(),
    }
  })
  console.log(`  reduced-motion matches: ${env.reduced} | fine pointer: ${env.finePointer}`)

  /* Mark a tile from a project big enough to light up. */
  const href = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.pf-grid .pf-item')]
    const hrefOf = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href') ?? null
    const sizes = {}
    for (const el of tiles) {
      const k = hrefOf(el)
      if (k) sizes[k] = (sizes[k] ?? 0) + 1
    }
    const t = tiles.find((el) => hrefOf(el) && sizes[hrefOf(el)] >= 4)
    if (!t) return null
    t.setAttribute('data-probe', '')
    return hrefOf(t)
  })
  if (!href) {
    console.log('  (no gatherable project on the page)')
    await page.close()
    return
  }

  /* ---------- the hover draw ---------- */
  await page.hover('[data-probe]')
  const hoverSeries = await page.evaluate(() => window.__sampleDash(10))
  console.log(`  HOVER, ${href} - dashoffset over 10 frames:`)
  console.log(`    ${hoverSeries.map((s) => (s.missing ? 'none' : s.offset)).join(' -> ')}`)
  const h0 = hoverSeries.find((s) => !s.missing)
  if (h0) {
    console.log(`    dasharray "${h0.array}"`)
    console.log(`    transition "${h0.transition}"`)
  }

  /*
    The geometry that decides whether the dash is the right length.

    stroke-dasharray is set in user units from the line's own length, but
    non-scaling-stroke resolves the dash in screen space. If the viewBox and
    the rendered box differ, the dash no longer matches the line.
  */
  const geom = await page.evaluate(() => {
    const svg = document.querySelector('.pf-grid .pf-links')
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const vb = svg.getAttribute('viewBox')
    const line = svg.querySelector('line')
    const len = line
      ? Math.hypot(
          Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')),
          Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')),
        )
      : null
    return {
      viewBox: vb,
      rendered: `${Math.round(r.width)}x${Math.round(r.height)}`,
      firstLineUserLength: len ? Math.round(len) : null,
      renderedLineLength: line ? Math.round(line.getTotalLength?.() ?? 0) : null,
      vectorEffect: line ? getComputedStyle(line).vectorEffect : null,
    }
  })
  if (geom) {
    console.log(`    viewBox "${geom.viewBox}" rendered ${geom.rendered}`)
    console.log(
      `    first line: ${geom.firstLineUserLength} user units, getTotalLength ${geom.renderedLineLength}, vector-effect ${geom.vectorEffect}`,
    )
  }

  /* ---------- the committed draw, with gather switched off ---------- */
  await page.mouse.move(5, 5)
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const btn = document.querySelector('#pf-gather')
    if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click()
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => document.querySelector('[data-probe]')?.click())
  /* Two frames for the layout chain the click handler waits on. */
  await page.waitForTimeout(80)
  const clickSeries = await page.evaluate(() => window.__sampleDash(14))
  console.log(`  CLICK with gather off - dashoffset over 14 frames:`)
  console.log(`    ${clickSeries.map((s) => (s.missing ? 'none' : s.offset)).join(' -> ')}`)
  const c0 = clickSeries.find((s) => !s.missing)
  if (c0) console.log(`    transition "${c0.transition}"`)

  await page.close()
}

await look('AS A VISITOR WOULD SEE IT', 'no-preference')
await look('WITH REDUCE MOTION ON', 'reduce')

await browser.close()
