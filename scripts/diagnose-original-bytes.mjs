/*
  Why does a 200x200 image weigh 620 KB?

  The animated-sources audit reports several assets that make no physical
  sense. Taking one row verbatim:

    image-7e5b5a8908e617eb9222679575e28e2ca2b28309-200x200-webp
      original 620 KB, bytes start ff d8 ff db, "unrecognised magic"

  620 KB across 200x200 pixels is 15.5 bytes per pixel. An uncompressed RGBA
  bitmap is 4. No still image can be four times larger than its own raw
  bitmap, so at least one of the three claims in that row - the dimensions,
  the byte count, or "this is a JPEG" - is describing something other than the
  file that was uploaded.

  The suspect is the request, not the file. src/lib/animated.ts probes with
  Node's fetch and sets no Accept header, so the CDN sees `Accept: * / *`.
  This project has already been caught by exactly that once: an audit measured
  a hero at 79 KB for a URL browsers were downloading at 10,704 KB, because
  `auto=format` is content-negotiated and a request without an Accept header
  describes a response no visitor ever receives.

  If Sanity content-negotiates the bare asset URL too, then the probe is not
  reading the uploaded file at all - it is reading a re-encode. That would
  explain every part of the row at once: JPEG magic on a `-webp` reference,
  a size unrelated to the stated dimensions, and the "not animated" verdict
  the site then acts on by sending an animated source through the transform
  pipeline. Which is where /portfolio's 7.6 MB comes from.

  So: fetch the same URLs several ways and compare. If the bytes differ by
  Accept header, the probe is measuring the wrong thing and the fix is one
  header. If they are identical, the hypothesis is wrong, the files really are
  that big, and the fix is Chris re-exporting them - a completely different
  conclusion, which is why this measures instead of assuming.

  Runs in CI: the sandbox has no egress to cdn.sanity.io.

  Usage: node scripts/diagnose-original-bytes.mjs [--out DIR]
*/
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'

const outAt = process.argv.indexOf('--out')
const OUT = outAt > -1 ? process.argv[outAt + 1] : 'diagnosis'
await mkdir(OUT, {recursive: true})

const PROJECT = '8337vjtf'
const DATASET = 'production'

/*
  The assets the audit flags as impossible, plus two controls.

  Controls matter here. If every asset changes with the Accept header the
  finding is about the CDN in general; if only these change, it is about these
  files. Without a control that distinction cannot be made.
*/
const SUBJECTS = [
  ['suspect', 'image-7e5b5a8908e617eb9222679575e28e2ca2b28309-200x200-webp'],
  ['suspect', 'image-75ab95863646aab988c9dbf92556ee598104f2f6-300x300-webp'],
  ['suspect', 'image-eac1d7b4f8b51c0534691201664d20bada17e6d5-400x400-webp'],
  ['suspect', 'image-7462c14747d2e307d83019703a6f8eac7b6002d0-400x400-webp'],
  ['suspect', 'image-49b7b1379bc5b7a6da1d54cc6cd221477bd820a3-800x800-webp'],
  // Detected animated, handled correctly today - the shape a working case has.
  ['control-animated', 'image-78917e3ea67c530958a88539bc302062c6ae733c-918x1148-gif'],
  // An ordinary still whose numbers are unremarkable.
  ['control-still', 'image-b3834b3ffbcf2783a337743475cd2041ff0aceb9-1080x1080-png'],
]

/*
  Chrome sends the first of these. Node's fetch sends the second unless told
  otherwise, and that is what animated.ts does today.
*/
const ACCEPTS = {
  browser: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'node-default': '*/*',
  'image-only': 'image/*',
}

function originalUrl(ref) {
  const [, id, dims, ext] = ref.match(/^image-([a-zA-Z0-9_-]+)-(\d+x\d+)-([a-z0-9]+)$/)
  return `https://cdn.sanity.io/images/${PROJECT}/${DATASET}/${id}-${dims}.${ext}`
}

const hex = (bytes, n = 12) =>
  [...bytes.slice(0, n)].map((b) => b.toString(16).padStart(2, '0')).join(' ')

function magicOf(bytes) {
  const a = (s, l) => String.fromCharCode(...bytes.slice(s, s + l))
  if (a(0, 3) === 'GIF') return 'GIF'
  if (a(0, 4) === 'RIFF' && a(8, 4) === 'WEBP') return 'WEBP'
  if (bytes[0] === 0x89 && a(1, 3) === 'PNG') return 'PNG'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'JPEG'
  return 'unknown'
}

