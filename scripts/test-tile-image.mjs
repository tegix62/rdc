/*
  Which picture a tile draws, given what Studio actually stores.

  WHY THIS EXISTS

  Chris uploaded a batch of grid items, put each picture in Main Project Image,
  and eight of them came out blank on /portfolio. Everything that could have
  caught it said the page was fine: the documents were published, the page's
  GROQ filter accepted all of them, and the served HTML contained exactly 80
  `pf-item` boxes against the dataset's 80 tiles. The boxes were there. The
  pictures were not.

  The cause was that each of those eight had an EMPTY Grid Thumbnail - crop and
  hotspot settings saved by opening the field in Studio, with no file ever
  dropped in. The grids picked their image with `thumbnail || mainImage`, an
  empty shell is an object and therefore truthy, so the shell won and Img
  skipped it for having no asset.

  So the thing to test is not "does a tile have an image field" but "given a
  shell in the field that wins, does the real picture still get drawn". These
  cases all pass against `thumbnail || mainImage` except the two marked SHELL,
  which are the whole point - run them against the old expression and they fail,
  which is the only reason to trust them.

  Pure: esbuild compiles lib/image.ts, nothing touches the network.

  Usage: node scripts/test-tile-image.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
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

const outdir = path.join(root, 'node_modules', '.cache', 'tile-image')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'image.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/image.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  define: {
    'import.meta.env.PUBLIC_SANITY_VISUAL_EDITING': '"false"',
    'import.meta.env.PUBLIC_SANITY_STUDIO_URL': '"https://example.sanity.studio"',
  },
  logLevel: 'error',
})
const {tileImage, hasAsset, archiveCard} = await import(outfile)

const file = (ref) => ({_type: 'image', asset: {_ref: `image-${ref}-800x800-webp`}})

/*
  A shell exactly as Sanity stores one: the sub-fields an image field can save
  on their own, and no `asset`. This is not a hypothetical shape - it is what
  the eight documents held.
*/
const shell = () => ({_type: 'image', crop: {top: 0, bottom: 0, left: 0, right: 0}, hotspot: {x: 0.5, y: 0.5, height: 1, width: 1}})

const refOf = (image) => image?.asset?._ref ?? null

check(
  'the thumbnail wins when it holds a file',
  refOf(tileImage({thumbnail: file('thumb'), mainImage: file('main')})) === refOf(file('thumb')),
)

check(
  'the main image is used when there is no thumbnail at all',
  refOf(tileImage({mainImage: file('main')})) === refOf(file('main')),
)

check(
  'SHELL: an empty thumbnail falls through to the main image',
  refOf(tileImage({thumbnail: shell(), mainImage: file('main')})) === refOf(file('main')),
  'this is the eight blank tiles - it fails against `thumbnail || mainImage`',
)

check(
  'SHELL: an empty thumbnail and no main image is no tile',
  tileImage({thumbnail: shell()}) === null,
  'better to drop the tile than render an empty box',
)

check('a document with neither field is no tile', tileImage({title: 'x'}) === null)
check('a missing document is no tile', tileImage(undefined) === null && tileImage(null) === null)

check(
  'an empty main image behind no thumbnail is no tile',
  tileImage({mainImage: shell()}) === null,
)

check(
  'both shells is no tile',
  tileImage({thumbnail: shell(), mainImage: shell()}) === null,
)

/*
  archiveCard draws the related-work grids and picks the same way once there is
  no Archive Mark, so the shell rule has to hold there too - that grid showed
  the same blanks for the same reason.
*/
check(
  'SHELL: the archive card falls through to the main image too',
  refOf(archiveCard({thumbnail: shell(), mainImage: file('main')}).image) === refOf(file('main')),
)

check(
  'an authored archive mark still wins over both',
  archiveCard({archiveMark: file('mark'), thumbnail: file('thumb')}).mode === 'drawn',
)

check(
  'a shell archive mark falls through to the inked tile',
  archiveCard({archiveMark: shell(), thumbnail: file('thumb')}).mode === 'inked',
)

// The guard the whole rule rests on, stated once so a change to it is visible.
check('hasAsset is false for a shell', hasAsset(shell()) === false)
check('hasAsset is true for a file', hasAsset(file('x')) === true)

/*
  EXPLICIT vs INFERRED TREATMENT.

  .pf-item--air gives a mark room in the normal grid, and it is emitted for an
  explicit choice only. The distinction is doing real work: 14 tiles are
  inferred marks from their Asset Type, and if explicitTreatment ever starts
  answering for those, the dense grid Chris wants goes sparse in one deploy
  and nothing here would notice. So the inferred case is asserted, not just
  the explicit one.
*/
const tiles = await import(await (async () => {
  const out = path.join(outdir, 'tiles.mjs')
  await build({
    entryPoints: [path.join(root, 'src/lib/tiles.ts')],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'error',
  })
  return out
})())

check(
  'an explicit mark is explicit',
  tiles.explicitTreatment({tileTreatment: 'mark'}) === 'mark',
)
check(
  'an explicit bleed is explicit',
  tiles.explicitTreatment({tileTreatment: 'bleed'}) === 'bleed',
)
check(
  'an INFERRED mark is not explicit - no air in the normal grid',
  tiles.explicitTreatment({assetType: 'Identity / Brand Sheet'}) === null,
  'the 14 Asset Type marks must not gain air',
)
check(
  'an inferred mark is still a mark for ink mode',
  tiles.treatmentOf({assetType: 'Identity / Brand Sheet'}) === 'mark',
)
check(
  'nothing set is not explicit',
  tiles.explicitTreatment({}) === null && tiles.explicitTreatment(undefined) === null,
)
check(
  'an explicit bleed beats a mark-ish asset type',
  tiles.treatmentOf({tileTreatment: 'bleed', assetType: 'Identity / Brand Sheet'}) === 'bleed',
  'DumpStat - Lich Sketch relies on this',
)
check(
  'an unknown treatment value falls back to inference rather than sticking',
  tiles.explicitTreatment({tileTreatment: 'nonsense'}) === null &&
    tiles.treatmentOf({tileTreatment: 'nonsense', assetType: 'Apparel'}) === 'bleed',
)

console.log(failures === 0 ? '\nAll tile image checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
