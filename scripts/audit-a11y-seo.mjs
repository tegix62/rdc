/*
  Image alt text, heading hierarchy, and internal linking, read out of the
  BUILT HTML.

  WHY THESE THREE TOGETHER

  All three are invisible defects. A page with a missing alt, a skipped heading
  level, and no inbound links looks completely normal to anyone browsing it -
  which is exactly why nothing has caught them so far. And all three need the
  same input: the rendered HTML of every page, with Sanity's content already in
  it. Reading dist/ once and answering all three is cheaper and more honest than
  three passes over the same files.

  WHAT EACH ONE COSTS WHEN WRONG

  ALT TEXT      A screen reader announces "image" and nothing else. For a
                design portfolio it also forfeits Google Images, which is a
                search surface where the work itself is the result rather than
                a page about the work. Note the distinction this makes:
                MISSING alt (no attribute at all) is a real defect; EMPTY alt
                (alt="") is the correct, deliberate markup for a decorative
                image and is reported separately rather than counted as a bug.

  HEADINGS      Assistive technology builds a document outline from these, and
                jumping h2 -> h4 means a heading level that does not exist in
                the outline. test-head.mjs already enforces exactly one h1 per
                page; nothing looks at what comes after it.

  INTERNAL      A page nothing links to is reachable only from the sitemap.
  LINKS         Crawlers follow links to judge what a site considers
                important, so an orphan reads as unimportant however good it
                is. Counted per page, both directions.

  READ-ONLY. Reports; changes nothing.

  Usage: node scripts/audit-a11y-seo.mjs [dist]
*/
import {readdirSync, readFileSync, statSync} from 'node:fs'
import path from 'node:path'

const dist = process.argv[2] ?? 'dist'

const pages = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (entry === 'index.html' || entry.endsWith('.html')) pages.push(full)
  }
}
try {
  walk(dist)
} catch (error) {
  console.error(`Could not read ${dist}/ - run \`npm run build\` first.\n${error.message}`)
  process.exit(1)
}

// dist/about/index.html -> /about ; dist/index.html -> /
const routeOf = (file) => {
  const rel = path.relative(dist, file).replace(/\\/g, '/')
  const noIndex = rel.replace(/(^|\/)index\.html$/, '')
  return `/${noIndex.replace(/\.html$/, '')}`.replace(/\/+$/, '') || '/'
}

const bar = (n) => '='.repeat(n)
console.log(`\n${bar(74)}\nAlt text, headings and internal links - ${pages.length} built pages\n${bar(74)}`)

// --- 1. alt text --------------------------------------------------------------
const missingAlt = []
let decorative = 0
let withAlt = 0

for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  const route = routeOf(file)
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const alt = tag.match(/\salt\s*=\s*"([^"]*)"/i)
    if (!alt) {
      // The src is what makes this findable in Studio - "an image on /about"
      // is not something you can go and fix.
      const src = tag.match(/\ssrc\s*=\s*"([^"]*)"/i)?.[1] ?? '(no src)'
      missingAlt.push({route, src: src.slice(0, 90)})
    } else if (alt[1].trim() === '') decorative += 1
    else withAlt += 1
  }
}

console.log(`\n1. Image alt text\n`)
console.log(`   ${withAlt} described, ${decorative} deliberately decorative (alt=""), ${missingAlt.length} MISSING\n`)
if (missingAlt.length) {
  for (const {route, src} of missingAlt.slice(0, 25)) console.log(`   ${route}\n     ${src}`)
  if (missingAlt.length > 25) console.log(`   ...and ${missingAlt.length - 25} more`)
  console.log(`\n   An <img> with no alt attribute at all is announced as just "image".`)
  console.log(`   alt="" is the CORRECT markup for a purely decorative image - those are`)
  console.log(`   counted above, not listed here.`)
} else {
  console.log('   Every image either describes itself or is explicitly decorative.')
}

