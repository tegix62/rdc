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
*/
import {readFileSync, writeFileSync, existsSync} from 'node:fs'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
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

const seedsOf = (data) =>
  Object.fromEntries(Object.entries(data?.pre ?? {}).filter(([, v]) => typeof v?.seed === 'number').map(([cols, v]) => [cols, v.seed]))

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
  console.log(`${key}: ${JSON.stringify(seeds)}`)
}
writeFileSync(OUT, JSON.stringify(layouts, null, 2) + '\n')
console.log(`${kept} page(s) frozen in ${OUT}`)
