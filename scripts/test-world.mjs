/*
  The world generator (src/lib/world.ts), in plain Node with made-up
  pieces: projects of several sizes, a collage parented set with no
  project (a collage and its close-ups), and loose pieces.

  For the height map and the biomes, at desktop and phone widths: every
  piece placed, inside the columns, no two sharing a cell; the same seed
  giving the same world and another seed another; fast enough to draw.
  Then, for the biomes - Chris: "stuff that's parented to a grid item to
  hug it, even though they don't have a case study", "only leave small
  noticeable gaps between Biomes":
    - each set is one block, and two sets never touch (a cell between)
    - little empty land: the pieces cover most of the cells their world uses
    - a close-up sits right beside the piece it is parented to
  Then, for the lands (the two combined - Chris: "projects are really
  grouped together very closely ... things that aren't a case study are
  still in their own territories, but everything's still touching",
  "radical size difference", "more complex imagery takes up the larger
  spots"):
    (then: "too clunky - think like how tight Height Map is, but we're
    grouping things together")
    - as tight as the height map: hardly an empty cell
    - each set's pieces within a few rows of each other; close-ups near
      their collage
    - sizes far apart, from the height map's ground (Chris, of sizing by
      detail: it "inflates logomarks and things that seem like they should
      be smaller"; "I really prefer Height Map's look")
    - sorted by colour, the black and white territories come first
  And opening (all modes): the opened piece is the largest of its set, and
  its whole set sits together round it.

  Usage: node scripts/test-world.mjs
*/
import {generateWorld, setsOf} from '../src/lib/world.ts'

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
const pieces = []
const counts = [22, 10, 7, 5, 3]
counts.forEach((n, p) => {
  for (let k = 0; k < n; k++) pieces.push({...shapes[(p + k) % 4], project: `/work/p${p}`, own: k === 0, id: `p${p}-${k}`, parent: k === 0 ? null : `p${p}-0`})
})
// Two collages with close-ups parented to them, no project.
for (const c of ['red-kettle', 'newform']) {
  pieces.push({w: 1000, h: 984, project: null, id: c, parent: null})
  for (let k = 0; k < 3; k++) pieces.push({...shapes[k % 4], project: null, id: `${c}-close-${k}`, parent: c})
}
// Loose pieces.
for (let k = 0; k < 6; k++) pieces.push({...shapes[k % 4], project: null, id: `loose-${k}`, parent: null})
// Importance, as the page sets it: a case study stands out; a close-up
// takes less ground than the collage it supports.
pieces.forEach((x) => {
  x.big = !!x.own
  x.weight = x.id.includes('-close-') ? 0.6 : 1
})
// Detail and colour, as the page measures them: made up, but repeatable.
pieces.forEach((x, i) => {
  x.detail = ((i * 37) % 101) / 100
  // A third black and white (below 1), the rest round the wheel (1-2).
  x.tone = i % 3 === 0 ? ((i * 13) % 100) / 100 : 1 + ((i * 29) % 100) / 100
})

const sets = setsOf(pieces)
check('a collage and its close-ups are one set, with no project', sets[pieces.findIndex((p) => p.id === 'red-kettle-close-2')] === sets[pieces.findIndex((p) => p.id === 'red-kettle')])
check('loose pieces are each their own', new Set(pieces.map((p, i) => (p.id.startsWith('loose') ? sets[i] : null)).filter(Boolean)).size === 6)

const boxOf = (out, i) => out.placed.find((q) => q.i === i)
const apart = (a, b) => Math.max(0, Math.max(a.c - (b.c + b.cw), b.c - (a.c + a.cw)), Math.max(a.r - (b.r + b.ch), b.r - (a.r + a.ch)))

