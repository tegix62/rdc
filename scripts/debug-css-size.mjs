/*
  One-off: real numbers for the "inline CSS or keep it cached" decision.

  Usage: node scripts/debug-css-size.mjs [dist]
*/
import {readFileSync, readdirSync, statSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
import path from 'node:path'

const dist = process.argv[2] ?? 'dist'

const cssFiles = []
const htmlFiles = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (entry.endsWith('.css')) cssFiles.push(full)
    else if (entry.endsWith('.html')) htmlFiles.push(full)
  }
}
walk(dist)

console.log(`\n${cssFiles.length} CSS file(s) in the build:\n`)
let totalRaw = 0
let totalGz = 0
for (const f of cssFiles) {
  const raw = readFileSync(f)
  const gz = gzipSync(raw)
  totalRaw += raw.length
  totalGz += gz.length
  console.log(`  ${f}\n    raw: ${(raw.length / 1024).toFixed(1)} KiB   gzip: ${(gz.length / 1024).toFixed(1)} KiB`)
}
console.log(`\nTotal: raw ${(totalRaw / 1024).toFixed(1)} KiB, gzip ${(totalGz / 1024).toFixed(1)} KiB`)

// How many HTML pages actually link the/a stylesheet, to confirm it's shared.
let linked = 0
const hrefsSeen = new Set()
for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8')
  const m = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)
  if (m) {
    linked += 1
    hrefsSeen.add(m[1])
  }
}
console.log(`\n${linked} of ${htmlFiles.length} HTML pages link a stylesheet.`)
console.log(`Distinct stylesheet href(s) referenced: ${hrefsSeen.size} -> ${[...hrefsSeen].join(', ')}`)
