/*
  How does Sanity cope with the biggest picture in the dataset?

  Chris, October 2026: "I just loaded a 110MB PNG to Sanity for the grid.
  That's okay to do or nah?" The earlier advice (full-resolution originals
  are fine, visitors never download them) was given for 5-17 MB files. This
  measures the largest image asset on the real CDN:

    - its size, pixel dimensions and megapixels, and which documents use it
    - whether a 4 KB Range request on the original is honoured (the build
      reads that much of every PNG/GIF/WebP to see whether it is animated)
    - the time to first byte and to the last for transformed copies at the
      widths the site asks for (800 and 2000, as WebP) - the FIRST request
      of a size makes Sanity cut it from the original; a repeat is cached
    - whether any of it fails (a size or pixel limit shows up as a 4xx/5xx)

  Downloads only small transformed copies (tens to hundreds of KB) and
  cancels everything else. Usage: node scripts/check-big-asset.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

const query = `*[_type == "sanity.imageAsset"] | order(size desc)[0...4]{
  _id, url, size, mimeType, _createdAt,
  "w": metadata.dimensions.width, "h": metadata.dimensions.height,
  "usedBy": *[references(^._id)]{title, "draft": _id in path("drafts.**")}
}`
const res = await fetch(`https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`)
const assets = (await res.json()).result ?? []

const mb = (b) => `${(b / 1048576).toFixed(1)} MB`
console.log('The four largest images in the dataset:')
for (const a of assets) {
  console.log(`  ${mb(a.size).padStart(9)}  ${a.w}x${a.h} (${((a.w * a.h) / 1e6).toFixed(0)} MP) ${a.mimeType}  ${a._createdAt.slice(0, 10)}  ${a.url.split('/').pop()}`)
  console.log(`            used by: ${a.usedBy.map((d) => `${d.title}${d.draft ? ' (draft)' : ''}`).join(', ') || '(nothing yet)'}`)
}

async function time(url, headers = {}) {
  const t0 = performance.now()
  try {
    const r = await fetch(url, {headers})
    const first = performance.now() - t0
    let bytes = 0
    if (r.status === 206 || !r.ok) await r.body?.cancel()
    else bytes = (await r.arrayBuffer()).byteLength
    return {status: r.status, first, total: performance.now() - t0, bytes, type: r.headers.get('content-type'), range: r.headers.get('content-range')}
  } catch (e) {
    return {status: 0, first: NaN, total: performance.now() - t0, bytes: 0, type: `failed: ${e.cause?.code ?? e.message}`}
  }
}
const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)}ms` : '?')

const big = assets[0]
if (!big) {
  console.log('No image assets found.')
  process.exit(0)
}
console.log(`\nTesting the largest: ${big.url.split('/').pop()} (${mb(big.size)}, ${big.w}x${big.h})\n`)

const ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
const range = await time(big.url, {Range: 'bytes=0-4095', Accept: ACCEPT})
console.log(`Range 0-4095 of the original: ${range.status} ${range.range ?? ''} (the build's animation check; ${range.status === 206 ? 'honoured, costs 4 KB' : 'NOT honoured - each build would read the whole file'})`)

for (const w of [800, 2000, 800, 3200]) {
  const r = await time(`${big.url}?w=${w}&fm=webp&q=80`, {Accept: ACCEPT})
  console.log(`w=${String(w).padEnd(4)} -> ${r.status} ${r.type ?? ''} ${(r.bytes / 1024).toFixed(0)} KB  first byte ${ms(r.first)}, whole ${ms(r.total)}`)
}
console.log('\n(The first request of each width is Sanity cutting it from the original; the second w=800 is the cached repeat.)')
