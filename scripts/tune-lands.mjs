/*
  Tuning Lands on the real pieces (scripts/fixtures/world-pieces.json): how
  compact each project comes out, how tight the fill, whether the projects
  come before the loose work, and how tight an opened page packs - at a
  phone and a desktop, over several shuffles, for each set of weights
  given (lib/world.ts, WorldOptions.tune).

  Usage: node scripts/tune-lands.mjs '[{"tries":1},{"tries":16,"early":0.02}]'
*/
import {readFileSync} from 'node:fs'
import {generateWorld, setsOf} from '../src/lib/world.ts'
const data = JSON.parse(readFileSync(new URL('./fixtures/world-pieces.json', import.meta.url), 'utf8'))
const base = data.pieces
const sets = setsOf(base)
const variants = JSON.parse(process.argv[2] ?? '[{}]')
const seeds = [4187, 1, 2, 3, 42, 777, 2024, 5150]
for (const tune of variants) for (const [name, cols, ms] of [['phone', 8, 4], ['desktop', 20, 6]]) {
  const pieces = base.map((p) => ({...p, least: name === 'phone' && p.photo ? 2 : 1}))
  let spreadSum = 0, spreadMax = 0, coverSum = 0, earlyLoose = 0, n = 0, pRow = 0, lRow = 0, openCover = 0
  for (const seed of seeds) {
    const o = generateWorld(pieces, {cols, mode: 'lands', seed, maxSpan: ms, rowsPerCell: 2, tune})
    const sp = []
    for (const k of new Set(sets)) {
      if (!k.startsWith('/')) continue
      const qs = o.placed.filter((q) => sets[q.i] === k)
      if (qs.length < 2) continue
      const x0 = Math.min(...qs.map((q) => q.c)), x1 = Math.max(...qs.map((q) => q.c + q.cw)), y0 = Math.min(...qs.map((q) => q.r)), y1 = Math.max(...qs.map((q) => q.r + q.ch))
      sp.push(((x1 - x0) * (y1 - y0)) / qs.reduce((t, q) => t + q.cw * q.ch, 0))
    }
    spreadSum += sp.reduce((a, b) => a + b, 0) / sp.length
    spreadMax = Math.max(spreadMax, ...sp)
    const top = o.rows - 12
    let c = 0
    for (const q of o.placed) for (let r = q.r; r < Math.min(top, q.r + q.ch); r++) c += q.cw
    coverSum += c / (cols * top)
    // Loose pieces placed before the last project piece starts, in reading order of rows.
    const lastProjectRow = Math.max(...o.placed.filter((q) => sets[q.i].startsWith('/')).map((q) => q.r))
    earlyLoose += o.placed.filter((q) => !sets[q.i].startsWith('/') && q.r < lastProjectRow * 0.5).length
    const mr = (f) => { const a = o.placed.filter(f).map((q) => q.r); return a.reduce((x, y) => x + y, 0) / a.length / o.rows }
    pRow += mr((q) => sets[q.i].startsWith('/'))
    lRow += mr((q) => !sets[q.i].startsWith('/'))
    const f = pieces.findIndex((p) => p.own)
    const oo = generateWorld(pieces, {cols, mode: 'lands', seed, maxSpan: ms, rowsPerCell: 2, tune, focus: f, focusRow: 10, card: {cw: Math.min(cols, 6), ch: 10}})
    const top2 = oo.rows - 12
    let c2 = 0
    for (const q of oo.placed) for (let r = q.r; r < Math.min(top2, q.r + q.ch); r++) c2 += q.cw
    openCover += c2 / (cols * top2)
    n++
  }
  console.log(JSON.stringify(tune).padEnd(40), name.padEnd(8), 'spread mean', (spreadSum / n).toFixed(2), 'worst', spreadMax.toFixed(1), 'cover', ((coverSum / n) * 100).toFixed(0) + '%', 'loose early', (earlyLoose / n).toFixed(1), 'mean row proj/loose', (pRow / n).toFixed(2), (lRow / n).toFixed(2), 'opened cover', ((openCover / n) * 100).toFixed(0) + '%')
}
