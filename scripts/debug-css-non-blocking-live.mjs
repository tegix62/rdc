/*
  One-off: confirm the non-blocking CSS rewrite reached production. This
  sandbox cannot reach the live site directly (network policy), so this
  runs from GitHub Actions instead, same as debug-pixel-geofence-live.mjs.

  Usage: node scripts/debug-css-non-blocking-live.mjs [url]
*/
const url = process.argv[2] ?? 'https://rumeaudesign.co/'
const res = await fetch(url, {cache: 'no-store'})
const html = await res.text()

console.log(`\nFetched ${url} - HTTP ${res.status}\n`)
console.log(`preload-as-style link present: ${html.includes('rel="preload" as="style"')}`)
console.log(`noscript fallback present: ${html.includes('<noscript><link rel="stylesheet"')}`)

const naked = html.replace(/<noscript>.*?<\/noscript>/g, '').match(/<link rel="stylesheet" href="[^"]+">/)
console.log(`blocking stylesheet link left outside noscript: ${naked ? naked[0] : '(none)'}`)

const stamp = html.match(/name="build-commit" content="([^"]*)"/)?.[1]
console.log(`build-commit: ${stamp ?? '(none found)'}`)
