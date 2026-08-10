/*
  Reads the BUILT HTML and asserts every page carries what it is supposed to.

  WHY THIS EXISTS SEPARATELY FROM test-meta.mjs

  test-meta.mjs proves the composition functions are right. It cannot prove the
  templates call them. Those are different failures, and the second one is the
  one that actually shipped: og:image was correct on the two templates that
  passed it and simply absent from the other nine pages, and nothing noticed for
  weeks because the audit measures bytes, LCP and CLS and never looks at <head>.

  So this checks the artefact. Every assertion here is something whose absence
  is invisible on the site:

    <title> carries the site name  a bookmark or a search result that says
                                   "About" and nothing else
    a meta description             and no two pages sharing one
    og:image                       a link pasted into Slack rendering as a bare
                                   text card
    a canonical                    the preview competing with the real site
    exactly one <h1>               /portfolio had none at all
    a skip link                    keyboard users tabbing the nav on every page

  Runs after `npm run build`, against dist/. No network: the build already did
  the fetching.

  Usage: node scripts/test-head.mjs [dir]     (default: dist)
*/
import {readdir, readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.resolve(root, process.argv[2] ?? 'dist')

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

// --- collect the built pages -------------------------------------------------
const pages = []
const walk = async (d) => {
  for (const entry of await readdir(d, {withFileTypes: true})) {
    const full = path.join(d, entry.name)
    if (entry.isDirectory()) await walk(full)
    else if (entry.name.endsWith('.html')) pages.push(full)
  }
}
try {
  await walk(dir)
} catch {
  console.log(`FAIL  no built output at ${path.relative(root, dir) || dir} - run \`npm run build\` first`)
  process.exit(1)
}
pages.sort()

if (!pages.length) {
  console.log(`FAIL  ${dir} contains no HTML`)
  process.exit(1)
}

const SITE_NAME_PATTERN = /Rumeau Design/i

/*
  Attribute values come out of the HTML escaped, and every value here is then
  pattern-matched - so they have to be decoded first.

  This is not hypothetical tidiness. It is the bug the checker shipped with:
  Astro escapes `&` in an attribute, so a Sanity image URL renders as
  `...w=1200&#38;h=630&#38;fm=jpg`, and the test for `[?&]fm=jpg` matched
  nothing. The checker reported every single og:image as not forced to JPEG.
  Found by pointing it at a hand-built correct page and requiring silence -
  see the note at the top of this file about why that step is not optional.

  Both the named and the numeric forms, because Astro has used `&#38;` and
  hand-written markup uses `&amp;`.
*/
const decode = (value) =>
  value == null
    ? value
    : value
        .replace(/&(?:amp|#38|#x26);/gi, '&')
        .replace(/&(?:quot|#34|#x22);/gi, '"')
        .replace(/&(?:apos|#39|#x27);/gi, "'")
        .replace(/&(?:lt|#60|#x3c);/gi, '<')
        .replace(/&(?:gt|#62|#x3e);/gi, '>')

const attr = (html, re) => {
  const m = html.match(re)
  return m ? decode(m[1]) : null
}
const meta = (html, name) =>
  attr(html, new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i')) ??
  attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i'))

const docs = []
for (const file of pages) {
  const html = await readFile(file, 'utf8')
  docs.push({
    route: `/${path.relative(dir, file).replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '')}` || '/',
    file: path.relative(root, file),
    html,
    title: attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: meta(html, 'description'),
    ogImage: meta(html, 'og:image'),
    ogTitle: meta(html, 'og:title'),
    robots: meta(html, 'robots'),
    canonical: attr(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    h1s: html.match(/<h1[\s>]/gi)?.length ?? 0,
  })
}

console.log(`${docs.length} built pages in ${path.relative(root, dir) || dir}\n`)

const report = (list) => list.map((d) => d.route).join(', ')

// --- titles ------------------------------------------------------------------
const noTitle = docs.filter((d) => !d.title?.trim())
check('every page has a <title>', noTitle.length === 0, report(noTitle))

const titleMissingSite = docs.filter((d) => d.title && !SITE_NAME_PATTERN.test(d.title))
check('every <title> names the studio', titleMissingSite.length === 0, report(titleMissingSite) || `${docs.length} pages`)

/*
  The specific failure the suffix logic exists to avoid. The homepage's title IS
  the site name, so appending unconditionally prints it twice on the first page
  anyone sees.
*/
const doubled = docs.filter((d) => (d.title?.match(/Rumeau Design/gi)?.length ?? 0) > 1)
check('no <title> names the studio twice', doubled.length === 0, doubled.map((d) => `${d.route}: ${d.title}`).join(' | '))

// Stega markers in a title would be invisible here and wrong everywhere.
const contaminated = docs.filter((d) => /[​-‏⁠-⁤﻿]/.test(d.title ?? ''))
check('no <title> carries zero-width characters', contaminated.length === 0, report(contaminated))

// --- descriptions ------------------------------------------------------------
const noDesc = docs.filter((d) => !d.description?.trim())
check('every page has a meta description', noDesc.length === 0, report(noDesc))

/*
  The one that was actually broken: `oneLineSummary` is empty on most projects,
  so every one of those pages shipped the layout's default and Google saw a site
  whose pages all describe themselves identically.

  The homepage and /portfolio are allowed to share nothing - they are checked
  the same as the rest. A duplicate here is a finding, not noise.
*/
const byDescription = new Map()
for (const d of docs) {
  if (!d.description) continue
  const list = byDescription.get(d.description) ?? []
  list.push(d.route)
  byDescription.set(d.description, list)
}
const dupes = [...byDescription.entries()].filter(([, routes]) => routes.length > 1)
check(
  'no two pages share a meta description',
  dupes.length === 0,
  dupes.map(([desc, routes]) => `"${desc.slice(0, 40)}…" on ${routes.join(' + ')}`).join(' | ') ||
    `${byDescription.size} distinct across ${docs.length} pages`,
)

// --- social ------------------------------------------------------------------
const noOgImage = docs.filter((d) => !d.ogImage)
check('every page has an og:image', noOgImage.length === 0, report(noOgImage))

const badOgImage = docs.filter((d) => d.ogImage && !/^https:\/\//.test(d.ogImage))
check('every og:image is an absolute https URL', badOgImage.length === 0, report(badOgImage))

/*
  A scraper rejects an animated WebP outright, and an auto-formatted animated
  source is exactly what it gets. Every card is forced to JPEG.
*/
const notJpeg = docs.filter((d) => d.ogImage?.includes('cdn.sanity.io') && !/[?&]fm=jpg(&|$)/.test(d.ogImage))
check('every Sanity og:image is forced to jpeg', notJpeg.length === 0, report(notJpeg))

// og:title sits directly above og:site_name in every card, so it must NOT carry
// the suffix that <title> does.
const suffixedShareTitle = docs.filter((d) => d.ogTitle?.includes(' | '))
check('no og:title carries the <title> suffix', suffixedShareTitle.length === 0, report(suffixedShareTitle))

// --- canonicals --------------------------------------------------------------
const noCanonical = docs.filter((d) => !d.canonical)
check('every page has a canonical', noCanonical.length === 0, report(noCanonical))

// A canonical pointing at the preview host would let the preview compete with
// the real site for its own URLs.
const wrongHost = docs.filter((d) => d.canonical && !d.canonical.startsWith('https://rumeaudesign.co'))
check('every canonical points at the real domain', wrongHost.length === 0, report(wrongHost))

// Trailing slashes have to match sitemap.xml exactly or a crawler reads two
// URLs for one page.
const trailing = docs.filter((d) => d.canonical && d.canonical !== 'https://rumeaudesign.co/' && d.canonical.endsWith('/'))
check('no canonical has a stray trailing slash', trailing.length === 0, report(trailing))

// --- structure ---------------------------------------------------------------
/*
  /portfolio had no <h1> at all - the main surface of the site, opening onto a
  row of unlabelled controls with nothing naming the page.
*/
const noH1 = docs.filter((d) => d.h1s === 0)
check('every page has an <h1>', noH1.length === 0, report(noH1))

const manyH1 = docs.filter((d) => d.h1s > 1)
check('no page has more than one <h1>', manyH1.length === 0, manyH1.map((d) => `${d.route} has ${d.h1s}`).join(', '))

// WCAG 2.4.1. Comes from the layout, so its absence anywhere means a page is
// not using the layout.
const noSkip = docs.filter((d) => !d.html.includes('class="skip-link"'))
check('every page has a skip link', noSkip.length === 0, report(noSkip))

const noSkipTarget = docs.filter((d) => !d.html.includes('id="main-content"'))
check('every page has the skip target', noSkipTarget.length === 0, report(noSkipTarget))

// --- indexing ----------------------------------------------------------------
/*
  Two opposite mistakes, and both ship silently.

  On a PREVIEW build every page must be noindex, or it competes with
  rumeaudesign.co for duplicated copy. On a PRODUCTION build only the internal
  pages may be - a stray noindex on a real page removes it from Google and
  nothing on the site looks any different.
*/
const IS_PREVIEW = process.env.PUBLIC_IS_PREVIEW === 'true'
const INTERNAL = new Set(['/style-guide'])
const indexable = docs.filter((d) => !/noindex/i.test(d.robots ?? ''))

if (IS_PREVIEW) {
  check('a preview build noindexes every page', indexable.length === 0, report(indexable))
} else {
  const leaked = docs.filter((d) => INTERNAL.has(d.route) && !/noindex/i.test(d.robots ?? ''))
  check('internal pages are noindexed', leaked.length === 0, report(leaked))
  const hidden = docs.filter((d) => !INTERNAL.has(d.route) && d.route !== '/404' && /noindex/i.test(d.robots ?? ''))
  check('no real page is accidentally noindexed', hidden.length === 0, report(hidden))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
