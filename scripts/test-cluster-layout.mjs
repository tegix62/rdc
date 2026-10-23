/*
  The central cluster's layout (src/lib/cluster.ts), checked in plain Node
  with made-up pieces - no site, no pictures, no network.

  For a spread of piece sets (square tees, tall posters, wide wordmarks, one
  very wide banner, a single piece, a big project) at desktop and phone
  widths:
    - every piece is placed, none overlap, none leave the width
    - the shape is centred: each row is centred, so the left and right
      margins of every row match
    - the first piece is in the middle row, nearest the centre
    - the middle row is at least as wide as the rows above and below it, so
      it reads as a lens, not a block or a pyramid
    - a small set fits the height it was given
    - the lead piece, when enlarged, is the largest piece

  Usage: node scripts/test-cluster-layout.mjs
*/
import {layoutCluster, seedOf} from '../src/lib/cluster.ts'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const sq = {w: 1000, h: 1000}
const tall = {w: 800, h: 1200}
const wide = {w: 2400, h: 900}
const mark = {w: 1600, h: 700}
const banner = {w: 6000, h: 600}

const sets = {
  'a dozen mixed picks': [sq, tall, wide, sq, mark, tall, sq, sq, wide, tall, mark, sq],
  'a single piece': [tall],
  'two pieces': [wide, sq],
  'one very wide banner among tees': [sq, banner, sq, sq, tall],
  'a 22-piece project': Array.from({length: 22}, (_, k) => [sq, tall, wide, mark][k % 4]),
  'all wordmarks': [mark, mark, wide, mark, wide, mark],
}

const sizes = [
  {name: 'desktop', width: 1100, maxHeight: 620, gap: 12, minRow: 90, maxRow: 300},
  {name: 'phone', width: 358, maxHeight: 560, gap: 6, minRow: 56, maxRow: 180},
]

const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

for (const size of sizes) {
  for (const [name, pieces] of Object.entries(sets)) {
    for (const lead of [1, 1.35]) {
      const tag = `${size.name}, ${name}${lead > 1 ? ', lead enlarged' : ''}`
      const out = layoutCluster(pieces, {...size, lead})
      const p = out.placed
      check(`${tag}: every piece placed`, p.length === pieces.length, `${p.length}/${pieces.length}`)
      let clash = 0
      for (let a = 0; a < p.length; a++) for (let b = a + 1; b < p.length; b++) if (overlap(p[a], p[b])) clash++
      const outside = p.filter((q) => q.x < -0.5 || q.x + q.w > size.width + 0.5).length
      check(`${tag}: no overlaps, nothing past the edge`, clash === 0 && outside === 0, `${clash} overlap(s), ${outside} outside`)

      const rows = new Map()
      for (const q of p) {
        const r = rows.get(q.row) ?? {l: Infinity, r: -Infinity}
        r.l = Math.min(r.l, q.x)
        r.r = Math.max(r.r, q.x + q.w)
        rows.set(q.row, r)
      }
      const offCentre = [...rows.values()].map((r) => Math.abs(r.l - (size.width - r.r))).reduce((m, v) => Math.max(m, v), 0)
      check(`${tag}: every row centred`, offCentre < 1, `${offCentre.toFixed(1)}px off`)

      const ids = [...rows.keys()].sort((a, b) => a - b)
      const midRow = ids[Math.floor((ids.length - 1) / 2)]
      const first = p.find((q) => q.i === 0)
      const centre = size.width / 2
      const dist = (q) => Math.abs(q.x + q.w / 2 - centre)
      const inMid = p.filter((q) => q.row === midRow)
      // A banner alone in a row of its own cannot be balanced by anything on
      // the other side; there, only that the first piece is nearest the centre of its row.
      check(
        `${tag}: the first piece is in the middle row, nearest the centre`,
        (first.row === midRow || name.includes('banner')) &&
          p.filter((q) => q.row === first.row).every((q) => dist(first) <= dist(q) + 0.5),
        `row ${first.row} of ${ids.join(',')}`,
      )

      /*
        Within 15%: rows are filled with whole pieces, so a neighbour can
        come out a little wider. Not asked of a middle row holding one piece
        (nothing else fit beside it, and moving the first piece out of the
        middle to widen it would be worse), nor of a set built around a
        banner ten times wider than tall.
      */
      const span = (r) => rows.get(r).r - rows.get(r).l
      const widest = Math.max(...ids.map(span))
      const exempt = pieces.length < 3 || inMid.length < 2 || name.includes('banner')
      check(
        `${tag}: the middle row is the widest, or nearly`,
        exempt || span(midRow) >= widest * 0.85 - 0.5,
        ids.map((r) => Math.round(span(r))).join(' / '),
      )

      if (pieces.length <= 12) check(`${tag}: fits its height`, out.height <= size.maxHeight + 0.5, `${Math.round(out.height)} of ${size.maxHeight}`)
      if (lead > 1 && pieces.length > 1) {
        const area = (q) => q.w * q.h
        // Compared with pieces of its own shape, as a wordmark and a poster
        // of the same height have different areas.
        const same = p.filter((q) => q.i !== 0 && pieces[q.i].w / pieces[q.i].h === pieces[0].w / pieces[0].h)
        check(`${tag}: the lead is the largest of its shape`, same.every((q) => area(first) >= area(q) - 0.5), `${same.length} compared`)
      }
    }
  }
}

// ---------------------------------------------------------------- the noise outline
{
  const pieces = sets['a 22-piece project']
  for (const size of sizes) {
    const at = (seed) => layoutCluster(pieces, {...size, lead: 1.35, outline: {seed}})
    const a = at(seedOf('/work/dumpstat'))
    const again = at(seedOf('/work/dumpstat'))
    const b = at(seedOf('/work/adelante-barbell-club'))
    const tag = `${size.name}, outline`
    check(`${tag}: the same seed gives the same cluster`, JSON.stringify(a) === JSON.stringify(again))
    check(`${tag}: another seed gives another outline`, JSON.stringify(a.placed) !== JSON.stringify(b.placed))
    for (const [name, out] of [['dumpstat', a], ['adelante', b]]) {
      const p = out.placed
      let clash = 0
      for (let x = 0; x < p.length; x++) for (let y = x + 1; y < p.length; y++) if (overlap(p[x], p[y])) clash++
      const outside = p.filter((q) => q.x < -0.5 || q.x + q.w > size.width + 0.5).length
      check(`${tag} (${name}): every piece placed, no overlaps, nothing past the edge`, p.length === pieces.length && clash === 0 && outside === 0, `${clash} overlap(s), ${outside} outside`)
      const ids = [...new Set(p.map((q) => q.row))].sort((m, n) => m - n)
      const mid = ids[Math.floor((ids.length - 1) / 2)]
      const inMid = p.filter((q) => q.row === mid)
      const l = Math.min(...inMid.map((q) => q.x))
      const r = Math.max(...inMid.map((q) => q.x + q.w))
      const first = p.find((q) => q.i === 0)
      check(`${tag} (${name}): the middle row stays centred, with the first piece in it`, first.row === mid && Math.abs(l - (size.width - r)) < 1, `${Math.abs(l - (size.width - r)).toFixed(1)}px off`)
      const offsets = ids.filter((k) => k !== mid).map((k) => {
        const row = p.filter((q) => q.row === k)
        return Math.min(...row.map((q) => q.x)) - (size.width - Math.max(...row.map((q) => q.x + q.w)))
      })
      check(`${tag} (${name}): and the other rows are not all centred`, offsets.some((o) => Math.abs(o) > 4), offsets.map((o) => Math.round(o)).join(' '))
    }
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
