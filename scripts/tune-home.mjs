/*
  TUNE THE HOMEPAGE FIELD OFFLINE. The homepage's apparel mix is laid out
  by lib/world.ts in the browser; this runs the same engine on the same
  pieces in node, at a phone's and a wide screen's width, and measures what
  scripts/test-world-page.mjs measures - the merch's size against the rest,
  and the holes (points more than 30px from every piece) - so a change to
  the sizing can be tried in seconds instead of a deploy.

  The pieces: the HOME-DATA line test-world-page.mjs prints, saved to a file.
  Usage: node scripts/tune-home.mjs home-data.json
*/
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'

const out = await build({entryPoints: ['src/lib/world.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral'})
const {generateWorld} = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)

const raw = readFileSync(process.argv[2], 'utf8').trim().replace(/^.*?HOME-DATA /, '')
const data = JSON.parse(raw)
const STEPS = {desktop: [20, 17, 14, 12, 10], phone: [10, 9, 8, 7, 6]}

// As LandsView's draw(): the same columns, widest piece and floors.
export function layout(width, phone, rule = {}) {
  const cols = (phone ? STEPS.phone : STEPS.desktop)[2]
  const maxSpan = phone ? (cols > STEPS.phone[2] ? Math.floor(cols / 2) : Math.ceil(cols / 2)) : Math.round(cols * 0.3)
  const cell = width / cols
  const kr = 2
  const sub = data.pieces.map((p) => ({
    ...p,
    big: rule.big ? rule.big(p, {phone, maxSpan}) : p.big || (!phone && !!p.merchBig),
    least: rule.least
      ? rule.least(p, {phone, maxSpan})
      : p.kind === 'result'
        ? phone ? Math.max(2, maxSpan - 1) : 2
        : p.kind === 'video' || p.video
          ? 2
          : phone && p.merchBig
            ? maxSpan
            : phone && p.photo ? 2 : 1,
  }))
  const res = generateWorld(sub, {cols, mode: 'lands', seed: 4187, shuffled: false, maxSpan, rowsPerCell: kr, focus: null, focusRow: 0, card: null, tune: {simple: true, tallMarks: data.grow}})
  const rects = res.placed.map((q) => ({i: q.i, x: q.c * cell, y: (q.r * cell) / kr, w: q.cw * cell, h: (q.ch * cell) / kr}))
  return {rects, cell}
}

export function measure(rects, width, height) {
  const span = Math.min(height * 2, Math.max(...rects.map((r) => r.y + r.h)))
  let pts = 0
  let holes = 0
  for (let y = 10; y < span; y += 10)
    for (let x = 10; x < width - 10; x += 10) {
      pts++
      if (!rects.some((r) => x > r.x - 30 && x < r.x + r.w + 30 && y > r.y - 30 && y < r.y + r.h + 30)) holes++
    }
  const near = rects.filter((r) => r.y < height * 0.8)
  const isMerch = (r) => data.pieces[r.i].cat === 'merch-apparel'
  const area = (l) => (l.length ? l.reduce((s, r) => s + r.w * r.h, 0) / l.length : 0)
  return {holes: Math.round((holes / pts) * 1000) / 10, ratio: Math.round((area(near.filter(isMerch)) / Math.max(1, area(near.filter((r) => !isMerch(r))))) * 100) / 100}
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, w, h, phone] of [['phone 430', 430 - 4, 932, true], ['phone 390', 390 - 4, 844, true], ['desktop', 1440, 900, false]]) {
    const {rects} = layout(w, phone)
    console.log(name, JSON.stringify(measure(rects, w, h - 400)))
  }
}
