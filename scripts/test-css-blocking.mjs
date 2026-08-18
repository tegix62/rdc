/*
  Asserts every built page loads its stylesheet with a plain, BLOCKING
  <link rel="stylesheet">. That sounds like a performance bug and is
  deliberately the opposite.

  WHY THIS GUARD EXISTS

  On 18 August 2026 the stylesheet was made non-blocking to clear PageSpeed's
  "render-blocking requests" finding (~1,410 ms estimated saving): the link
  was rewritten post-build into `rel="preload" as="style"` plus an onload
  handler flipping it back to `rel="stylesheet"`, with a <noscript>
  fallback. Mechanically it worked - verified live. It was still wrong.

  PageSpeed's next run measured Cumulative Layout Shift 1.001 on the
  homepage. "Poor" starts at 0.25. The cause is inherent to the technique,
  not a bug in it: with no stylesheet applied at first paint the page renders
  in browser default styles, and when 75 KiB gzip of CSS governing the nav,
  layout, and fonts arrives ~480 ms later, every element on the page moves
  at once.

  That is a bad trade in both directions. CLS is a Core Web Vital and feeds
  search ranking. "Render-blocking requests" is an advisory diagnostic that
  does not - its "estimated savings" is a model of a single cold-cache page
  view, and this site's CSS is one fingerprinted file shared byte-for-byte
  by all 21 pages, so a real visitor pays for it once per session.

  WHEN DEFERRING BECOMES CORRECT

  Only after above-the-fold CSS is extracted per template and inlined, so
  the first paint is already correct and the deferred remainder changes
  nothing visible. astro.config.mjs has said that since the original
  decision. Deferring without that step is the thing this guard blocks.

  Usage: node scripts/test-css-blocking.mjs [dist]
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
let blocking = 0

for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8')

  /*
    Any of these means the stylesheet is not applying at first paint. Checked
    as separate signatures rather than one loose pattern because each is a
    different way of arriving at the same regression: the preload+swap
    rewrite, a hand-written media="print" swap, and Astro's own
    `rel="preload"` output if a future config change starts emitting it.
  */
  if (/rel="preload"\s+as="style"/.test(html) || /as="style"\s+rel="preload"/.test(html)) {
    failures += 1
    console.log(`FAIL  ${f} preloads its stylesheet instead of loading it blocking`)
  }
  if (/<link[^>]+rel="stylesheet"[^>]+media="print"/.test(html)) {
    failures += 1
    console.log(`FAIL  ${f} uses the media="print" swap trick on its stylesheet`)
  }
  if (/<link[^>]+rel="stylesheet"[^>]+onload=/.test(html)) {
    failures += 1
    console.log(`FAIL  ${f} has an onload handler on its stylesheet link`)
  }

  // And the tag that SHOULD be there. A page with no stylesheet at all is
  // the other failure this catches - it renders unstyled with nothing
  // throwing.
  const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
  if (/<link rel="stylesheet" href="[^"]+">/.test(outsideNoscript)) blocking += 1
  else {
    failures += 1
    console.log(`FAIL  ${f} has no plain blocking <link rel="stylesheet">`)
  }
}

console.log(`\n${blocking} of ${htmlFiles.length} page(s) load their stylesheet blocking, as intended`)
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.')
process.exit(failures ? 1 : 0)