/*
  Animation markers, looked for across the whole downloaded body rather than a
  header window - the point here is to establish ground truth, not to be fast.
  GIF: the NETSCAPE looping extension. WebP: a VP8X animation flag or an ANIM
  chunk. PNG: an acTL chunk.
*/
function animationEvidence(bytes) {
  const text = Buffer.from(bytes).toString('latin1')
  const found = []
  if (text.includes('NETSCAPE')) found.push('NETSCAPE')
  if (text.includes('ANIM')) found.push('ANIM')
  if (text.includes('acTL')) found.push('acTL')
  const magic = magicOf(bytes)
  if (magic === 'WEBP' && String.fromCharCode(...bytes.slice(12, 16)) === 'VP8X') {
    if ((bytes[20] & 0x02) !== 0) found.push('VP8X-anim-flag')
  }
  return found
}

async function measure(url, accept, {range = false} = {}) {
  const headers = {Accept: accept}
  if (range) headers.Range = 'bytes=0-4095'
  try {
    const res = await fetch(url, {headers})
    const buf = new Uint8Array(await res.arrayBuffer())
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      vary: res.headers.get('vary'),
      received: buf.length,
      magic: magicOf(buf),
      first12: hex(buf),
      animation: range ? null : animationEvidence(buf),
    }
  } catch (err) {
    return {error: String(err).slice(0, 160)}
  }
}

const results = []

for (const [kind, ref] of SUBJECTS) {
  const url = originalUrl(ref)
  const dims = ref.match(/-(\d+x\d+)-/)[1]
  const [w, h] = dims.split('x').map(Number)

  console.log(`\n${kind}  ${ref}`)
  console.log(`  ${url}`)

  const byAccept = {}
  for (const [name, accept] of Object.entries(ACCEPTS)) {
    const full = await measure(url, accept)
    byAccept[name] = full
    if (full.error) {
      console.log(`  ${name.padEnd(13)} ERROR ${full.error}`)
      continue
    }
    const kb = Math.round(full.received / 1024)
    const bpp = (full.received / (w * h)).toFixed(1)
    console.log(
      `  ${name.padEnd(13)} ${String(full.status).padEnd(4)} ${String(full.contentType).padEnd(12)} ` +
        `${String(kb + ' KB').padEnd(9)} ${bpp} bytes/px  ${full.magic.padEnd(7)} ` +
        `${full.animation?.length ? full.animation.join('+') : '-'}`,
    )
  }

  /*
    And what the build's own probe sees: a ranged request with Node's default
    Accept. If this row disagrees with the browser row above, animated.ts is
    deciding from bytes no visitor is served.
  */
  const asProbed = await measure(url, ACCEPTS['node-default'], {range: true})
  byAccept['as-animated.ts-probes'] = asProbed
  console.log(
    `  ${'probe (ranged)'.padEnd(13)} ${String(asProbed.status).padEnd(4)} ` +
      `${String(asProbed.contentType).padEnd(12)} ${String(asProbed.received + ' B').padEnd(9)} ` +
      `${''.padEnd(11)} ${String(asProbed.magic).padEnd(7)} ${asProbed.first12}`,
  )

  const sizes = Object.entries(byAccept)
    .filter(([k, v]) => k !== 'as-animated.ts-probes' && !v.error)
    .map(([, v]) => v.received)
  const varies = new Set(sizes).size > 1
  const magics = new Set(
    Object.entries(byAccept)
      .filter(([, v]) => !v.error)
      .map(([, v]) => v.magic),
  )

  console.log(
    `  => ${varies ? 'VARIES BY ACCEPT HEADER' : 'identical across Accept headers'}` +
      `${magics.size > 1 ? `, and the format changes too (${[...magics].join('/')})` : ''}`,
  )

  results.push({kind, ref, dims, url, byAccept, variesByAccept: varies, magics: [...magics]})
}

/* ------------------------------------------------------------------------ */

const suspects = results.filter((r) => r.kind === 'suspect')
const anyVaries = suspects.some((r) => r.variesByAccept)

console.log('\n' + '='.repeat(72))
if (anyVaries) {
  console.log('The probe is reading a re-encode, not the uploaded file.')
  console.log('Fix: send a browser Accept header from animated.ts (and anywhere')
  console.log('else that measures bytes), then re-run the animated audit.')
} else {
  console.log('The bytes do not change with the Accept header, so the probe is')
  console.log('reading the real file and these sources genuinely are that large.')
  console.log('That makes it a re-export job rather than a code fix - and it means')
  console.log('the "unrecognised magic" note is the real story: references ending')
  console.log('-webp whose contents are JPEG.')
}
console.log('='.repeat(72))

await writeFile(path.join(OUT, 'original-bytes.json'), JSON.stringify(results, null, 2))
console.log(`\nwrote ${OUT}/original-bytes.json`)
