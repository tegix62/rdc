/*
  Why didn't pass-through fire?

  The page audit found the site's four heaviest files are animated sources that
  went through the transform pipeline anyway - a 200x200 animated WebP came back
  at 2,539 KB, an 800x800 one at 10,704 KB. src/lib/animated.ts exists to stop
  exactly that, and its own header comment cites the 10,721 KB figure, so the
  protection was written for this bug and is not firing.

  Rather than reimplement the probe here and test a copy of it, this bundles
  the real src/lib/animated.ts with esbuild and calls it. If the shipped code
  says "not animated" about a file that plainly is, that shows up directly.

  For every gif/webp asset in the dataset it reports:

    verdict     what isAnimatedSource() decides - the actual shipped decision
    truth       what the file's bytes say, decoded here independently
    original    the real size of the untouched file
    transformed the size the CDN returns at the width the site asks for

  A row where truth is animated and verdict is not is a bug in the probe. A row
  where both agree it's animated and transformed is still huge means the call
  site ignored the verdict.

  Usage: node scripts/audit-animated.mjs [--json out.json]
*/
import {build} from 'esbuild'
import {writeFile, mkdir} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const jsonAt = process.argv.indexOf('--json')
const JSON_OUT = jsonAt > -1 ? process.argv[jsonAt + 1] : null

const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

