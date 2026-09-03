/*
  Gates a production deploy on the contents of dist/ before anything ships.

  The preview build and the production build come off the same source and
  differ only by two environment variables. That is a good arrangement right up
  until one of them is wrong, at which point the difference is invisible: a
  production build carrying preview settings looks completely normal. It
  renders, it deploys, every page returns 200 - and it tells search engines not
  to index the site, ships a 640 KB editing overlay, and hides zero-width
  characters inside every string of copy on the page.

  None of that is visible in a browser. So it gets measured instead, here,
  against the built files, before the deploy step runs.

  Each check below exists because of a specific way this can go wrong, not
  because it was easy to write. `node scripts/test-production-check.mjs` builds
  a deliberately broken dist for every one of them and asserts it is caught -
  because a gate that cannot fail is worse than no gate, and this project has
  already shipped one of those.

  Usage:
    node scripts/check-production-build.mjs [--dist dist]
                                            [--origin https://rumeaudesign.co]
                                            [--sha <git sha>]
                                            [--json out.json]

  Exit code 1 if anything failed, which is what stops the deploy.
*/
import {readdir, readFile, writeFile, stat} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DIST = path.resolve(arg('dist', 'dist'))
const ORIGIN = arg('origin', 'https://rumeaudesign.co').replace(/\/$/, '')
const SHA = arg('sha', '')
const JSON_OUT = arg('json', '')

/*
  Pages that legitimately stay out of the sitemap. /style-guide is an internal
  fixture page, /404 is not a destination, and /image-license-info is unedited
  Webflow boilerplate that was deliberately not carried over as real content.

  /catalog is the archive arrangement of /portfolio - the same work under a
  second URL. Listing both would be asking Google to choose between two pages
  of identical content, which is the situation a canonical exists to prevent,
  and the grid is the one that should rank.
*/
const NOT_IN_SITEMAP = new Set(['/404', '/style-guide', '/image-license-info', '/catalog'])

/*
  Every route that must be in a production sitemap. If a build quietly reverts
  to preview behaviour the sitemap still generates - it just silently drops
  every Sanity-driven route and keeps these. So the static list alone proves
  nothing; see the case-study check below, which is the one that catches it.
*/
const REQUIRED_SITEMAP_PATHS = [
  '/',
  '/portfolio',
  '/about',
  '/video',
  '/collage',
  '/merchfolio',
  '/blog',
  '/privacy-policy',
]

/*
  Stega hides its payload in invisible Unicode. The authoritative character set
  lives in @vercel/stega, which @sanity/client already depends on, so use its
  own regex when it can be reached - a check that drifts from the encoder it is
  checking for would pass on markers it no longer recognises.

  The fallback is the same set written out (the `s` table in that package:
  U+200B-200D, U+2060-2063, U+FEFF, U+1D173-1D17A), because this project commits
  no lockfile and a transitive dependency is not something to bet a launch gate
  on. Four or more in a row - a single stray zero-width character is not a
  payload.
*/
const FALLBACK_STEGA =
  /[​‌‍⁠⁡⁢⁣﻿\u{1D173}-\u{1D17A}]{4,}/gu
let stegaRegex = FALLBACK_STEGA
let stegaSource = 'local copy of the character set'
try {
  const {VERCEL_STEGA_REGEX} = await import('@vercel/stega')
  if (VERCEL_STEGA_REGEX instanceof RegExp) {
    stegaRegex = VERCEL_STEGA_REGEX
    stegaSource = '@vercel/stega'
  }
} catch {
  // Left on the fallback, and said so in the report rather than in silence.
}

const failures = []
const notes = []
const fail = (check, detail) => failures.push({check, detail})

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

if (!existsSync(DIST)) {
  console.error(`No such directory: ${DIST}`)
  process.exit(1)
}

const allFiles = await walk(DIST)
const htmlFiles = allFiles.filter((f) => f.endsWith('.html')).sort()

if (!htmlFiles.length) fail('build', `${DIST} contains no HTML at all`)

