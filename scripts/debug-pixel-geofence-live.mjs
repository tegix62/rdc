/*
  One-off: confirm the middleware didn't break the default (non-geofenced)
  case on the real deployed site. GitHub Actions runners resolve as
  non-EU/UK/EEA, so this proves "most visitors still get the pixel" - it
  cannot prove the EU-stripping path itself, since this sandbox has no way
  to make a request Cloudflare's edge sees as originating from a geofenced
  country. That gap is stated plainly rather than papered over.

  Usage: node scripts/debug-pixel-geofence-live.mjs [url]
*/
const url = process.argv[2] ?? 'https://rumeaudesign.co/'
const res = await fetch(url, {cache: 'no-store'})
const html = await res.text()

console.log(`\nFetched ${url} - HTTP ${res.status}\n`)
console.log(`data-meta-pixel script present: ${html.includes('data-meta-pixel="true"')}`)
console.log(`fbevents.js referenced: ${html.includes('fbevents.js')}`)

const stamp = html.match(/name="build-commit" content="([^"]*)"/)?.[1]
console.log(`build-commit: ${stamp ?? '(none found)'}`)
