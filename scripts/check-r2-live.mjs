/*
  Are the live pages' pictures coming from R2? For each page: how many
  picture addresses point at img.rumeaudesign.co and how many still at /img/,
  then a sample of the R2 ones fetched for real (a stored file each - no
  Function runs, so this costs nothing against the daily count).

  Usage: node scripts/check-r2-live.mjs [https://rumeaudesign.co]
*/
import {HOST} from './lib/r2-images.mjs'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const PAGES = ['/', '/portfolio/', '/about/', '/video/', '/collage/', '/merchfolio/']
const R2 = /https:(?:\\\/|\/){2}img\.rumeaudesign\.co(?:\\\/|\/)[^"'\s)<>,]+/g
const OLD = /(?:\\\/|\/)img(?:\\\/|\/)v2(?:\\\/|\/)/g

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures++
}

const seen = new Set()
for (const p of PAGES) {
  const res = await fetch(BASE + p)
  const html = await res.text()
  const r2 = [...html.matchAll(R2)].map((m) => m[0].replace(/\\\//g, '/'))
  const old = (html.match(OLD) ?? []).length
  r2.forEach((u) => seen.add(u))
  check(`${p}: pictures from R2`, res.ok && (r2.length > 0 || old === 0), `HTTP ${res.status}, ${r2.length} from R2, ${old} through /img/`)
}

const sample = [...seen].sort(() => Math.random() - 0.5).slice(0, 25)
let good = 0
const bad = []
for (const u of sample) {
  const r = await fetch(u, {headers: {accept: 'image/avif,image/webp,image/*'}})
  await r.arrayBuffer()
  if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) good++
  else bad.push(`${r.status} ${u}`)
}
check(`a sample of ${sample.length} R2 pictures load`, sample.length > 0 && good === sample.length, bad.slice(0, 3).join(' | ') || `${good} of ${sample.length}, from ${HOST}`)

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