// The page's grids: the biomes on a finer one, so the gap between them is a thin line.
for (const [name, grids] of [
  ['desktop', {heights: [20, 6], biomes: [40, 12], lands: [20, 6]}],
  ['phone', {heights: [6, 3], biomes: [15, 6], lands: [8, 4]}],
]) {
  for (const mode of ['heights', 'biomes', 'lands']) {
    const [cols, maxSpan] = grids[mode]
    for (const focus of [null, pieces.findIndex((p) => p.id === 'p1-3'), pieces.findIndex((p) => p.id === 'newform-close-1')]) {
      const tag = `${name}, ${mode}${focus === null ? '' : `, ${pieces[focus].id} opened`}`
      const t0 = performance.now()
      const out = generateWorld(pieces, {cols, mode, seed: 42, maxSpan, focus, focusRow: 3})
      const ms = performance.now() - t0
      const p = out.placed
      check(`${tag}: every piece placed`, p.length === pieces.length, `${p.length}/${pieces.length}`)
      const owner = new Map()
      let shared = 0
      let outside = 0
      for (const q of p) {
        if (q.c < 0 || q.c + q.cw > cols) outside++
        for (let r = q.r; r < q.r + q.ch; r++)
          for (let c = q.c; c < q.c + q.cw; c++) {
            const k = `${c},${r}`
            if (owner.has(k)) shared++
            owner.set(k, q.i)
          }
      }
      check(`${tag}: inside the columns, no cell shared`, shared === 0 && outside === 0, `${shared} shared, ${outside} outside`)
      check(`${tag}: quick enough to draw`, ms < 250, `${ms.toFixed(0)}ms`)

      if (mode === 'biomes') {
        let touching = 0
        for (const [k, i] of owner) {
          const [c, r] = k.split(',').map(Number)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const j = owner.get(`${c + dx},${r + dy}`)
              if (j !== undefined && sets[j] !== sets[i]) touching++
            }
        }
        check(`${tag}: two biomes never touch - a cell between`, touching === 0, `${touching} touching`)
        const covered = owner.size
        // A phone's one-cell gap is a bigger share of a narrow screen, so it packs looser.
        check(`${tag}: little empty land`, covered >= cols * out.rows * (cols >= 30 ? 0.55 : 0.45), `${Math.round((covered / (cols * out.rows)) * 100)}% of the cells covered`)
        const close = pieces.map((x, i) => (x.id.includes('-close-') ? i : -1)).filter((i) => i >= 0)
        // Not in the opened set, which gathers round the opened piece instead (checked below).
        const far = close.filter((i) => !out.family.includes(i) && apart(boxOf(out, i), boxOf(out, pieces.findIndex((x) => x.id === pieces[i].parent))) > 1)
        check(`${tag}: close-ups sit right beside their collage`, far.length === 0, far.map((i) => pieces[i].id).join(', '))
      }
      if (mode === 'lands') {
        // As tight as the height map: hardly an empty cell.
        // Above the last few rows, where any fill runs out raggedly.
        const coverOf = (w) => {
          const top = Math.max(1, w.rows - 6)
          let n = 0
          for (const q of w.placed) for (let r = q.r; r < Math.min(top, q.r + q.ch); r++) n += q.cw
          return n / (cols * top)
        }
        const hm = generateWorld(pieces, {cols, mode: 'heights', seed: 42, maxSpan: grids.heights[1], focus, focusRow: 3})
        check(`${tag}: as tight as the height map`, coverOf(out) >= Math.min(coverOf(hm), 0.9) - 0.07, `${Math.round(coverOf(out) * 100)}% of the cells covered, the height map ${Math.round(coverOf(hm) * 100)}%`)
        // A set lands together: its pieces within a few rows of each other.
        const spread = [...new Set(sets)].filter((k) => !k.startsWith('#solo') && !(focus !== null && k === sets[focus])).map((k) => {
          const rs = p.filter((q) => sets[q.i] === k).flatMap((q) => [q.r, q.r + q.ch])
          return {k, rows: Math.max(...rs) - Math.min(...rs), n: rs.length / 2}
        })
        const loosest = spread.sort((a, z) => z.rows / z.n - a.rows / a.n)[0]
        // Resting only, as with the connected patch below: an opened block can part a set.
        if (focus === null) check(`${tag}: each set lands together`, spread.every((x) => x.rows <= x.n * 1.5 + maxSpan * 2), `loosest ${loosest.k}: ${loosest.n} pieces over ${loosest.rows} rows`)
        // "I'm not seeing the projects that are together actually being in
        // their adjacent clusters": a set's pieces fill most of the box round them.
        const touch = (a, b) => a.c <= b.c + b.cw && b.c <= a.c + a.cw && a.r <= b.r + b.ch && b.r <= a.r + a.ch
        const broken = [...new Set(sets)].filter((k) => !k.startsWith('#solo')).filter((k) => {
          const qs = p.filter((q) => sets[q.i] === k)
          const seen = new Set([qs[0]])
          for (let grew = true; grew; ) {
            grew = false
            for (const q of qs) if (!seen.has(q) && [...seen].some((x) => touch(x, q))) (seen.add(q), (grew = true))
          }
          return seen.size < qs.length
        })
        // With a piece open, the opened block can run the width of a phone
        // and part a set above it from the rest below; that page is dropped
        // back then, so this is the resting world's promise.
        if (focus === null) check(`${tag}: each set is one connected patch`, broken.length === 0, broken.join(', '))
        if (focus !== null) {
          const withCard = generateWorld(pieces, {cols, mode, seed: 42, maxSpan, focus, focusRow: 3, card: {cw: Math.min(cols, 6), ch: 4}})
          const cd = withCard.card
          const f = boxOf(withCard, focus)
          const hit = cd && withCard.placed.some((q) => q.c < cd.c + cd.cw && cd.c < q.c + q.cw && q.r < cd.r + cd.ch && cd.r < q.r + q.ch)
          check(`${tag}: the project's card sits beside the opened piece, on nothing`, cd && !hit && apart(cd, f) === 0, cd ? `${cd.cw}x${cd.ch} at ${cd.c},${cd.r}` : 'no card')
        }
        const close = pieces.map((x, i) => (x.id.includes('-close-') ? i : -1)).filter((i) => i >= 0)
        const far = close.filter((i) => !out.family.includes(i) && apart(boxOf(out, i), boxOf(out, pieces.findIndex((x) => x.id === pieces[i].parent))) > maxSpan)
        check(`${tag}: close-ups near their collage`, far.length === 0, far.map((i) => pieces[i].id).join(', '))
        if (focus === null) {
          const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
          // The dealt hand: the projects' patches first.
          const startOf = (k) => Math.min(...p.filter((q) => sets[q.i] === k).map((q) => q.r))
          const studies = [...new Set(sets)].filter((k) => k.startsWith('/'))
          // The first band of patches is all projects; a loose piece may fill a
          // hole among them lower down, which is what keeps the fill tight.
          const band = Math.max(3, Math.round(cols / 4))
          const early = p.filter((q) => q.r < band && sets[q.i].startsWith('#solo')).length
          const meanRow = (f) => mean(p.filter(f).map((q) => q.r))
          const pm = meanRow((q) => studies.includes(sets[q.i]))
          const lm = meanRow((q) => sets[q.i].startsWith('#solo'))
          check(`${tag}: case studies first, as the portfolio deals`, early === 0 && pm < lm, `${early} loose piece(s) in the first ${band} rows; mean row: projects ${pm.toFixed(1)}, loose ${lm.toFixed(1)}`)
          const widths = p.map((q) => q.cw)
          check(`${tag}: sizes far apart, as on the height map`, Math.max(...widths) >= Math.min(...widths) * Math.min(3, maxSpan - 1), `${Math.min(...widths)} to ${Math.max(...widths)} cells wide`)
          const col = generateWorld(pieces, {cols, mode, seed: 42, maxSpan, sort: 'colour'})
          const rowOf = (grey) => mean(col.placed.filter((q) => (pieces[q.i].tone < 1) === grey && sets[q.i].startsWith('#solo')).map((q) => q.r))
          check(`${tag}: by colour, black and white first`, rowOf(true) < rowOf(false), `rows ${rowOf(true).toFixed(1)} vs ${rowOf(false).toFixed(1)}`)
        }
      }
      if (focus !== null) {
        const fam = out.family
        const f = boxOf(out, focus)
        check(`${tag}: the opened piece is the largest of its set`, fam.every((i) => i === focus || boxOf(out, i).cw <= f.cw), `${f.cw} cells wide`)
        const far = fam.filter((i) => apart(boxOf(out, i), f) > Math.max(6, maxSpan * 2))
        check(`${tag}: and its set sits together round it`, far.length === 0, `${far.length} far away`)
      }
      if (focus === null && mode === 'lands') {
        // A photograph on a phone never at the smallest size.
        const photos = pieces.map((x, i) => (i % 4 === 1 ? i : -1)).filter((i) => i >= 0)
        const tagged = pieces.map((x, i) => ({...x, least: photos.includes(i) ? 2 : 1}))
        const w = generateWorld(tagged, {cols, mode, seed: 42, maxSpan})
        const tiny = w.placed.filter((q) => photos.includes(q.i) && q.cw < 2)
        const small = p.filter((q) => pieces[q.i].big && q.cw < Math.ceil((maxSpan * 2) / 3))
        check(`${tag}: a case study never squeezed small into a hole`, small.length === 0, small.map((q) => `${pieces[q.i].id} ${q.cw}`).join(', '))
        check(`${tag}: a piece given a least size is never smaller`, tiny.length === 0 && w.placed.length === pieces.length, `${tiny.length} too small`)
      }
      if (focus === null && mode !== 'biomes') {
        const widthOf = (f) => {
          const w = p.filter((q) => f(pieces[q.i])).map((q) => q.cw)
          return w.reduce((x, y) => x + y, 0) / w.length
        }
        // "less important tiles are getting more area"
        check(`${tag}: the case studies the larger, the close-ups the smaller`, widthOf((x) => x.big) > widthOf((x) => !x.big) && widthOf((x) => x.weight < 1) < widthOf((x) => x.big), `${widthOf((x) => x.big).toFixed(1)} vs ${widthOf((x) => !x.big).toFixed(1)} cells wide, close-ups ${widthOf((x) => x.weight < 1).toFixed(1)}`)
      }
      if (focus === null && mode === 'heights') {
        const firstRest = p.filter((q) => !pieces[q.i].own).reduce((m, q) => Math.min(m, q.r * cols + q.c), Infinity)
        const lastOwn = p.filter((q) => pieces[q.i].own).reduce((m, q) => Math.max(m, q.r * cols + q.c), -1)
        check(`${tag}: case studies dealt first`, lastOwn < firstRest + cols * 2, `the last case study at cell ${lastOwn}, the first other piece at ${firstRest}`)
      }
      if (focus === null) {
        const again = generateWorld(pieces, {cols, mode, seed: 42, maxSpan})
        const other = generateWorld(pieces, {cols, mode, seed: 43, maxSpan})
        check(`${tag}: the same seed gives the same world, another another`, JSON.stringify(again.placed) === JSON.stringify(p) && JSON.stringify(other.placed) !== JSON.stringify(p))
      }
    }
  }
}

