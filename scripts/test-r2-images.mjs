/*
  The plain parts of moving the pictures to R2 (scripts/lib/r2-images.mjs):
  keys, finding the addresses in a page as written, rewriting them.

  Usage: node scripts/test-r2-images.mjs
*/
import {keyFor, queryOfKey, findPictures, rewritePictures, findScans, markScans, HOST} from './lib/r2-images.mjs'
import {tileR2Url, tileGrid} from '../src/lib/loupeGrid.mjs'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures++
}

const P = 'images/8337vjtf/production/abc123-1000x800.png'
const k = keyFor(P, 'rect=0,0,1000,800&w=1600&fm=webp&q=82')
check('a key carries the whole query, the file name last', k === `v2/rect_0,0,1000,800~w_1600~fm_webp~q_82/${P}`, k)
check('and the query comes back from it', queryOfKey(k) === 'rect=0,0,1000,800&w=1600&fm=webp&q=82', queryOfKey(k))
check('no query: a key of its own', keyFor(P, '') === `v2/-/${P}`)
check('an odd character in the query: no key, it stays on /img/', keyFor(P, 'w=800&x=a b') === null && keyFor(P, 'bg=%23fff') === null)
check('only this project\'s pictures', keyFor('images/other/production/x-1x1.png', '') === null && keyFor('files/8337vjtf/production/x.mp4', '') === null)

const html = [
  `<img src="/img/v2/${P}?w=800&amp;fm=webp" srcset="/img/v2/${P}?w=400&amp;fm=webp 400w, /img/v2/${P}?w=800&amp;fm=webp 800w">`,
  `<script type="application/json">{"src":"\\/img\\/v2\\/images\\/8337vjtf\\/production\\/abc123-1000x800.png?w=400\\u0026fm=webp"}</script>`,
  `<div data-scan="/img/v2/${P}"></div>`,
  `<img src="/img/v2/${P}?w=900&amp;fm=webp">`,
].join('\n')
const found = findPictures(html)
check('every address is found, attributes and escaped JSON - but not a base in data-scan', found.length === 5, `${found.length}: ${found.map((f) => f.query).join(' | ')}`)
check('&amp; and \\u0026 read as &', found.every((f) => !/amp;|u0026/.test(f.query)))

const have = new Set([keyFor(P, 'w=800&fm=webp'), keyFor(P, 'w=400&fm=webp'), keyFor(P, '')])
const {html: out, moved, kept} = rewritePictures(html, have)
check('those in R2 point there, in each place as it was written', out.includes(`src="${HOST}/v2/w_800~fm_webp/${P}"`) && out.includes(`${HOST}/v2/w_400~fm_webp/${P} 400w`) && out.includes(`"src":"${HOST.split('/').join('\\/')}\\/v2\\/w_400~fm_webp\\/images`), out)
check('one not in R2 keeps its /img/ address', out.includes(`/img/v2/${P}?w=900&amp;fm=webp`), `kept ${kept}`)
// The magnifier adds ?rect=... to it; R2 would ignore that and send the whole scan.
check('a scan in data-scan stays on /img/ even when its key is in R2', out.includes(`data-scan="/img/v2/${P}"`))
check('counted', moved === 4 && kept === 2, `moved ${moved}, kept ${kept}`)

// The magnifier's patches: copied under the same keys the page builds from data-r2.
const loupe = `<figure class="loupe" data-loupe="" data-mode="window" data-scan="/img/v2/${P}" data-w="1100" data-h="600" tabindex="0">`
const scans = findScans(loupe + '<button data-scan="/img/v2/' + P + '" data-px-w="1100">')
check('a magnifier\'s scan is found, with a patch for every square of its grid - not actual size\'s button', scans.length === 1 && scans[0].patches.length === tileGrid(1100, 600).length, `${scans.length} scan(s), ${scans[0]?.patches.length} patches`)
const edge = scans[0].patches.at(-1)
check('a patch\'s key is the address the magnifier asks R2 for', `${HOST}/${edge.key}` === tileR2Url(P, 1024, 512, 76, 88), `${edge.key}`)
const most = new Set(scans[0].patches.slice(1).map((p) => p.key))
check('not marked while a patch is missing', markScans(loupe, most).marked === 0)
const all = markScans(loupe, new Set(scans[0].patches.map((p) => p.key)))
check('marked data-r2 with its path once all are in, data-scan left alone', all.marked === 1 && all.html.includes(`data-r2="${P}" data-scan="/img/v2/${P}"`), all.html)
check('and not marked twice', markScans(all.html, new Set(scans[0].patches.map((p) => p.key))).marked === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
