/*
  Post-build: turns Astro's auto-injected `<link rel="stylesheet">` into a
  non-blocking load, without touching what gets served or how long it's
  cached - PageSpeed Insights flagged this exact tag ("Render-blocking
  requests", ~1.4s) on a single cold-cache page view, but astro.config.mjs
  already decided against inlining: the CSS is 75KB gzip, shared byte-for-
  byte across all 21 pages, so the moment a visitor loads a second page that
  bundle is already cached and inlining would mean re-sending it on every
  navigation. This gets the same render-blocking fix Lighthouse is asking
  for without giving that up - "preload as style, then flip its rel once it
  arrives" (the loadCSS pattern) makes the browser fetch the file
  asynchronously and apply it the instant it's in, still from the one cached
  URL every page already shares. A <noscript> fallback keeps the page
  correctly styled if JS is off or fails before this runs.

  Runs on Astro's OWN output rather than changing anything in src/ or
  astro.config.mjs, because Vite bundles this site's four separate CSS
  imports (three @fontsource files + global.css) into one physical chunk
  today - confirmed by debug-css-size.mjs - and that merge is an
  implementation detail of Astro's asset pipeline, not something this
  script should assume stays true. Rewriting the tag after the fact works
  no matter how many stylesheet links a future build emits or what their
  hrefs are.

  Astro's link tag has an exact, narrow shape - see
  node_modules/astro/dist/core/render/ssr-element.js's
  createStylesheetElement: always exactly `rel` then `href`, nothing else,
  via the same renderElement() every Astro-emitted tag goes through. That is
  what makes it safe to match literally rather than needing an HTML parser.

  KNOWN TRADE-OFF, not fixed by this script: deferring the ENTIRE stylesheet
  (not a small critical-CSS subset) risks a flash of unstyled content on a
  slow connection, since global.css governs the whole page's layout, nav,
  and fonts. This sandbox cannot render a browser to see whether that flash
  is visible in practice - Chris needs to eyeball the deployed site.

  Usage: node scripts/make-css-non-blocking.mjs [dist]
*/
import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs'
import path from 'node:path'

const LINK_RE = /<link rel="stylesheet" href="([^"]+)">/g

export function makeNonBlocking(html) {
  return html.replace(
    LINK_RE,
    (_match, href) =>
      `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'">` +
      `<noscript><link rel="stylesheet" href="${href}"></noscript>`,
  )
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.html')) out.push(full)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] ?? 'dist'
  const htmlFiles = []
  walk(dist, htmlFiles)

  let changed = 0
  let tagsRewritten = 0
  for (const f of htmlFiles) {
    const html = readFileSync(f, 'utf8')
    const rewritten = makeNonBlocking(html)
    if (rewritten !== html) {
      changed += 1
      tagsRewritten += (html.match(LINK_RE) ?? []).length
      writeFileSync(f, rewritten)
    }
  }
  console.log(`make-css-non-blocking: rewrote ${tagsRewritten} stylesheet link(s) across ${changed} of ${htmlFiles.length} page(s)`)
}