/*
  dist/about/index.html -> /about, dist/index.html -> /, dist/404.html -> /404.
  Astro's directory build format serves these without the trailing slash, and
  Layout.astro strips it from the canonical, so these are the URLs the site
  actually claims for itself.
*/
function routeOf(file) {
  const rel = path.relative(DIST, file).split(path.sep).join('/')
  const trimmed = rel.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')
  return `/${trimmed}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')
}

// ---------------------------------------------------------------------------
// 1. The visual-editing overlay must not be in the output at all.
//
// build-overlay.mjs deletes public/sanity-visual-editing.js when the env var
// is off, so this should be impossible - but "should be impossible" is how it
// got into public/ in the first place. It is a 640 KB module that installs
// document-level click handling; on a live site it is both dead weight and a
// way for ordinary clicks to stop working.
// ---------------------------------------------------------------------------
const overlayFiles = allFiles.filter((f) => path.basename(f) === 'sanity-visual-editing.js')
for (const f of overlayFiles) {
  fail('overlay-file', `shipped ${path.relative(DIST, f)}`)
}

// ---------------------------------------------------------------------------
// 2-5, 8-9: per-page checks.
// ---------------------------------------------------------------------------
let stampSeen = null

for (const file of htmlFiles) {
  const route = routeOf(file)
  const html = await readFile(file, 'utf8')

  // The loader tag VisualEditing.astro renders. Present only when the build
  // opted into editing, so its presence means the env var leaked in even if
  // the bundle itself somehow did not.
  if (html.includes('sanity-visual-editing.js')) {
    fail('overlay-reference', `${route} loads the editing overlay`)
  }

  // Invisible markers in the copy. These travel when text is copied and are
  // read aloud by screen readers when they land in an attribute.
  stegaRegex.lastIndex = 0
  if (stegaRegex.test(html)) {
    stegaRegex.lastIndex = 0
    const hit = html.match(stegaRegex)
    fail('stega', `${route} contains ${hit?.length ?? '?'} stega marker(s)`)
  }

  /*
    noindex on the real site is the quietest possible catastrophe: nothing
    breaks, the site simply stops existing to search over a few weeks. That is
    what this catches - a production build made with the preview flags left on,
    where EVERY page carries it.

    /style-guide is the one deliberate exception. It is an internal reference
    page, left out of sitemap.xml, and it opts out per-page via Layout's
    `noindex` prop. Production robots.txt says `Allow: /`, so without that opt-
    out the only thing keeping it unindexed is that nothing links to it.

    Found by rehearsing this gate rather than by launching: the per-page noindex
    shipped this afternoon and tripped this check the first time the production
    build ran afterwards. Two of my own gates had ended up contradicting each
    other - test-head.mjs REQUIRES /style-guide to be noindexed and this
    FORBADE it - so a cutover would have deadlocked between them.

    /catalog is the second deliberate exception, and it happened exactly the
    same way: the page shipped, and the next production deploy - triggered by
    a Sanity publish, not by the commit that caused it - failed here. Publishes
    then silently stopped reaching the live site, because the gate correctly
    refuses to upload and there is nothing else to notice.

    It is legitimately noindex. /catalog is the archive arrangement of the same
    work as /portfolio, so indexing both asks Google to pick between duplicate
    pages, and the grid is the one that should win. It is out of sitemap.xml
    for the same reason - see NOT_IN_SITEMAP above, which it also had to join.

    Narrow on purpose. Any other route carrying noindex is still a failure, and
    the count check below still catches the flags-left-on case, because that
    would noindex all 21 pages rather than these two.
  */
  const NOINDEX_ALLOWED = new Set(['/style-guide', '/catalog'])
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html) && !NOINDEX_ALLOWED.has(route)) {
    fail('noindex', `${route} tells crawlers not to index it`)
  }

  // Canonical: exactly one, on the production origin, naming this page's own
  // route. A canonical pointing at the preview host hands the preview the
  // credit for the live site's pages.
  const canonicals = [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]*>/gi)].map((m) => {
    const href = m[0].match(/href=["']([^"']+)["']/i)
    return href?.[1] ?? ''
  })
  if (canonicals.length === 0) {
    fail('canonical', `${route} has no canonical link`)
  } else if (canonicals.length > 1) {
    fail('canonical', `${route} has ${canonicals.length} canonical links`)
  } else {
    let parsed = null
    try {
      parsed = new URL(canonicals[0])
    } catch {
      fail('canonical', `${route} canonical is not an absolute URL: ${canonicals[0]}`)
    }
    if (parsed) {
      if (parsed.origin !== ORIGIN) {
        fail('canonical', `${route} canonical points at ${parsed.origin}, not ${ORIGIN}`)
      }
      const claimed = parsed.pathname.replace(/(.)\/$/, '$1')
      if (claimed !== route) {
        fail('canonical', `${route} claims to be ${claimed}`)
      }
    }
  }

  // Which commit built this page. The audit already depends on this being
  // right; a deploy that ships unstamped pages leaves every later measurement
  // unable to prove what it measured.
  const stamp = html.match(/<meta[^>]+name=["']build-commit["'][^>]*content=["']([^"']*)["']/i)?.[1]
  if (!stamp) {
    fail('build-stamp', `${route} has no build-commit meta`)
  } else {
    if (stampSeen === null) stampSeen = stamp
    else if (stampSeen !== stamp) {
      fail('build-stamp', `${route} is stamped ${stamp}, other pages say ${stampSeen}`)
    }
    if (SHA && stamp !== SHA) {
      fail('build-stamp', `${route} is stamped ${stamp}, expected ${SHA}`)
    }
    if (!SHA && stamp === 'dev') {
      fail('build-stamp', `${route} is stamped "dev" - PUBLIC_BUILD_SHA was not set`)
    }
  }

  /*
    Structured data. Worth checking rather than eyeballing because it is the
    one part of a page nobody ever looks at: it is invisible in a browser, and
    a malformed block is silently discarded by every crawler that reads it. A
    JSON-LD block that does not parse is indistinguishable, from the outside,
    from having none at all - which is the state this site was in until now.
  */
  const ldBlocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1])

  if (ldBlocks.length === 0) {
    fail('json-ld', `${route} has no structured data`)
  } else if (ldBlocks.length > 1) {
    // Several blocks is legal, but this site emits one @graph on purpose, so
    // more than one means something is being stated twice.
    fail('json-ld', `${route} has ${ldBlocks.length} JSON-LD blocks, expected one @graph`)
  } else {
    let graph = null
    try {
      graph = JSON.parse(ldBlocks[0])
    } catch (err) {
      fail('json-ld', `${route} JSON-LD does not parse: ${String(err).slice(0, 90)}`)
    }
    if (graph) {
      const nodes = Array.isArray(graph['@graph']) ? graph['@graph'] : []
      if (graph['@context'] !== 'https://schema.org') {
        fail('json-ld', `${route} @context is ${graph['@context']}`)
      }
      if (!nodes.length) {
        fail('json-ld', `${route} @graph is empty`)
      }
      const types = new Set(nodes.map((n) => n?.['@type']))
      for (const required of ['Organization', 'WebSite', 'WebPage']) {
        if (!types.has(required)) fail('json-ld', `${route} @graph has no ${required} node`)
      }
      for (const node of nodes) {
        if (!node || !node['@type']) fail('json-ld', `${route} has a node with no @type`)
      }
      // The WebPage node has to name this page, or the graph describes some
      // other URL - which is how a template that hardcoded a canonical would
      // look, and it would look fine.
      const webpage = nodes.find((n) => n?.['@type'] === 'WebPage')
      if (webpage && webpage.url && webpage.url.replace(/(.)\/$/, '$1') !== `${ORIGIN}${route === '/' ? '' : route}`) {
        fail('json-ld', `${route} WebPage node claims ${webpage.url}`)
      }
      // An empty string is not "no value" - it is a claim that the business
      // has no name. compact() in structuredData.ts should have dropped these.
      const emptyStrings = JSON.stringify(graph).match(/:""/g)
      if (emptyStrings) {
        fail('json-ld', `${route} states ${emptyStrings.length} empty value(s)`)
      }
    }
  }

  // Nothing on the live site should link back to where it was staged.
  for (const host of ['pages.dev', 'localhost:', '127.0.0.1']) {
    if (html.includes(`//${host}`) || html.includes(`.${host}`)) {
      fail('stray-host', `${route} references ${host}`)
    }
  }
}

