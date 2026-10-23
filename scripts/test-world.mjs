/*
  The world generator (src/lib/world.ts), in plain Node with made-up
  pieces. For each mode at desktop and phone widths: every piece placed,
  inside the columns, no two sharing a cell; and then what each mode
  promises -
    heights  sizes really vary (largest at least three times the smallest)
    caves    some cells are carved, no piece sits on one, some caves named
    biomes   every project's pieces mostly inside its own region, and a
             name for each project
  - the same seed giving the same world and another seed another, fast
  enough to run on every draw.

  Usage: node scripts/test-world.mjs
*/
import {generateWorld, heightAt} from '../src/lib/world.ts'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const shapes = [
  {w: 1000, h: 1000},
  {w: 3000, h: 1000},
  {w: 800, h: 1200},
  {w: 2000, h: 1400},
]
const projects = ['/work/a', '/work/b', '/work/c', '/work/d', '/work/e', null]
const counts = [22, 10, 7, 5, 3, 6]
const pieces = []
projects.forEach((project, n) => {
  for (let k = 0; k < counts[n]; k++) pieces.push({...shapes[(n + k) % 4], project, own: !!project && k === 0})
})

for (const [name, cols] of [
  ['desktop', 20],
  ['phone', 6],
]) {
  for (const mode of ['heights', 'caves', 'biomes']) {
    const tag = `${name}, ${mode}`
    const t0 = performance.now()
    const out = generateWorld(pieces, {cols, mode, seed: 42, maxSpan: cols >= 12 ? 6 : 3})
    const ms = performance.now() - t0
    const p = out.placed
    check(`${tag}: every piece placed`, p.length === pieces.length, `${p.length}/${pieces.length}`)
    const cell = new Map()
    let shared = 0
    let outside = 0
    for (const q of p) {
      if (q.c < 0 || q.c + q.cw > cols) outside++
      for (let r = q.r; r < q.r + q.ch; r++)
        for (let c = q.c; c < q.c + q.cw; c++) {
          const k = `${c},${r}`
          if (cell.has(k)) shared++
          cell.set(k, q.i)
        }
    }
    check(`${tag}: inside the columns, no cell shared`, shared === 0 && outside === 0, `${shared} shared, ${outside} outside`)
    check(`${tag}: quick enough to draw`, ms < 250, `${ms.toFixed(0)}ms`)

    if (mode === 'heights') {
      const areas = p.map((q) => q.cw * q.ch)
      check(`${tag}: the sizes really vary`, Math.max(...areas) >= 3 * Math.min(...areas), `${Math.min(...areas)} to ${Math.max(...areas)} cells`)
      // The point of it: the big pieces stand on high ground, the small in the valleys.
      const ground = (q) => heightAt(42, cols, q.c, q.r)
      const big = p.filter((q) => q.cw >= (cols >= 12 ? 4 : 3)).map(ground)
      const small = p.filter((q) => q.cw <= 1).map(ground)
      const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
      if (big.length && small.length) check(`${tag}: big pieces stand on high ground, small ones low`, mean(big) > mean(small) + 0.3, `ground under big ${mean(big).toFixed(2)}, under small ${mean(small).toFixed(2)}`)
    }
    if (mode === 'caves') {
      const carved = [...out.cave.slice(0, cols * out.rows)].filter(Boolean).length
      const onCave = p.filter((q) => {
        for (let r = q.r; r < q.r + q.ch; r++) for (let c = q.c; c < q.c + q.cw; c++) if (out.cave[r * cols + c]) return true
        return false
      }).length
      check(`${tag}: caves are carved through the world`, carved > cols * out.rows * 0.04, `${carved} of ${cols * out.rows} cells`)
      check(`${tag}: no piece sits in a cave`, onCave === 0, `${onCave}`)
      if (cols >= 12) check(`${tag}: and some caves carry a name`, out.labels.length > 0, `${out.labels.length}`)
    }
    if (mode === 'biomes') {
      let home = 0
      for (const q of p) {
        const region = out.regions.indexOf(pieces[q.i].project ?? '')
        if (out.biome[q.r * cols + q.c] === region) home++
      }
      check(`${tag}: projects settle in their own regions`, home >= p.length * 0.8, `${home} of ${p.length} at home`)
      check(`${tag}: every project is named on its land`, out.labels.length >= projects.filter(Boolean).length - 1, `${out.labels.length} named`)
    }
    const again = generateWorld(pieces, {cols, mode, seed: 42, maxSpan: cols >= 12 ? 6 : 3})
    const other = generateWorld(pieces, {cols, mode, seed: 43, maxSpan: cols >= 12 ? 6 : 3})
    check(`${tag}: the same seed gives the same world, another another`, JSON.stringify(again.placed) === JSON.stringify(p) && JSON.stringify(other.placed) !== JSON.stringify(p))
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
