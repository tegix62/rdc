/*
  Read-only diagnostic for the animation weight problem.

  Three things need settling with facts rather than inference:

  1. For each animated asset: what does the ORIGINAL weigh, and what does the
     CDN return for the transformed URL the site actually requests? The
     homepage measured 10,721 KB for one image whose source appears to be under
     1 MB, and portfolio got *heavier* after animations were switched to
     pass-through - so the transform is sometimes smaller and sometimes
     catastrophically larger, and guessing which is not good enough.

  2. Does the transform PRESERVE ANIMATION? If asking the CDN for
     `?w=400&auto=format&q=80` on a GIF returns a single static frame, then the
     smaller "before" numbers were smaller because the animations were not
     playing at all - which makes the heavier pass-through correct rather than
     a regression. This is the single most important unknown.

  3. Which asset is the homepage's 10.7 MB request, and why did the animated
     detector not catch it?

  Writes nothing. Run: npm run diagnose:animations   (from studio/)
*/
import {createClient} from '@sanity/client'

const client = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const kb = (n) => `${(n / 1024).toFixed(0)}`.padStart(7)

// Same header check the site and the converter use, so a disagreement here is
// meaningful rather than a difference in method.
const webpAnimated = (buf) =>
  buf.length >= 32 &&
  buf.toString('ascii', 0, 4) === 'RIFF' &&
  buf.toString('ascii', 8, 4) === 'WEBP' &&
  buf.toString('ascii', 12, 4) === 'VP8X' &&
  ((buf[20] & 0x02) !== 0 || buf.toString('ascii', 0, 64).includes('ANIM'))

// A GIF is animated when it contains more than one image descriptor (0x2C).
// Crude but adequate: one frame means the animation is gone.
const gifFrames = (buf) => {
  let count = 0
  for (let i = 0; i < buf.length - 1; i += 1) {
    if (buf[i] === 0x2c) count += 1
  }
  return count
}

const describe = (buf) => {
  if (buf.toString('ascii', 0, 3) === 'GIF') {
    const frames = gifFrames(buf)
    return `gif  ${frames > 1 ? `ANIMATED (~${frames} frames)` : 'STATIC (1 frame)'}`
  }
  if (buf.toString('ascii', 8, 4) === 'WEBP') {
    return `webp ${webpAnimated(buf) ? 'ANIMATED' : 'STATIC'}`
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg STATIC (jpeg cannot animate)'
  if (buf.toString('ascii', 1, 4) === 'PNG') return 'png  STATIC'
  return 'unknown format'
}

async function fetchAll(url) {
  const res = await fetch(url)
  if (!res.ok) return {bytes: 0, buf: Buffer.alloc(0), status: res.status}
  const buf = Buffer.from(await res.arrayBuffer())
  return {bytes: buf.length, buf, status: res.status}
}

const assets = await client.fetch(
  `*[_type == "sanity.imageAsset" && extension in ["gif", "webp"]]{
     _id, url, extension, size,
     "w": metadata.dimensions.width, "h": metadata.dimensions.height
   } | order(size desc)`,
)

console.log(`${assets.length} gif/webp assets, largest first\n`)
console.log(
  'origKB'.padStart(8) +
    'xformKB'.padStart(9) +
    '  dims'.padEnd(14) +
    '  original            -> transformed',
)
console.log('-'.repeat(96))

let flagged = []

for (const a of assets) {
  const orig = await fetchAll(a.url)
  if (!orig.bytes) {
    console.log(`  ! ${a._id} download failed (${orig.status})`)
    continue
  }

  // Exactly what the site requests for a full-bleed image.
  const xformUrl = `${a.url}?w=800&auto=format&q=80`
  const xform = await fetchAll(xformUrl)

  const origDesc = describe(orig.buf)
  const xformDesc = xform.bytes ? describe(xform.buf) : `FAILED ${xform.status}`
  const dims = `${a.w}x${a.h}`

  console.log(
    kb(orig.bytes) + kb(xform.bytes) + `  ${dims}`.padEnd(14) + `  ${origDesc} -> ${xformDesc}`,
  )

  const origAnimated = origDesc.includes('ANIMATED')
  const xformAnimated = xformDesc.includes('ANIMATED')

  if (origAnimated && !xformAnimated) {
    flagged.push(`${a._id}: transform DROPS the animation (${dims})`)
  }
  if (xform.bytes > orig.bytes * 2) {
    flagged.push(
      `${a._id}: transform is ${(xform.bytes / orig.bytes).toFixed(1)}x the original ` +
        `(${(orig.bytes / 1024).toFixed(0)} KB -> ${(xform.bytes / 1024).toFixed(0)} KB)`,
    )
  }
}

console.log('\n=== findings ===')
if (flagged.length) {
  for (const f of flagged) console.log(`  - ${f}`)
} else {
  console.log('  nothing anomalous')
}

// The homepage's heavy request, identified directly.
console.log('\n=== homepage 10.7 MB suspect ===')
const suspect = await client.fetch(
  `*[_type == "sanity.imageAsset" && _id match "*49b7b1379bc5b7a6da1d54cc6cd221477bd820a3*"][0]{
     _id, url, extension, size, "w": metadata.dimensions.width, "h": metadata.dimensions.height
   }`,
)
if (!suspect) {
  console.log('  asset 49b7b137... not found as an image asset')
} else {
  const orig = await fetchAll(suspect.url)
  const xform = await fetchAll(`${suspect.url}?w=800&auto=format&q=80`)
  console.log(`  ${suspect._id}`)
  console.log(`  dims ${suspect.w}x${suspect.h}, extension ${suspect.extension}`)
  console.log(`  original    ${(orig.bytes / 1024).toFixed(0)} KB  ${describe(orig.buf)}`)
  console.log(
    `  transformed ${(xform.bytes / 1024).toFixed(0)} KB  ${xform.bytes ? describe(xform.buf) : 'failed'}`,
  )
}