// ---------------------------------------------------------------------------
// 6. robots.txt
// ---------------------------------------------------------------------------
const robotsPath = path.join(DIST, 'robots.txt')
if (!existsSync(robotsPath)) {
  fail('robots', 'no robots.txt was generated')
} else {
  const robots = await readFile(robotsPath, 'utf8')
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) {
    fail('robots', 'robots.txt still disallows the whole site (preview rules)')
  }
  if (!/^\s*Allow:\s*\//im.test(robots)) {
    fail('robots', 'robots.txt has no Allow rule')
  }
  const sitemapLine = robots.match(/^\s*Sitemap:\s*(\S+)/im)?.[1]
  if (!sitemapLine) {
    fail('robots', 'robots.txt names no sitemap')
  } else if (sitemapLine !== `${ORIGIN}/sitemap.xml`) {
    fail('robots', `robots.txt points at ${sitemapLine}, expected ${ORIGIN}/sitemap.xml`)
  }
}

// ---------------------------------------------------------------------------
// 7. sitemap.xml
//
// The subtle one. A production build that accidentally kept PUBLIC_IS_PREVIEW
// still emits a sitemap - it just skips the Sanity query and lists only the
// eight static routes. It is well-formed, on the right origin, and completely
// wrong: every case study and every blog post is missing. So the presence of
// Sanity-driven routes is the check that actually distinguishes the two builds.
// ---------------------------------------------------------------------------
const sitemapPath = path.join(DIST, 'sitemap.xml')
if (!existsSync(sitemapPath)) {
  fail('sitemap', 'no sitemap.xml was generated')
} else {
  const xml = await readFile(sitemapPath, 'utf8')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())

  if (!locs.length) fail('sitemap', 'sitemap.xml lists no URLs')

  const routes = new Set()
  for (const loc of locs) {
    let parsed = null
    try {
      parsed = new URL(loc)
    } catch {
      fail('sitemap', `not a URL: ${loc}`)
      continue
    }
    if (parsed.origin !== ORIGIN) {
      fail('sitemap', `${loc} is not on ${ORIGIN}`)
    }
    routes.add(parsed.pathname.replace(/(.)\/$/, '$1'))
  }

  for (const required of REQUIRED_SITEMAP_PATHS) {
    if (!routes.has(required)) fail('sitemap', `missing ${required}`)
  }

  const caseStudies = [...routes].filter((r) => r.startsWith('/work/'))
  if (!caseStudies.length) {
    fail(
      'sitemap',
      'no /work/ routes - the sitemap skipped Sanity, which is what a preview build does',
    )
  }

  // A sitemap URL with no page behind it is a soft 404 handed straight to a
  // crawler. Compare against what actually built.
  const built = new Set(htmlFiles.map(routeOf))
  for (const r of routes) {
    if (!built.has(r)) fail('sitemap', `lists ${r}, which did not build`)
  }

  // And the reverse: a page that built, is meant to be public, and nothing
  // points a crawler at.
  for (const r of built) {
    if (!NOT_IN_SITEMAP.has(r) && !routes.has(r)) {
      notes.push(`built but not in the sitemap: ${r}`)
    }
  }

  notes.push(`sitemap lists ${locs.length} URLs, ${caseStudies.length} of them case studies`)
}

