/*
  The radically-sized cluster (src/lib/spiralCluster.ts), in plain Node with
  made-up pieces. For a spread of sets at desktop and phone widths: every
  piece placed, none overlapping (hairline gap kept), none past the sides;
  the first piece the one nearest the middle; size 2 covering about twice
  the area of size 1 whatever the shapes; the same seed giving the same
  layout and another seed another; and fast enough to run on every draw.

  Usage: node scripts/test-spiral-cluster.mjs
*/
import {layoutSpiral} from '../src/lib/spiralCluster.ts'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const word = (size) => ({w: 3000, h: 900, size})
const square = (size) => ({w: 1000, h: 1000, size})
const tall = (size) => ({w: 800, h: 1200, size})
const tiers = (n) => Array.from({length: n}, (_, k) => [word, square, tall, word][k % 4](k < 2 ? 6 : k < 6 ? 2.5 : 1))

const sets = {
  'a dozen in tiers': tiers(12),
  'thirty in tiers': tiers(30),
  'all the same size': Array.from({length: 15}, (_, k) => [word, square][k % 2](1)),
  'one': [word(1)],
  'a banner': [{w: 9000, h: 700, size: 4}, square(1), square(1)],
}
const sizes = [
  {name: 'desktop', width: 1000, height: 560, gap: 3, squash: 0.62},
  {name: 'phone', width: 358, height: 520, gap: 2, squash: 1.25},
]

for (const size of sizes) {
  for (const [name, pieces] of Object.entries(sets)) {
    const tag = `${size.name}, ${name}`
    const t0 = performance.now()
    const out = layoutSpiral(pieces, {...size, seed: 7})
    const ms = performance.now() - t0
    const p = out.placed
    check(`${tag}: every piece placed`, p.length === pieces.length)
    let clash = 0
    for (let a = 0; a < p.length; a++)
      for (let b = a + 1; b < p.length; b++) {
        const A = p[a]
        const B = p[b]
        if (A.x < B.x + B.w + 1 && B.x < A.x + A.w + 1 && A.y < B.y + B.h + 1 && B.y < A.y + A.h + 1) clash++
      }
    const outside = p.filter((q) => q.x < -0.5 || q.x + q.w > size.width + 0.5).length
    check(`${tag}: nothing overlaps or touches, nothing past the sides`, clash === 0 && outside === 0, `${clash} touching, ${outside} outside`)
    if (p.length > 2) {
      const cx = size.width / 2
      const cy = out.height / 2
      const dist = (q) => Math.hypot(q.x + q.w / 2 - cx, (q.y + q.h / 2 - cy) / (size.squash ?? 1))
      const first = p.find((q) => q.i === 0)
      const nearer = p.filter((q) => q.i !== 0 && dist(q) < dist(first)).length
      check(`${tag}: the first piece is at the middle`, nearer <= Math.ceil(p.length * 0.15), `${nearer} nearer the middle than it`)
    }
    check(`${tag}: quick enough to draw`, ms < 120, `${ms.toFixed(0)}ms`)
  }
  const out = layoutSpiral([word(2), square(1), tall(2), square(2), word(1)], {...size, seed: 3, height: 400})
  const area = (i) => {
    const q = out.placed.find((x) => x.i === i)
    return q.w * q.h
  }
  const r = (area(0) / area(4) + area(3) / area(1)) / 2
  check(`${size.name}: size 2 covers about twice the area of size 1, whatever the shape`, r > 1.8 && r < 2.2, r.toFixed(2))
  const a = layoutSpiral(tiers(20), {...size, seed: 11})
  const again = layoutSpiral(tiers(20), {...size, seed: 11})
  const other = layoutSpiral(tiers(20), {...size, seed: 12})
  check(`${size.name}: the same seed gives the same layout, another seed another`, JSON.stringify(a) === JSON.stringify(again) && JSON.stringify(a) !== JSON.stringify(other))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