// ---------------------------------------------------------------------------
// Bundle the shipped probe. import.meta.env doesn't exist in Node, so the two
// values src/lib/sanity.ts reads are defined at build time - the same way Astro
// substitutes them.
/*
  Written INSIDE the repo, not to a temp dir, and with @sanity/client left
  external. Both halves of that matter, and each was learned from a failed run:

  - bundling @sanity/client into ESM dies on "Dynamic require of stream" - it
    reaches for CJS built-ins through get-it, which esbuild can't express in an
    ESM bundle.
  - leaving it external only works if the output sits somewhere Node can find
    node_modules, because bare specifiers resolve relative to the importing
    file. From /tmp there is nothing to find.
*/
const outdir = path.join(root, 'node_modules/.cache/audit')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'animated.mjs')
await build({
  stdin: {
    contents: `
      export {isAnimatedSource} from './src/lib/animated.ts'
      export {originalUrl, sourceExtension, mayBeAnimated, imageDimensions, cappedWidth} from './src/lib/image.ts'
    `,
    resolveDir: root,
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  define: {
    'import.meta.env.PUBLIC_SANITY_VISUAL_EDITING': '"false"',
    'import.meta.env.PUBLIC_SANITY_STUDIO_URL': 'undefined',
  },
  logLevel: 'warning',
})
const lib = await import(outfile)

// ---------------------------------------------------------------------------
// Every image asset actually referenced by a document, with the reference
// shape src/ sees.
const docsRes = await fetch(
  `https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(
    '*[_type in ["caseStudy","page","siteSettings","blogPost"]]',
  )}`,
)
if (!docsRes.ok) throw new Error(`query failed: ${docsRes.status}`)
const docs = (await docsRes.json()).result

// Walk every document for objects that look like an image field, keeping the
// noRecompress flag alongside so "manually flagged" can be told apart.
const assets = new Map()
const walk = (node, docId) => {
  if (Array.isArray(node)) {
    for (const v of node) walk(v, docId)
    return
  }
  if (!node || typeof node !== 'object') return
  const ref = node.asset?._ref
  if (typeof ref === 'string' && ref.startsWith('image-')) {
    if (!assets.has(ref)) {
      assets.set(ref, {ref, source: node, docs: new Set(), noRecompress: node.noRecompress === true})
    }
    assets.get(ref).docs.add(docId)
    if (node.noRecompress === true) assets.get(ref).noRecompress = true
  }
  for (const v of Object.values(node)) walk(v, docId)
}
for (const d of docs) walk(d, d._id)

const candidates = [...assets.values()].filter((a) => lib.mayBeAnimated(a.source))
console.log(
  `${assets.size} image assets referenced; ${candidates.length} are gif/webp and worth probing\n`,
)

// ---------------------------------------------------------------------------
// An independent read of the bytes, so the shipped verdict has something to be
// checked against rather than being taken on trust.
const truthOf = (bytes) => {
  const ascii = (start, len) => String.fromCharCode(...bytes.slice(start, start + len))
  if (ascii(0, 3) === 'GIF') {
    /*
      The whole window, not the first 200 bytes.

      A GIF's NETSCAPE looping extension sits after the logical screen
      descriptor AND the global colour table, and a 256-colour table alone is
      768 bytes - so on a typical GIF the marker lives past offset 780 and a
      200-byte read can never reach it. The shipped probe was fixed for this;
      this cross-check was not, which made it useless in the one direction that
      matters: it agreed with the probe when the probe was right, and reported
      "no loop block in first 200B" on a real animated GIF.
    */
    const loop = ascii(0, bytes.length).includes('NETSCAPE')
    return {
      format: 'gif',
      animated: loop,
      note: loop ? 'NETSCAPE loop block' : `no loop block in first ${bytes.length}B`,
    }
  }
  if (ascii(1, 3) === 'PNG') {
    const apng = ascii(0, bytes.length).includes('acTL')
    return {
      format: apng ? 'apng' : 'png',
      animated: apng,
      note: apng ? 'acTL animation chunk' : 'still PNG',
    }
  }

  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const fourcc = ascii(12, 4)
    if (fourcc !== 'VP8X') {
      return {format: `webp/${fourcc}`, animated: false, note: 'simple webp, cannot animate'}
    }
    const flags = bytes[20]
    const animFlag = (flags & 0x02) !== 0
    const hasAnimChunk = ascii(0, 200).includes('ANIM')
    return {
      format: 'webp/VP8X',
      animated: animFlag || hasAnimChunk,
      note: `flags=0x${flags.toString(16).padStart(2, '0')} animBit=${animFlag} ANIMchunk=${hasAnimChunk}`,
    }
  }
  /*
    Not GIF and not WebP, but two of the site's worst offenders land here while
    being 1,348 KB at 300x300 - roughly 15 bytes per pixel, which no still
    image is. So something animated is arriving in a container neither
    mayBeAnimated() nor this reader recognises, and naming it matters more than
    guessing: report the magic bytes and, for ISO base media files, the brand.
  */
  const iso = ascii(4, 4) === 'ftyp'
  const brand = iso ? ascii(8, 4) : null
  const hex = [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
  return {
    format: iso ? `iso/${brand}` : ascii(0, 4).replace(/[^\x20-\x7e]/g, '.'),
    // An ISO base media file is a sequence container by construction. avis is
    // animated AVIF; heic/hevc sequences behave the same way. Reported as a
    // finding rather than acted on - the shipped probe still decides from its
    // own rules, and this is here to say what those rules are missing.
    animated: iso && /^(avis|hevc|msf1|heic)$/.test(brand ?? ''),
    note: iso ? `ISO base media, brand ${brand}` : `unrecognised magic: ${hex}`,
  }
}

/*
  Sizes must be measured with a browser's Accept header.

  The first run of this script reported the homepage hero at 79 KB for the
  exact URL the page audit had measured at 10,704 KB. Both numbers were real:
  auto=format is content-negotiated, so a bare fetch with no Accept header gets
  the original format back while a browser gets WebP or AVIF. Measuring without
  it describes a response no visitor ever receives.

  Content-Type comes back too, because "what did the CDN actually decide to
  send" is the question underneath all of this.
*/
const BROWSER_ACCEPT =
  'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

const measure = async (url, {asBrowser = true} = {}) => {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: asBrowser ? {Accept: BROWSER_ACCEPT} : {},
    })
    return {
      bytes: Number(res.headers.get('content-length') ?? 0),
      type: (res.headers.get('content-type') ?? '?').replace('image/', ''),
    }
  } catch {
    return {bytes: 0, type: 'error'}
  }
}

const kb = (n) => (n ? `${Math.round(n / 1024)} KB` : '?')
const rows = []
let disagreements = 0

