/*
  FREEZE THE LAYOUTS - keep the lands engine's chosen layouts, so a new grid
  item does not reshuffle a page (LandsView, FROZEN LAYOUTS). Chris: "is
  this all going to get messed with whenever I introduce a new grid item!"

  Reads each page's field data from the site (the homepage, the All view,
  and every case study the All view names), takes the seed the build chose
  for each grid (a phone's 8 columns, a wide screen's 14), and writes them
  to src/data/layouts.json. From then on every build lays those pages out
  with those seeds; run this again to take a new look.

  Usage: node scripts/freeze-layouts.mjs [base]   (default: the preview)
         node scripts/freeze-layouts.mjs --start-over home,all
*/
import {readFileSync, writeFileSync, existsSync} from 'node:fs'

const BASE = (process.argv[2]?.startsWith('http') ? process.argv[2] : 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const OUT = 'src/data/layouts.json'

async function fieldOf(path) {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) return null
  const html = await r.text()
  const m = html.match(/<script type="application\/json" id="wd-data">([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

// Each piece's key, as lib/world.ts layoutKeys makes it: its id, and "#2" on for a second of the same.
const keysOf = (pieces) => {
  const seen = new Map()
  return pieces.map((p, i) => {
    const k = p.id ?? p.slug ?? p.title ?? String(i)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return n > 1 ? `${k}#${n}` : k
  })
}
// Each grid's seed, and every piece's box in it - so a new piece later is fitted in, not the page re-laid.
const seedsOf = (data) => {
  const keys = keysOf(data?.pieces ?? [])
  return Object.fromEntries(
    Object.entries(data?.pre ?? {})
      .filter(([, v]) => typeof v?.seed === 'number')
      .map(([cols, v]) => [cols, {seed: v.seed, at: Object.fromEntries(v.placed.map(([i, c, r, cw, ch]) => [keys[i], [c, r, cw, ch].map((x) => Math.round(x * 100) / 100)]))}]),
  )
}

/*
  START OVER: "node scripts/freeze-layouts.mjs --start-over home,all" (or
  "everything") forgets those pages' layouts, so the next build finds the
  best one afresh. Freeze again once the new look is approved.
*/
const over = process.argv.indexOf('--start-over')
if (over > -1) {
  const which = (process.argv[over + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const layouts = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
  for (const k of Object.keys(layouts)) if (which.includes('everything') || which.includes(k)) delete layouts[k]
  writeFileSync(OUT, JSON.stringify(layouts, null, 2) + '\n')
  console.log(`forgot: ${which.join(', ')}; kept: ${Object.keys(layouts).join(', ') || 'nothing'}`)
  process.exit(0)
}

const layouts = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const home = await fieldOf('/')
const all = await fieldOf('/portfolio')
const pages = [
  ['home', home],
  ['all', all],
]
for (const href of Object.keys(all?.names ?? {})) pages.push([href, await fieldOf(href)])
let kept = 0
for (const [key, data] of pages) {
  const seeds = seedsOf(data)
  if (!Object.keys(seeds).length) {
    console.log(`no layout found for ${key}`)
    continue
  }
  layouts[key] = seeds
  kept++
  console.log(`${key}: ${Object.entries(seeds).map(([cols, v]) => `${cols} columns, ${Object.keys(v.at).length} pieces`).join('; ')}`)
}
writeFileSync(OUT, JSON.stringify(layouts, null, 2) + '\n')
console.log(`${kept} page(s) frozen in ${OUT}`)
