/*
  Do autoplay clips start when scrolled into view - including sideways?

  WHY THIS IS TESTED BY INSTRUMENTING play() RATHER THAN BY WATCHING

  Playwright's Chromium ships without proprietary codecs, so an H.264 clip
  never decodes there: play() rejects, currentTime stays at zero, and
  `paused` stays true no matter how correct the page is. Asserting "it is
  playing" would fail on every build for a reason that has nothing to do
  with the site.

  So the mechanism is tested instead of the outcome. play() and pause() are
  wrapped before the page loads and every call recorded against its element.
  That answers the real question - does the observer ASK the right clip to
  start at the right moment - and it answers it the same way whether or not
  the runner can decode the file.

  THE CASE THAT ACTUALLY NEEDS CHECKING

  Vertical scroll is the easy half. Chris asked specifically about a media
  row, where clips sit in a strip that scrolls SIDEWAYS inside the page.
  IntersectionObserver is supposed to account for clipping by a scrolling
  ancestor, so a clip pushed out of the strip should report as not
  intersecting even though the strip itself is still on screen. Supposed to
  is why this exists.

  Usage: node scripts/test-video-inview.mjs [base-url] [path,path,...]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PATHS = (process.argv[3] ??
  '/video,/work/dumpstat,/work/two-point-oh,/work/adelante-barbell-club,/work/hug-a-mug').split(',')

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const browser = await chromium.launch()

/*
  Wrapped before any page script runs, and tagged per element so a call can
  be attributed rather than just counted.
*/
const INSTRUMENT = `
  (() => {
    let n = 0;
    window.__vlog = [];
    const tag = (v) => (v.__vid ??= 'v' + (++n));
    for (const name of ['play', 'pause']) {
      const orig = HTMLMediaElement.prototype[name];
      HTMLMediaElement.prototype[name] = function (...args) {
        try { window.__vlog.push({id: tag(this), call: name, at: performance.now()}); } catch {}
        try { return orig.apply(this, args); } catch (e) { return Promise.reject(e); }
      };
    }
  })();
`

let tested = 0

for (const path of PATHS) {
  const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
  await page.addInitScript(INSTRUMENT)
  try {
    await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  } catch {
    await page.close()
    continue
  }
  await page.waitForTimeout(2000)

  const survey = await page.evaluate(() => {
    const vids = [...document.querySelectorAll('video[autoplay]')]
    const scrollerOf = (el) => {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 8) return true
        p = p.parentElement
      }
      return false
    }
    return {
      total: vids.length,
      inStrip: vids.filter(scrollerOf).length,
    }
  })

  if (!survey.total) {
    await page.close()
    continue
  }

  tested += 1
  console.log(`\n${path}  -  ${survey.total} autoplay clip(s), ${survey.inStrip} inside a sideways strip`)

  /* ---------- vertical: a clip far below the fold ---------- */
  const vertical = await page.evaluate(async () => {
    const vids = [...document.querySelectorAll('video[autoplay]')]
    const below = vids.find((v) => v.getBoundingClientRect().top > innerHeight * 1.5)
    if (!below) return null
    const id = (below.__vid ??= 'probe')
    const before = window.__vlog.filter((e) => e.id === below.__vid && e.call === 'play').length
    below.scrollIntoView({block: 'center'})
    await new Promise((r) => setTimeout(r, 1200))
    const after = window.__vlog.filter((e) => e.id === below.__vid && e.call === 'play').length
    return {id, before, after}
  })

  if (vertical) {
    check(
      'a clip below the fold is asked to play once scrolled to',
      vertical.after > vertical.before,
      `play() calls ${vertical.before} -> ${vertical.after}`,
    )
  } else {
    console.log('      (no clip far enough below the fold here)')
  }

  /* ---------- the one Chris asked about: sideways ---------- */
  const sideways = await page.evaluate(async () => {
    const vids = [...document.querySelectorAll('video[autoplay]')]
    const scrollerOf = (el) => {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 8) return p
        p = p.parentElement
      }
      return null
    }
    const first = vids.map((v) => [v, scrollerOf(v)]).find(([, s]) => s)
    if (!first) return null
    const [, strip] = first

    const inStrip = vids.filter((v) => scrollerOf(v) === strip)
    if (inStrip.length < 2) return {tooShort: true, count: inStrip.length}

    // Bring the strip itself into view so vertical position is not the
    // thing being measured.
    strip.scrollIntoView({block: 'center'})
    await new Promise((r) => setTimeout(r, 900))

    const last = inStrip[inStrip.length - 1]
    last.__vid ??= 'tail'
    const before = window.__vlog.filter((e) => e.id === last.__vid && e.call === 'play').length
    const offscreenBefore = (() => {
      const r = last.getBoundingClientRect()
      const s = strip.getBoundingClientRect()
      return r.left >= s.right - 4 || r.right <= s.left + 4
    })()

    strip.scrollTo({left: strip.scrollWidth, behavior: 'instant'})
    await new Promise((r) => setTimeout(r, 1400))
    const after = window.__vlog.filter((e) => e.id === last.__vid && e.call === 'play').length

    return {count: inStrip.length, before, after, offscreenBefore}
  })

  if (!sideways) {
    console.log('      (no sideways strip of clips here)')
  } else if (sideways.tooShort) {
    console.log(`      (strip holds only ${sideways.count} clip - nothing to scroll past)`)
  } else {
    check(
      'the last clip in a sideways strip starts out un-played',
      sideways.before === 0,
      `${sideways.before} play() call(s) before scrolling${sideways.offscreenBefore ? ', and it was clipped out of the strip' : ''}`,
    )
    check(
      'scrolling the strip sideways asks it to play',
      sideways.after > sideways.before,
      `play() calls ${sideways.before} -> ${sideways.after} across ${sideways.count} clips`,
    )
  }

  await page.close()
}

await browser.close()

if (!tested) {
  console.log('\nNo page in the list had an autoplay clip; nothing was tested.')
  process.exit(1)
}
console.log(failures === 0 ? `\nAutoplay follows the viewport on ${tested} page(s).` : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