// --- 2. heading hierarchy -----------------------------------------------------
const skips = []
for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  const route = routeOf(file)
  const levels = [...(html.match(/<h([1-6])\b/gi) ?? [])].map((h) => Number(h.slice(2)))
  let previous = 0
  for (const level of levels) {
    // Going DOWN any number of levels is fine (h4 back to h2 closes a section).
    // Going UP by more than one invents a level that is not in the outline.
    if (previous && level > previous + 1) {
      skips.push(`${route}: h${previous} -> h${level}`)
    }
    previous = level
  }
}

console.log(`\n2. Heading hierarchy\n`)
if (skips.length) {
  for (const s of skips) console.log(`   ${s}`)
  console.log(`\n   A skipped level means an outline entry that does not exist. Dropping DOWN`)
  console.log(`   levels is fine; only jumping up by more than one is reported.`)
} else {
  console.log('   No skipped levels on any page.')
}

// --- 3. internal links --------------------------------------------------------
const routes = new Set(pages.map(routeOf))
const inbound = new Map([...routes].map((r) => [r, 0]))
const outbound = new Map([...routes].map((r) => [r, 0]))
const broken = []

for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  const from = routeOf(file)
  for (const href of (html.match(/\shref\s*=\s*"(\/[^"#?]*)"/gi) ?? []).map(
    (m) => m.match(/"(\/[^"#?]*)"/)[1],
  )) {
    // Assets are not pages; only routes belong in this graph.
    if (/\.(css|js|mjs|png|jpe?g|webp|svg|ico|xml|txt|pdf|woff2?)$/i.test(href)) continue
    const target = href.replace(/\/+$/, '') || '/'
    if (!routes.has(target)) {
      // Redirect sources live in _redirects, not dist, so a link to one is
      // not broken - it is just not a built page. Reported quietly.
      broken.push(`${from} -> ${href}`)
      continue
    }
    outbound.set(from, (outbound.get(from) ?? 0) + 1)
    if (target !== from) inbound.set(target, (inbound.get(target) ?? 0) + 1)
  }
}

const orphans = [...inbound.entries()].filter(([route, n]) => n === 0 && route !== '/')
const deadEnds = [...outbound.entries()].filter(([, n]) => n === 0)

console.log(`\n3. Internal links\n`)
if (orphans.length) {
  console.log(`   ${orphans.length} page(s) nothing else links to:`)
  for (const [route] of orphans) console.log(`     ${route}`)
  console.log(`   Reachable from the sitemap, but a crawler reads "nothing links here"`)
  console.log(`   as "this is not important".`)
} else {
  console.log('   Every page has at least one inbound link.')
}
if (deadEnds.length) {
  console.log(`\n   ${deadEnds.length} page(s) with no outbound internal links:`)
  for (const [route] of deadEnds) console.log(`     ${route}`)
}
if (broken.length) {
  console.log(`\n   ${broken.length} link(s) to a path that is not a built page.`)
  console.log(`   Some of these are legitimately handled by public/_redirects; the rest`)
  console.log(`   are 404s waiting to happen:`)
  for (const b of broken.slice(0, 15)) console.log(`     ${b}`)
  if (broken.length > 15) console.log(`     ...and ${broken.length - 15} more`)
}

/*
  Exit 0 regardless.

  This is an AUDIT, not a gate. Every finding here is a judgement call about
  copy or structure - whether an image is decorative, whether a page deserves
  inbound links - and a script that blocks a deploy over a judgement call gets
  switched off, at which point it guards nothing. test-head.mjs is the gate;
  this is the report that tells you what to go and write.
*/
console.log(`\n${bar(74)}`)
const jobs = [
  missingAlt.length && `${missingAlt.length} missing alt`,
  skips.length && `${skips.length} heading skip(s)`,
  orphans.length && `${orphans.length} orphan page(s)`,
].filter(Boolean)
console.log(jobs.length ? `Worth fixing: ${jobs.join(', ')}.` : 'Nothing outstanding.')
console.log(`${bar(74)}\n`)
