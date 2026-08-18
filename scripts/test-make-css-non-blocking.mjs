/*
  makeNonBlocking() runs on every page of every production build, rewriting
  the one tag that gets every page its CSS - a regex that matches too
  little leaves the render-blocking link in place (no fix); one that
  matches too much or mangles the href leaves a page with no stylesheet at
  all, silently, since a missing <link> throws nothing.

  Usage: node scripts/test-make-css-non-blocking.mjs
*/
import {makeNonBlocking} from './make-css-non-blocking.mjs'

let failures = 0
const check = (name, actual, expected) => {
  if (actual === expected) console.log(`ok    ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  }
}

const HREF = '/_astro/about.DREPSuS_.css'
const tag = `<link rel="stylesheet" href="${HREF}">`
const page = `<html><head><title>x</title>${tag}</head><body></body></html>`

const rewritten = makeNonBlocking(page)

check(
  'the original blocking link no longer appears outside the noscript fallback',
  rewritten.replace(/<noscript>.*?<\/noscript>/g, '').includes(tag),
  false,
)
check(
  'a preload-as-style link for the same href is present',
  rewritten.includes(`<link rel="preload" as="style" href="${HREF}" onload="this.onload=null;this.rel='stylesheet'">`),
  true,
)
check(
  'the noscript fallback carries the same href',
  rewritten.includes(`<noscript><link rel="stylesheet" href="${HREF}"></noscript>`),
  true,
)
check(
  'the preload tag comes before the noscript fallback',
  rewritten.indexOf('rel="preload"') < rewritten.indexOf('<noscript>'),
  true,
)
check(
  'a page with no stylesheet link is left untouched',
  makeNonBlocking('<html><head><title>x</title></head><body></body></html>'),
  '<html><head><title>x</title></head><body></body></html>',
)

// Two pages, two different hrefs - proves the replacement is per-match, not
// a single captured href reused everywhere (a plausible copy-paste bug in
// a one-shot regex.replace).
const twoLinks =
  `<link rel="stylesheet" href="/_astro/a.css">` +
  `<link rel="stylesheet" href="/_astro/b.css">`
const twoRewritten = makeNonBlocking(twoLinks)
check(
  'two distinct hrefs on the same page both get their own preload tag',
  twoRewritten.includes('href="/_astro/a.css"') && twoRewritten.includes('href="/_astro/b.css"'),
  true,
)
check(
  'neither href gets swapped onto the other tag',
  twoRewritten.includes('preload" as="style" href="/_astro/a.css"') &&
    twoRewritten.includes('preload" as="style" href="/_astro/b.css"'),
  true,
)

// Astro's own tag has no other attributes (see ssr-element.js) - a link
// that does carry one, like media="print", is NOT this tag and must be
// left alone rather than silently matched and stripped of that attribute.
const withMedia = `<link rel="stylesheet" href="/x.css" media="print">`
check(
  'a stylesheet link with an extra attribute is not touched',
  makeNonBlocking(withMedia),
  withMedia,
)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