/*
  Lands on half-height rows, as the page draws it - so a box can follow its
  picture's shape twice as closely (the pictures are already cropped to
  their art; a box of the wrong shape was leaving strips of white).
*/
for (const [name, cols, maxSpan] of [
  ['desktop', 20, 6],
  ['phone', 8, 4],
]) {
  for (const focus of [null, pieces.findIndex((x) => x.id === 'p1-3')]) {
    const tag = `${name}, lands on half rows${focus === null ? '' : ', opened'}`
    const o = generateWorld(pieces, {cols, mode: 'lands', seed: 42, maxSpan, rowsPerCell: 2, focus, focusRow: 6, card: focus === null ? null : {cw: 6, ch: 7}})
    const cellsOf = new Map()
    let shared = 0
    for (const q of o.placed) for (let r = q.r; r < q.r + q.ch; r++) for (let c = q.c; c < q.c + q.cw; c++) (cellsOf.has(`${c},${r}`) && shared++, cellsOf.set(`${c},${r}`, q.i))
    check(`${tag}: every piece placed, no cell shared`, o.placed.length === pieces.length && shared === 0, `${o.placed.length}, ${shared} shared`)
    let box = 0
    let art = 0
    for (const q of o.placed) {
      const ratio = pieces[q.i].w / pieces[q.i].h
      const br = (q.cw * 2) / q.ch
      box += q.cw * q.ch
      art += q.cw * q.ch * Math.min(ratio / br, br / ratio)
    }
    check(`${tag}: the pictures fill their boxes`, art / box >= 0.92, `${Math.round((art / box) * 100)}%`)
    if (focus !== null) check(`${tag}: the card beside the opened piece`, !!o.card && apart(o.card, boxOf(o, focus)) === 0)
  }
}

// The projects in the order dragged in Studio: given an order, the case
// studies' patches start in it.
{
  const order = ['/work/p3', '/work/p0', '/work/p4', '/work/p1', '/work/p2']
  const ordered = pieces.map((x) => ({...x, order: x.own ? order.indexOf(x.project) : undefined}))
  const o = generateWorld(ordered, {cols: 20, mode: 'lands', seed: 42, maxSpan: 6})
  // In the order laid - the patches snake, so this is not reading order.
  const start = (k) => o.placed.findIndex((q) => ordered[q.i].own && ordered[q.i].project === k)
  const firsts = order.map(start)
  check('lands: the case studies in the order dragged in Studio', firsts.every((v, k) => k === 0 || v > firsts[k - 1]), firsts.join(' < '))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
