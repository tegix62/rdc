/*
  TRACE THE PIECES' SHAPES - for the lands engine's shape-aware packing and
  visual weight (lib/world.ts; Chris: "Let's give these ideas a shot!").

  For every grid item's tile picture, once: its colour (hue and how coloured,
  for More like this), its outline as a 24 x 24 grid of
  where its ink is (only a picture with transparency has empty corners
  another piece can tuck into), and how heavy it looks - the share of it
  that is dark ink, 0 to 1 - so the engine can give a light line drawing a
  little more room than a dense dark photograph, and keep heavy pieces
  apart.

  Kept in src/data/shapes.json, keyed by asset, so the build downloads
  nothing: only pictures not traced yet are fetched, each once, at 48px (a
  few KB) from Sanity's CDN. Run by hand (shapes.yml), never on a schedule -
  the October bandwidth lesson (scripts/test-workflows-no-pictures.mjs).

  Usage: node scripts/trace-shapes.mjs   (SANITY_API_TOKEN optional)
*/
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs'
import sharp from 'sharp'

const OUT = 'src/data/shapes.json'
const G = 24
const PROJECT = '8337vjtf'
const DATASET = 'production'

const Q = `*[_type == "caseStudy" && !(_id in path("drafts.**"))]{
  "a": coalesce(thumbnail.asset, mainImage.asset)->{_id, url, "alpha": metadata.hasAlpha, "opaque": metadata.isOpaque}
}.a`
const res = await fetch(`https://${PROJECT}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(Q)}`, {
  headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {},
})
const assets = ((await res.json()).result ?? []).filter((a) => a?._id && a.url)
const seen = new Map(assets.map((a) => [a._id, a]))

const have = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
let fetched = 0
let failed = 0
for (const a of seen.values()) {
  // Traced before the reader's v3 (symmetry, facing, line or mass): again.
  if (have[a._id] && have[a._id].v === 3) continue
  if (/\.gif($|\?)/.test(a.url)) continue
  try {
    const r = await fetch(`${a.url}?w=96&h=96&fit=max&fm=png`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const {data, info} = await sharp(Buffer.from(await r.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject: true})
    const {width: w, height: h} = info
    const cells = new Array(G * G).fill(0)
    const counts = new Array(G * G).fill(0)
    let ink = 0
    // Its colour: the hue of its coloured pixels (a circular mean, by saturation) and how coloured it is.
    let hx = 0
    let hy = 0
    let sat = 0
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4
        const alpha = data[p + 3] / 255
        const lum = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255
        ink += alpha * (1 - lum)
        const [R, G2, B] = [data[p] / 255, data[p + 1] / 255, data[p + 2] / 255]
        const mx = Math.max(R, G2, B)
        const mn = Math.min(R, G2, B)
        const sv = mx ? (mx - mn) / mx : 0
        if (alpha > 0.5 && mx > 0.08) {
          let hue = 0
          if (mx !== mn) hue = mx === R ? ((G2 - B) / (mx - mn)) % 6 : mx === G2 ? (B - R) / (mx - mn) + 2 : (R - G2) / (mx - mn) + 4
          const a = (hue * 60 * Math.PI) / 180
          hx += Math.cos(a) * sv
          hy += Math.sin(a) * sv
          sat += sv
        }
        const c = Math.min(G - 1, Math.floor((x / w) * G)) + Math.min(G - 1, Math.floor((y / h) * G)) * G
        cells[c] += alpha
        counts[c]++
      }
    /*
      THE READER (v3), for pacing, facing in, anchors and lockups (lib/world.ts):
        y  symmetry, 0-1: how alike its left and right halves are - a crest
           or a badge near 1, an illustration lower;
        f  facing, -1 to 1: which way its weight leans across its box, for
           a piece that isn't symmetric - right is positive;
        e  line or mass, 0-1: the share of its ink at an edge - line work
           high, a solid mark or a photograph low.
    */
    const inkAt = (x, y) => {
      const p = (y * w + x) * 4
      return (data[p + 3] / 255) * (1 - (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255)
    }
    let diff = 0
    let both = 0
    let mx = 0
    let mass = 0
    let edges = 0
    let inked = 0
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = inkAt(x, y)
        const m = inkAt(w - 1 - x, y)
        diff += Math.abs(v - m)
        both += v + m
        mx += v * (x + 0.5)
        mass += v
        if (v > 0.35) {
          inked++
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const X = x + dx
            const Y = y + dy
            return X < 0 || Y < 0 || X >= w || Y >= h || inkAt(X, Y) < 0.2
          })
          if (near) edges++
        }
      }
    const sym = both ? 1 - diff / both : 1
    const cx = mass ? mx / mass / w : 0.5
    const entry = {v: 3, k: Math.round((ink / (w * h)) * 100) / 100}
    entry.y = Math.round(sym * 100) / 100
    entry.f = sym > 0.85 ? 0 : Math.round(Math.max(-1, Math.min(1, (cx - 0.5) * 6)) * 100) / 100
    entry.e = inked ? Math.round((edges / inked) * 100) / 100 : 0
    const n = w * h
    entry.s = Math.round((sat / n) * 100) / 100
    entry.h = Math.round(((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360)
    // Only a picture with transparency has corners to give: its cells with any real ink.
    if (a.alpha && !a.opaque) {
      let bits = ''
      for (let i = 0; i < G * G; i++) bits += cells[i] / Math.max(1, counts[i]) > 0.2 ? '1' : '0'
      let hex = ''
      for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16)
      entry.m = hex
    }
    have[a._id] = entry
    fetched++
  } catch (e) {
    failed++
    console.log(`could not trace ${a._id}: ${String(e).slice(0, 120)}`)
  }
}
mkdirSync('src/data', {recursive: true})
const sorted = Object.fromEntries(Object.keys(have).sort().map((k) => [k, have[k]]))
writeFileSync(OUT, JSON.stringify(sorted, null, 0).replace(/},"/g, '},\n"') + '\n')
console.log(`${assets.length} pictures, ${fetched} traced now, ${Object.keys(sorted).length} in ${OUT}${failed ? `, ${failed} failed` : ''}`)
