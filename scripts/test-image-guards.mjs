/*
  Proves a half-finished image field cannot take the site down again.

  THE HISTORY THIS GUARDS

  A Sanity image field can be saved as an object shell - crop, hotspot,
  inkMode, noRecompress - with no asset attached. Studio produces one just by
  opening the field's options before dropping a file in. `urlFor()` throws on
  it, and because the whole site is one static build, one document in that state
  does not break one tile: it breaks all 21 pages.

  It happened twice. The first time cost hours of "my Sanity edits aren't
  showing up" before anyone looked at the build log. Every call site had guarded
  itself with a truthiness check, and a shell is truthy, so every call site was
  wrong in the same way.

  So there are two things to check, and the second matters more than the first:

    behaviour  imageUrl() returns null for every shape of empty field, and a
               real builder for a real one.

    the rule   nothing outside lib/image.ts calls the raw builder. This is what
               stops the bug coming back through an eighth call site written six
               months from now by someone who has never read any of this.

  Runs in plain Node with no network and no build, so it is cheap enough to sit
  in front of every push.

  Usage: node scripts/test-image-guards.mjs
*/
import {readFile, readdir, mkdir} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

// --- 1. behaviour -----------------------------------------------------------
/*
  lib/image.ts imports lib/sanity.ts, which reads import.meta.env - so it is
  bundled through esbuild rather than imported directly, the same trick the
  schema loader uses. `define` supplies the env values it expects.
*/
/*
  Written inside the repo, not /tmp. With dependencies left external the bundle
  still imports @sanity/client by name, and Node resolves that relative to the
  importing file - from /tmp there is no node_modules to find. node_modules/
  .cache is already gitignored.
*/
const outdir = path.join(root, 'node_modules', '.cache', 'image-guard')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'image.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/image.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  /*
    Dependencies stay external. Bundling them turned @sanity/client's internal
    `require('stream')` into an ESM call that Node refuses; left external, Node
    imports the package itself and its own CJS interop handles it. Only this
    project's own source needs bundling anyway - the point is to resolve
    import.meta.env, not to inline the client.
  */
  packages: 'external',
  define: {
    'import.meta.env.PUBLIC_SANITY_VISUAL_EDITING': '"false"',
    'import.meta.env.PUBLIC_SANITY_STUDIO_URL': '"https://example.sanity.studio"',
  },
  logLevel: 'error',
})
const {imageUrl, hasAsset} = await import(outfile)

/*
  The shell in the middle of this list is the exact object from the CI crash
  log, copied verbatim - that is the one that actually happened.
*/
const EMPTY = [
  ['undefined', undefined],
  ['null', null],
  ['empty object', {}],
  ['the real crash payload', {_type: 'image', inkMode: 'auto', noRecompress: true}],
  ['asset present but no _ref', {_type: 'image', asset: {}}],
  ['asset._ref is not a string', {_type: 'image', asset: {_ref: null}}],
  ['hotspot set, still no file', {_type: 'image', hotspot: {x: 0.5, y: 0.5}, crop: {}}],
]

const leaked = []
for (const [label, value] of EMPTY) {
  let result
  try {
    result = imageUrl(value)
  } catch (err) {
    leaked.push(`${label} THREW: ${err.message.slice(0, 60)}`)
    continue
  }
  if (result !== null) leaked.push(`${label} returned non-null`)
}
check(
  'imageUrl returns null for every empty field, never throws',
  leaked.length === 0,
  leaked.join(' | ') || `${EMPTY.length} shapes checked`,
)

// And a real reference still works, or the guard would be useless.
const REAL = {_type: 'image', asset: {_ref: 'image-abc123def456-800x600-jpg'}}
let realUrl = null
try {
  realUrl = imageUrl(REAL)?.width(400).url() ?? null
} catch (err) {
  realUrl = `THREW: ${err.message}`
}
check(
  'a real image reference still builds a URL',
  typeof realUrl === 'string' && realUrl.startsWith('https://cdn.sanity.io/') && realUrl.includes('w=400'),
  realUrl ?? 'null',
)

check('hasAsset agrees with imageUrl', hasAsset(REAL) === true && hasAsset(EMPTY[3][1]) === false)

// --- 2. the rule ------------------------------------------------------------
/*
  Only lib/image.ts may call the raw builder. Checked by reading the source
  rather than by trusting anyone to remember, because "every call site guarded
  itself and every guard was wrong" is the actual history here.
*/
const files = []
const walk = async (dir) => {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full)
    else if (/\.(astro|ts|tsx|mjs)$/.test(entry.name)) files.push(full)
  }
}
await walk(path.join(root, 'src'))

const offenders = []
for (const file of files) {
  if (file.endsWith(path.join('lib', 'image.ts'))) continue
  const text = await readFile(file, 'utf8')
  for (const [i, line] of text.split('\n').entries()) {
    // Skip comments and prose; `urlFor()` with no argument is a doc reference.
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
    if (/\burlFor\s*\(\s*[^)\s]/.test(code)) {
      offenders.push(`${path.relative(root, file)}:${i + 1}`)
    }
  }
}
check(
  'nothing outside lib/image.ts calls the raw builder',
  offenders.length === 0,
  offenders.join(', ') || `${files.length} files scanned`,
)

// A truthiness guard on an image field is the specific mistake that shipped
// twice, so flag the pattern wherever it survives.
const truthy = []
for (const file of files) {
  const text = await readFile(file, 'utf8')
  for (const [i, line] of text.split('\n').entries()) {
    if (/\b(image|thumbnail|mainImage|logo|favicon|poster|heroImage|archiveMark|clientLogo)\b\s*\?\s*imageUrl/.test(line)) {
      truthy.push(`${path.relative(root, file)}:${i + 1}`)
    }
  }
}
check(
  'no leftover truthiness guard in front of imageUrl',
  truthy.length === 0,
  truthy.join(', ') || 'imageUrl does its own checking',
)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
