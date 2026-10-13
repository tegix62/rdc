/*
  Front or back of the Merch & Apparel view.

  merchPlacement() decides which garments lead the view, from the picture's
  own transparency unless Chris overrides it. Wrong in either direction is
  visible the moment the view opens - a gym photo in the front row, or the
  Luna Tee buried behind camera angles - so the rule is pinned here.

  Usage: node scripts/test-merch-placement.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
let failures = 0
const eq = (name, got, want) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? ` - ${JSON.stringify(got)}` : ` - got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`}`)
}

const outdir = path.join(root, 'node_modules', '.cache', 'merch-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'tiles.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/tiles.ts')],
  outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'error',
})
const {merchPlacement} = await import(outfile)

eq('a cut-out tee leads', merchPlacement({tileOpaque: false}), 'lead')
eq('a photograph goes to the back', merchPlacement({tileOpaque: true}), 'later')
eq('unknown transparency goes to the back - promoted only on evidence', merchPlacement({}), 'later')
eq('null (no metadata) goes to the back', merchPlacement({tileOpaque: null}), 'later')
eq('the override brings an opaque tee to the front (Luna Tee)', merchPlacement({tileOpaque: true, merchPlacement: 'lead'}), 'lead')
eq('the override sends a cut-out to the back', merchPlacement({tileOpaque: false, merchPlacement: 'later'}), 'later')
eq('a preview-marked override still reads', merchPlacement({tileOpaque: true, merchPlacement: 'lead​​‌‍'}), 'lead')
eq('a nonsense override falls back to the picture', merchPlacement({tileOpaque: false, merchPlacement: 'sideways'}), 'lead')

console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('All merch placement checks pass.')
