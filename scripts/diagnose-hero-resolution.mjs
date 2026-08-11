/*
  Answers "why does the case study hero look soft on desktop, and is it the
  source or the site?" with a number per project instead of an opinion.

  THE MECHANISM, WHICH IS CERTAIN FROM THE CODE

  The hero is `<Img width={2400} sizes="100vw">` inside
  `.work-hero img { width: 100%; max-height: 80vh; object-fit: cover }`.

    - `sizes="100vw"` correctly tells the browser the image spans the viewport.
    - The browser multiplies that by the display's DPR. A 1512-CSS-px laptop at
      2x needs 3024 real pixels.
    - buildSrcSet caps every candidate at the file's own width (cappedWidth), so
      the CDN is never asked to upscale - which is right, and it also means the
      largest thing on offer IS the source.

  So on any 2x display, a source narrower than ~2x the viewport gets stretched,
  and stretching is what reads as soft and artifacted. Nothing in the pipeline is
  degrading the image below its source; the LAYOUT is asking for more pixels than
  the source has. Those are different problems with different fixes, which is why
  this measures rather than guesses.

  WHAT IT PRINTS

  For every case study, the main image's intrinsic width against what a full
  bleed hero needs at 1x, 1.5x and 2x, and the resulting scale factor. Anything
  above 1.0 is being upscaled by that much.

  Dimensions come from the asset reference (`image-<id>-<w>x<h>-<ext>`), so this
  needs no image downloads - just one GROQ query against the public read API.

  Usage: node scripts/diagnose-hero-resolution.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

// Common desktop widths. The middle one is a 14" MacBook Pro, which is the most
// likely thing Chris is looking at, and it is 2x.
const VIEWPORTS = [
  {label: '1280 @1x', css: 1280, dpr: 1},
  {label: '1512 @2x (14" laptop)', css: 1512, dpr: 2},
  {label: '1920 @1x', css: 1920, dpr: 1},
  {label: '1920 @2x', css: 1920, dpr: 2},
]

const dimsOf = (ref) => {
  const m = typeof ref === 'string' && ref.match(/-(\d+)x(\d+)-[a-z0-9]+$/i)
  return m ? {w: Number(m[1]), h: Number(m[2])} : null
}

const query = encodeURIComponent(`*[_type == "caseStudy" && pageType == "Case Study"]{
  title,
  "slug": slug.current,
  "mainRef": mainImage.asset._ref,
  "mainNoRecompress": mainImage.noRecompress,
  "mainHotspot": defined(mainImage.hotspot),
  "thumbRef": thumbnail.asset._ref
} | order(title asc)`)

const res = await fetch(
  `https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${query}`,
)
if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
const studies = (await res.json()).result

console.log(`# Case study hero resolution\n`)
console.log(`${studies.length} case studies. The hero renders full-bleed at 100vw.\n`)

const rows = []
for (const s of studies) {
  const ref = s.mainRef ?? s.thumbRef
  const d = dimsOf(ref)
  rows.push({
    title: s.title ?? '(untitled)',
    slug: s.slug,
    which: s.mainRef ? 'mainImage' : s.thumbRef ? 'thumbnail (no main image)' : 'NONE',
    w: d?.w ?? null,
    h: d?.h ?? null,
    passThrough: s.mainNoRecompress === true,
    hotspot: s.mainHotspot === true,
  })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('project', 34) + pad('source', 12) + pad('field', 28) + 'hotspot')
console.log('-'.repeat(84))
for (const r of rows) {
  console.log(
    pad(r.title.slice(0, 33), 34) +
      pad(r.w ? `${r.w}x${r.h}` : '—', 12) +
      pad(r.which + (r.passThrough ? ' [as-uploaded]' : ''), 28) +
      (r.hotspot ? 'set' : 'NOT SET'),
  )
}

console.log(`\n## Upscale factor at the hero's full-bleed width\n`)
console.log(`1.0 = pixel-perfect. 2.0 = every pixel doubled, which is what reads`)
console.log(`as soft. Below 1.0 the source has pixels to spare.\n`)

console.log(pad('project', 34) + VIEWPORTS.map((v) => pad(v.label, 22)).join(''))
console.log('-'.repeat(34 + VIEWPORTS.length * 22))
const worst = new Map()
for (const r of rows) {
  if (!r.w) continue
  const cells = VIEWPORTS.map((v) => {
    const need = v.css * v.dpr
    const factor = need / r.w
    worst.set(v.label, Math.max(worst.get(v.label) ?? 0, factor))
    return pad(`${factor.toFixed(2)}x`, 22)
  })
  console.log(pad(r.title.slice(0, 33), 34) + cells.join(''))
}

console.log(`\n## What each source could fill at 1:1\n`)
console.log(`The widest this image can be displayed while staying pixel-perfect.\n`)
for (const r of rows) {
  if (!r.w) continue
  console.log(`  ${pad(r.title.slice(0, 33), 34)} ${pad(`${r.w}px @1x`, 14)} ${r.w / 2}px @2x`)
}

const short2x = rows.filter((r) => r.w && r.w < 1512 * 2).length
console.log(
  `\n${short2x}/${rows.filter((r) => r.w).length} sources are narrower than a 14" laptop needs at 2x (3024px).`,
)
console.log(`${rows.filter((r) => !r.hotspot).length} have no hotspot set, so a CSS crop keeps the centre.`)
