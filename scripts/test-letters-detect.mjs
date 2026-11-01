/*
  The Letters tool's shape finder (studio/tools/letters/detect.ts), on
  drawn-up pictures: separate letters come out as separate boxes in reading
  order, a dotted i joins up with a little thickening, light ink on dark
  paper works, specks and the frame are left out, and a box becomes a
  Sanity crop inside the picture.

  No network. Usage: node scripts/test-letters-detect.mjs
*/
import {build} from 'esbuild'

const out = await build({entryPoints: ['studio/tools/letters/detect.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral'})
const {findShapes, toCrop, otsu} = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const W = 400, H = 200
const paper = (bg) => new Uint8Array(W * H).fill(bg)
const rect = (g, x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j * W + i] = v }

// Two rows: three blocks, then an "i" (dot 2px above its stem) and an L.
const page = (bg, ink) => {
  const g = paper(bg)
  rect(g, 20, 20, 30, 50, ink); rect(g, 70, 20, 30, 50, ink); rect(g, 120, 20, 30, 50, ink)
  rect(g, 20, 110, 10, 10, ink); rect(g, 20, 122, 10, 50, ink)      // i
  rect(g, 60, 110, 8, 62, ink); rect(g, 60, 164, 30, 8, ink)        // L
  rect(g, 300, 30, 1, 1, ink); rect(g, 330, 150, 2, 2, ink)          // specks
  return g
}

check('a threshold between paper and ink', (() => { const t = otsu(page(240, 20)); return t >= 20 && t < 240 })())

const joined = findShapes(page(240, 20), W, H, {join: 1})
check('dark ink: five letters, in reading order, specks left out', joined.length === 5 && joined[0].x === 20 && joined[1].x === 70 && joined[2].x === 120 && joined[3].y < 130 && joined[4].x === 60, JSON.stringify(joined))
check('the dotted i is one letter when joined', joined[3].h === 62 && joined[3].y === 110, JSON.stringify(joined[3]))

const apart = findShapes(page(240, 20), W, H, {join: 0})
check('without joining, the dot is its own shape (or too small to keep)', !apart.some((b) => b.x === 20 && b.y === 110 && b.h > 20), JSON.stringify(apart))

const light = findShapes(page(15, 230), W, H, {join: 1})
check('light ink on dark paper found the same way', light.length === 5, JSON.stringify(light))

// A frame round the whole picture is not a letter.
const framed = page(240, 20)
rect(framed, 0, 0, W, 3, 20); rect(framed, 0, H - 3, W, 3, 20); rect(framed, 0, 0, 3, H, 20); rect(framed, W - 3, 0, 3, H, 20)
check('a frame round the picture is left out', findShapes(framed, W, H, {join: 1, ink: 'dark'}).length === 5)

const {crop, hotspot} = toCrop({x: 20, y: 20, w: 30, h: 50}, W, H)
const inside = [crop.left, crop.top, crop.right, crop.bottom].every((v) => v >= 0 && v < 1)
check('a box as a crop: inside the picture, a little paper round it', inside && crop.left < 20 / W && crop.left > 10 / W && Math.abs(hotspot.x - 35 / W) < 0.01, JSON.stringify(crop))
const edge = toCrop({x: 0, y: 0, w: 30, h: 50}, W, H).crop
check('a box at the edge stays inside', edge.left === 0 && edge.top === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
