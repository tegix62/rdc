/*
  make-css-non-blocking.mjs runs as a step of `npm run build`, not as part
  of the Astro/Vite pipeline itself - nothing stops a future refactor of the
  build script from dropping that step, or reordering it before astro
  build runs (before dist/ even has the tag to rewrite), and the site would
  still deploy looking fine. This checks the actual BUILT output, same
  convention as test-headers.mjs, so a dropped step fails the build instead
  of quietly bringing the render-blocking link back.

  Usage: node scripts/test-non-blocking-css-applied.mjs [dist]
*/
import {readFileSync, readdirSync, statSync} from 'node:fs'
import path from 'node:path'

const dist = process.argv[2] ?? 'dist'

const htmlFiles = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (entry.endsWith('.html')) htmlFiles.push(full)
  }
}
walk(dist)

let failures = 0
let pagesWithPreload = 0

for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8')

  const naked = html.replace(/<noscript>.*?<\/noscript>/g, '').match(/<link rel="stylesheet" href="[^"]+">/)
  if (naked) {
    failures += 1
    console.log(`FAIL  ${f} still has a blocking stylesheet link outside noscript: ${naked[0]}`)
  }

  if (html.includes('rel="preload" as="style"')) {
    pagesWithPreload += 1
    if (!html.includes('<noscript><link rel="stylesheet"')) {
      failures += 1
      console.log(`FAIL  ${f} has a preload swap but no noscript fallback`)
    }
  }
}

if (pagesWithPreload === 0) {
  failures += 1
  console.log(`FAIL  no page under ${dist} has the preload-swap pattern - did the build step run at all?`)
} else {
  console.log(`${pagesWithPreload} of ${htmlFiles.length} page(s) carry the non-blocking CSS pattern`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