// ---------------------------------------------------------------------------
// _redirects
//
// Every rule points somewhere. A redirect to a page that does not exist is
// worse than no redirect at all: the crawler follows it and finds a 404, so the
// old URL's ranking is spent on nothing. The targets are slugs typed by hand,
// which is precisely the kind of thing that is wrong once and never noticed.
// ---------------------------------------------------------------------------
const redirectsPath = path.join(DIST, '_redirects')
if (existsSync(redirectsPath)) {
  const built = new Set(htmlFiles.map(routeOf))
  const text = await readFile(redirectsPath, 'utf8')
  let count = 0

  for (const line of text.split('\n')) {
    const clean = line.split('#')[0].trim()
    if (!clean) continue
    const [from, to, code] = clean.split(/\s+/)
    if (!from || !to) continue
    count += 1

    // A wildcard or a placeholder cannot be resolved against a file list.
    if (to.includes(':') || to.includes('*') || /^https?:/.test(to)) continue

    const target = to.replace(/(.)\/$/, '$1')
    if (!built.has(target)) {
      fail('redirects', `${from} -> ${target}, which does not exist`)
    }
    if (built.has(from.replace(/(.)\/$/, '$1'))) {
      fail('redirects', `${from} redirects away from a page this site actually builds`)
    }
    if (code && code !== '301' && code !== '308') {
      notes.push(`${from} uses ${code} rather than 301 - crawlers keep the old URL as canonical`)
    }
  }
  notes.push(`_redirects: ${count} rule(s), every target checked against the build`)
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const totalBytes = (
  await Promise.all(allFiles.map(async (f) => (await stat(f)).size))
).reduce((a, b) => a + b, 0)

console.log(`Production build check - ${DIST}`)
console.log(`  origin        ${ORIGIN}`)
console.log(`  expected sha  ${SHA || '(not pinned)'}`)
console.log(`  built stamp   ${stampSeen ?? '(none found)'}`)
console.log(`  pages         ${htmlFiles.length}`)
console.log(`  files         ${allFiles.length} (${Math.round(totalBytes / 1024)} KB)`)
console.log(`  stega regex   ${stegaSource}`)
for (const n of notes) console.log(`  note          ${n}`)

if (failures.length) {
  console.log(`\n${failures.length} problem(s):`)
  // Group, because one wrong env var produces the same failure on every page
  // and an undifferentiated list of 90 lines buries which check tripped.
  const grouped = new Map()
  for (const f of failures) {
    if (!grouped.has(f.check)) grouped.set(f.check, [])
    grouped.get(f.check).push(f.detail)
  }
  for (const [check, details] of grouped) {
    console.log(`\n  [${check}] ${details.length}`)
    for (const d of details.slice(0, 8)) console.log(`    - ${d}`)
    if (details.length > 8) console.log(`    ... and ${details.length - 8} more`)
  }
} else {
  console.log('\nAll checks passed. Safe to deploy to a real domain.')
}

if (JSON_OUT) {
  await writeFile(
    JSON_OUT,
    JSON.stringify(
      {
        dist: DIST,
        origin: ORIGIN,
        expectedSha: SHA || null,
        buildStamp: stampSeen,
        pages: htmlFiles.length,
        files: allFiles.length,
        bytes: totalBytes,
        stegaSource,
        notes,
        failures,
        passed: failures.length === 0,
      },
      null,
      2,
    ),
  )
}

process.exit(failures.length ? 1 : 0)
