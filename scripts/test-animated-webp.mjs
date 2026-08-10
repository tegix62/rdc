/*
  Unit test for the animated-WebP detector in the conversion script.

  WHY THIS EXISTS

  `isAnimatedWebp` read its header fields with Buffer.toString('ascii', 8, 4).
  Node's signature is (encoding, START, END), not (encoding, start, LENGTH), so
  that asks for bytes 8 through 4 - backwards - and returns "". The comparison
  against 'WEBP' therefore failed on every input, and the function answered
  "not animated" for every WebP ever passed to it.

  Nothing noticed for months. The script's only symptom was a silent `continue`,
  so animated WebPs were skipped with no output at all - six of them, including
  the 3,981 KB homepage hero, which is the single heaviest file on the site. The
  eleven GIFs it did process went down a different code path and looked like a
  working script.

  Two of the three checks were wrong and one was right by coincidence: (0, 4)
  means bytes 0 to 4, which is also the first four bytes, so the RIFF check
  passed and made the header look like it was being parsed correctly.

  Byte-level parsing with no test is how that happens. These fixtures are built
  by hand from the WebP container spec, so they assert the offsets rather than
  trusting them.

  Usage: node scripts/test-animated-webp.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const {isAnimatedWebp} = await import(
  path.join(root, 'studio/migration/convert-animations.mjs')
)

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

/*
  A minimal WebP header, built to spec:
    0..3   "RIFF"
    4..7   file size
    8..11  "WEBP"
    12..15 chunk fourcc
    16..19 chunk size
    20     VP8X feature flags - bit 0x02 is Animation
  Padded past 32 bytes because the detector requires that much.
*/
function webpHeader({chunk = 'VP8X', flags = 0x00, kind = 'WEBP', riff = 'RIFF'} = {}) {
  const buf = Buffer.alloc(64)
  buf.write(riff, 0, 'ascii')
  buf.writeUInt32LE(56, 4)
  buf.write(kind, 8, 'ascii')
  buf.write(chunk, 12, 'ascii')
  buf.writeUInt32LE(10, 16)
  buf[20] = flags
  return buf
}

// The exact flag values the real dataset carries, taken from a live run.
check('animated: VP8X with flags 0x02', isAnimatedWebp(webpHeader({flags: 0x02})) === true)
check(
  'animated: VP8X with flags 0x12 (animation + alpha)',
  isAnimatedWebp(webpHeader({flags: 0x12})) === true,
)

// The rejections that must stay rejections.
check('static: VP8X with no animation bit', isAnimatedWebp(webpHeader({flags: 0x10})) === false)
check('static: plain VP8 chunk', isAnimatedWebp(webpHeader({chunk: 'VP8 '})) === false)
check('static: VP8L chunk', isAnimatedWebp(webpHeader({chunk: 'VP8L'})) === false)
check('not a RIFF container at all', isAnimatedWebp(webpHeader({riff: '\x89PNG'})) === false)
check('RIFF but not WEBP (e.g. a WAV)', isAnimatedWebp(webpHeader({kind: 'WAVE'})) === false)
check('too short to have a header', isAnimatedWebp(Buffer.alloc(8)) === false)

/*
  The ANIM chunk fallback: some encoders leave the feature bit clear but still
  emit an ANIM chunk. The detector accepts either.
*/
const animChunk = webpHeader({flags: 0x00})
animChunk.write('ANIM', 30, 'ascii')
check('animated: ANIM chunk even with the flag clear', isAnimatedWebp(animChunk) === true)

/*
  And the regression itself, stated directly. If someone reintroduces the
  length-style offsets, the WEBP tag read comes back empty and every one of the
  positive cases above flips to false - so assert the read, not just the verdict.
*/
const probe = webpHeader({flags: 0x02})
check(
  'header fields are read with start/end offsets',
  probe.toString('ascii', 8, 12) === 'WEBP' && probe.toString('ascii', 12, 16) === 'VP8X',
  `got kind=${probe.toString('ascii', 8, 12)} chunk=${probe.toString('ascii', 12, 16)}`,
)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
