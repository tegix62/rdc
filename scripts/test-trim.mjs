/*
  Trimming a tile to its artwork from the tiny preview (src/lib/trim.ts),
  on made-up previews: a mark on transparency, a mark on white, a photo
  that fills its frame, and nothing at all.

  Usage: node scripts/test-trim.mjs
*/
import sharp from 'sharp'
import {trimOf} from '../src/lib/trim.ts'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}
const uri = async (w, h, paint, format) => {
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(paint(x, y), (y * w + x) * 4)
  const img = sharp(px, {raw: {width: w, height: h, channels: 4}})
  const buf = await (format === 'jpeg' ? img.flatten({background: '#fff'}).jpeg({quality: 70}) : img.png()).toBuffer()
  return `data:image/${format};base64,${buf.toString('base64')}`
}
const inBlock = (x, y) => x >= 7 && x < 13 && y >= 8 && y < 12
const fmt = (t) => (t ? `${t.x0.toFixed(2)},${t.y0.toFixed(2)} to ${t.x1.toFixed(2)},${t.y1.toFixed(2)}` : 'none')
const holds = (t) => t && t.x0 <= 7 / 20 && t.y0 <= 8 / 20 && t.x1 >= 13 / 20 && t.y1 >= 12 / 20

const cut = await trimOf(await uri(20, 20, (x, y) => (inBlock(x, y) ? [20, 20, 20, 255] : [0, 0, 0, 0]), 'png'))
check('a mark on transparency: trimmed to the mark, the mark whole', holds(cut) && cut.x1 - cut.x0 < 0.6, fmt(cut))
const white = await trimOf(await uri(20, 20, (x, y) => (inBlock(x, y) ? [10, 10, 10, 255] : [255, 255, 255, 255]), 'jpeg'))
check('a mark on white: trimmed to the mark, the mark whole', holds(white) && white.y1 - white.y0 < 0.6, fmt(white))
const photo = await trimOf(await uri(20, 20, (x, y) => [(x * 37) % 255, (y * 53) % 255, ((x + y) * 19) % 255, 255], 'jpeg'))
check('a photograph filling its frame: left whole', photo === null, fmt(photo))
check('no preview: left whole', (await trimOf(null)) === null)

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
