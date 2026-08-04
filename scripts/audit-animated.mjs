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
import {writeFile, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
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
const outdir = await mkdtemp(path.join(tmpdir(), 'animated-'))
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
  // Everything bundled in, deliberately NOT packages:'external'. The output
  // goes to a temp dir, and Node resolves bare specifiers relative to the
  // importing FILE - so an external '@sanity/image-url' looks for node_modules
  // next to /tmp/animated-xxx/ and dies. The first run of this script produced
  // an empty report for exactly that reason.
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
    return {
      format: 'gif',
      animated: ascii(0, 200).includes('NETSCAPE'),
      note: ascii(0, 200).includes('NETSCAPE') ? 'NETSCAPE loop block' : 'no loop block in first 200B',
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
  return {format: ascii(0, 4).replace(/[^\x20-\x7e]/g, '.'), animated: false, note: 'not gif or webp'}
}

const sizeOf = async (url) => {
  try {
    const res = await fetch(url, {method: 'HEAD'})
    return Number(res.headers.get('content-length') ?? 0)
  } catch {
    return 0
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

  // 512 bytes rather than the shipped probe's 256: this needs room to see
  // whether a marker sits just past the window the probe reads.
  let bytes = new Uint8Array()
  try {
    const res = await fetch(url, {headers: {Range: 'bytes=0-511'}})
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (err) {
    console.log(`  ?? header fetch failed for ${a.ref}: ${err}`)
    continue
  }

  const verdict = await lib.isAnimatedSource(a.source)
  const truth = truthOf(bytes)
  const dims = lib.imageDimensions(a.source)

  const originalBytes = await sizeOf(url)
  // What the site would ship if it treated this as an ordinary image. 800 is
  // the width the portfolio grid asks for, which is where the worst offenders
  // showed up.
  const transformedBytes = await sizeOf(`${url}?w=800&q=80&auto=format`)

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
    transformedBytes,
    headerBytes: bytes.length,
  })

  console.log(
    `  ${agree ? '  ' : '!!'} ${(dims ? `${dims.width}x${dims.height}` : '?').padStart(9)} ` +
      `${truth.format.padEnd(10)} shipped=${String(verdict).padEnd(5)} bytes-say=${String(truth.animated).padEnd(5)} ` +
      `orig ${kb(originalBytes).padStart(8)} -> w800 ${kb(transformedBytes).padStart(8)}  ${truth.note}`,
  )
}

// ---------------------------------------------------------------------------
console.log(`\n# Summary\n`)
const animated = rows.filter((r) => r.truth)
const blowUps = rows.filter((r) => r.transformedBytes > r.originalBytes * 1.5 && r.originalBytes)
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

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify(rows, null, 2))
  console.log(`\nwrote ${JSON_OUT}`)
}

process.exit(disagreements ? 1 : 0)
