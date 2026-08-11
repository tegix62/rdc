/*
  Is Sanity's compression worth having, at the sizes this site actually uses?

  Chris compresses his own exports and has made "serve exactly as uploaded" the
  default. Before that stands, it should be measured rather than assumed - the
  existing animated audit compares the original against a w=800 transform and
  reports the CDN winning by better than 2:1, but w=800 is not a number this
  site asks for very often. A portfolio tile renders around 240px wide, so the
  browser picks the 320 or 480 entry from the srcset. Comparing against 800
  flatters the CDN on big images and slanders it on small ones.

  So this measures at the widths the site really requests, and separates the two
  things the transform does, because they are not the same question:

    DOWNSCALE   a 2250px file sent to a 480px slot. Nothing Chris can do in
                Photoshop beats not sending 2000 surplus pixels.
    RE-ENCODE   a 480px file sent to a 480px slot. This is the real test of
                whether Sanity's AVIF/WebP beats his own compression.

  Every request carries a browser Accept header. Without one the CDN
  content-negotiates down to a JPEG fallback and every number describes a
  response no visitor receives - the mistake that made the animation probe read
  a 1,348 KB animation as a 15 KB still.

  Usage: node scripts/diagnose-compression.mjs [--out DIR]
*/
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createClient} from '@sanity/client'

const outAt = process.argv.indexOf('--out')
const OUT = outAt > -1 ? process.argv[outAt + 1] : 'compression'
await mkdir(OUT, {recursive: true})

const PROJECT = '8337vjtf'
const DATASET = 'production'

const sanity = createClient({
  projectId: PROJECT,
  dataset: DATASET,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const BROWSER_ACCEPT =
  'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

/* Every image asset the dataset references, however deeply nested. */
const docs = await sanity.fetch(`*[_type in ["caseStudy","blogPost","page","siteSettings"]]`)

const refs = new Map()
const walk = (node) => {
  if (Array.isArray(node)) return node.forEach(walk)
  if (!node || typeof node !== 'object') return
  const ref = node?.asset?._ref
  if (typeof ref === 'string' && ref.startsWith('image-')) {
    if (!refs.has(ref)) refs.set(ref, node.noRecompress === true)
  }
  for (const v of Object.values(node)) walk(v)
}
walk(docs)

const parse = (ref) => {
  const m = ref.match(/^image-([a-zA-Z0-9_-]+)-(\d+)x(\d+)-([a-z0-9]+)$/i)
  return m ? {id: m[1], w: +m[2], h: +m[3], ext: m[4]} : null
}
const originalUrl = (a) =>
  `https://cdn.sanity.io/images/${PROJECT}/${DATASET}/${a.id}-${a.w}x${a.h}.${a.ext}`

async function bytes(url) {
  try {
    const res = await fetch(url, {method: 'HEAD', headers: {Accept: BROWSER_ACCEPT}})
    return {
      n: Number(res.headers.get('content-length') ?? 0),
      type: (res.headers.get('content-type') ?? '?').replace('image/', ''),
    }
  } catch {
    return {n: 0, type: 'error'}
  }
}

console.log(`${refs.size} distinct image assets referenced\n`)

/*
  The widths the site actually asks for. SRCSET_WIDTHS in lib/image.ts is
  320/480/640/800/1080/1440/1920/2400, always clamped to the file's own width -
  and a portfolio tile at 17vw on a 1440 screen is ~245px, so 320 and 480 are
  the entries a phone and a laptop really pick.
*/
const TEST_WIDTHS = [320, 480, 800]

const rows = []
let i = 0
for (const [ref, noRecompress] of refs) {
  const a = parse(ref)
  if (!a) continue
  i += 1
  if (i % 20 === 0) console.log(`  ...${i}/${refs.size}`)

  const orig = await bytes(originalUrl(a))
  if (!orig.n) continue

  const at = {}
  for (const w of TEST_WIDTHS) {
    // Never ask for more than the file has - cappedWidth() does this in the
    // site, so measuring an upscale would describe a request never made.
    const ask = Math.min(w, a.w)
    const t = await bytes(`${originalUrl(a)}?w=${ask}&q=80&auto=format`)
    at[w] = {ask, ...t}
  }
  rows.push({ref, ...a, noRecompress, orig, at})
}

const kb = (n) => `${Math.round(n / 1024)} KB`

/*
  Split by whether the transform gets to downscale, because they answer
  different questions and averaging them together hides both.
*/
const report = []
for (const w of TEST_WIDTHS) {
  const downscaled = rows.filter((r) => r.w > w * 1.2)
  const native = rows.filter((r) => r.w <= w * 1.2)

  const sum = (list, pick) => list.reduce((n, r) => n + pick(r), 0)

  const dOrig = sum(downscaled, (r) => r.orig.n)
  const dNew = sum(downscaled, (r) => r.at[w].n)
  const nOrig = sum(native, (r) => r.orig.n)
  const nNew = sum(native, (r) => r.at[w].n)

  const nativeWins = native.filter((r) => r.at[w].n < r.orig.n).length

  report.push({width: w, downscaled: downscaled.length, native: native.length,
               dOrig, dNew, nOrig, nNew, nativeWins})

  console.log(`\n${'='.repeat(66)}\nAt w=${w}\n${'='.repeat(66)}`)
  console.log(`  DOWNSCALE  ${downscaled.length} files bigger than this slot`)
  if (downscaled.length) {
    console.log(`             ${kb(dOrig)} as uploaded -> ${kb(dNew)} transformed ` +
      `(${(dNew / dOrig).toFixed(2)}x)`)
  }
  console.log(`  RE-ENCODE  ${native.length} files already at or near this size`)
  if (native.length) {
    console.log(`             ${kb(nOrig)} as uploaded -> ${kb(nNew)} transformed ` +
      `(${(nNew / nOrig).toFixed(2)}x)`)
    console.log(`             the CDN is smaller on ${nativeWins} of ${native.length}`)
  }
}

/* The decision this is for. */
const w = 480
const native = rows.filter((r) => r.w <= w * 1.2)
const nOrig = native.reduce((n, r) => n + r.orig.n, 0)
const nNew = native.reduce((n, r) => n + r.at[w].n, 0)
const ratio = nOrig ? nNew / nOrig : 1

console.log(`\n${'='.repeat(66)}`)
console.log('VERDICT, for files already near the size they are shown at -')
console.log('which is the only case where "serve exactly as uploaded" costs')
console.log('anything, because a pass-through file cannot be downscaled:\n')
if (ratio > 0.95) {
  console.log(`  Sanity's re-encode is ${ratio.toFixed(2)}x - it is NOT beating Chris's`)
  console.log('  own compression at these sizes. Pass-through by default is right.')
} else {
  console.log(`  Sanity's re-encode is ${ratio.toFixed(2)}x - meaningfully smaller.`)
  console.log('  Pass-through by default costs real bytes on these files.')
}
console.log('\nBut note the downscale column above: pass-through also means no')
console.log('srcset, so any file uploaded larger than its slot ships at full')
console.log('size to every phone. That cost is separate and usually bigger.')
console.log('='.repeat(66))

await writeFile(path.join(OUT, 'compression.json'), JSON.stringify({report, rows}, null, 2))
console.log(`\nwrote ${OUT}/compression.json`)