for (const a of candidates) {
  const url = lib.originalUrl(a.source)
  if (!url) {
    console.log(`  ?? no original URL for ${a.ref}`)
    continue
  }

  /*
    The same window the shipped probe reads, and - the part that was missing -
    the same Accept header a browser sends.

    Without it the CDN content-negotiates the bare asset URL down to a static
    JPEG or PNG fallback, so this read the first frame of an animation and
    reported "unrecognised magic: ff d8 ff db" on assets that are animated
    WebP. `measure()` above already sent the header for byte counts; this call
    did not, so the sizes in this report were a browser's and the verdicts were
    not. Two halves of one row describing two different responses.
  */
  let bytes = new Uint8Array()
  try {
    const res = await fetch(url, {
      headers: {Range: 'bytes=0-4095', Accept: BROWSER_ACCEPT},
    })
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (err) {
    console.log(`  ?? header fetch failed for ${a.ref}: ${err}`)
    continue
  }

  const verdict = await lib.isAnimatedSource(a.source)
  const truth = truthOf(bytes)
  const dims = lib.imageDimensions(a.source)

  const original = await measure(url)
  // What the site ships if it treats this as an ordinary image. 800 is the
  // width the portfolio grid asks for, which is where the worst offenders
  // showed up.
  const transformed = await measure(`${url}?w=800&q=80&auto=format`)
  // And what upscaling does, which is the homepage hero's whole story: an
  // 800x800 source was asked for at w=1800.
  const upscaled = dims
    ? await measure(`${url}?w=${dims.width * 2}&q=80&auto=format`)
    : {bytes: 0, type: '-'}
  const originalBytes = original.bytes
  const transformedBytes = transformed.bytes

  const agree = verdict === truth.animated
  if (!agree) disagreements += 1

  rows.push({
    ref: a.ref,
    dims: dims ? `${dims.width}x${dims.height}` : '?',
    verdict,
    truth: truth.animated,
    format: truth.format,
    note: truth.note,
    noRecompress: a.noRecompress,
    originalBytes,
    originalType: original.type,
    transformedBytes,
    transformedType: transformed.type,
    upscaledBytes: upscaled.bytes,
    upscaledType: upscaled.type,
    headerBytes: bytes.length,
  })

  console.log(
    `  ${agree ? '  ' : '!!'} ${(dims ? `${dims.width}x${dims.height}` : '?').padStart(9)} ` +
      `${truth.format.padEnd(10)} shipped=${String(verdict).padEnd(5)} bytes-say=${String(truth.animated).padEnd(5)} ` +
      `orig ${kb(originalBytes).padStart(8)}/${original.type.padEnd(4)} ` +
      `w800 ${kb(transformedBytes).padStart(8)}/${transformed.type.padEnd(4)} ` +
      `2x ${kb(upscaled.bytes).padStart(8)}  ${truth.note}`,
  )
}

// ---------------------------------------------------------------------------
console.log(`\n# Summary\n`)
const animated = rows.filter((r) => r.truth)
const blowUps = rows.filter((r) => r.transformedBytes > r.originalBytes * 1.5 && r.originalBytes)
const upscaleBlowUps = rows.filter((r) => r.upscaledBytes > r.originalBytes * 3 && r.originalBytes)
console.log(`  probed:              ${rows.length}`)
console.log(`  animated by bytes:   ${animated.length}`)
console.log(`  shipped code agrees: ${rows.filter((r) => r.verdict === r.truth).length}/${rows.length}`)
console.log(`  DISAGREEMENTS:       ${disagreements}`)
console.log(`  transform inflates:  ${blowUps.length}`)

if (disagreements) {
  console.log(`\n## The probe is wrong about these\n`)
  for (const r of rows.filter((x) => x.verdict !== x.truth)) {
    console.log(`  ${r.ref}`)
    console.log(`      ${r.dims} ${r.format} - shipped says ${r.verdict}, bytes say ${r.truth}`)
    console.log(`      ${r.note}`)
    console.log(`      original ${kb(r.originalBytes)}, transformed at w=800 ${kb(r.transformedBytes)}`)
  }
}

if (blowUps.length) {
  console.log(`\n## Transforming these makes them bigger\n`)
  for (const r of blowUps.sort((a, b) => b.transformedBytes - a.transformedBytes)) {
    const factor = (r.transformedBytes / r.originalBytes).toFixed(1)
    console.log(
      `  ${r.dims.padStart(9)} ${kb(r.originalBytes).padStart(8)} -> ${kb(r.transformedBytes).padStart(8)} ` +
        `(${factor}x) ${r.format}${r.noRecompress ? ' [flagged as-uploaded]' : ''}`,
    )
  }
}

if (upscaleBlowUps.length) {
  console.log(`\n## Asking for double the source width explodes these\n`)
  console.log(`  The clamp in cappedWidth() is what stops this reaching a visitor.\n`)
  for (const r of upscaleBlowUps.sort((a, b) => b.upscaledBytes - a.upscaledBytes)) {
    console.log(
      `  ${r.dims.padStart(9)} ${kb(r.originalBytes).padStart(8)} -> ${kb(r.upscaledBytes).padStart(9)} ` +
        `at 2x width (${(r.upscaledBytes / r.originalBytes).toFixed(0)}x) as ${r.upscaledType}`,
    )
  }
}

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify(rows, null, 2))
  console.log(`\nwrote ${JSON_OUT}`)
}

process.exit(disagreements ? 1 : 0)
