/*
  Every URL the live Webflow site publishes, against every URL this site builds.

  This is launch step one, and skipping it is the one mistake at cutover that
  costs something you cannot get back: whatever ranking and inbound links the
  old URLs have earned. A 404 tells a crawler the page is gone; a 301 tells it
  the page moved and passes the credit on. There is no way to do it after the
  fact once the old site is switched off, because the list of URLs disappears
  with it.

  The list comes from Webflow's own sitemap rather than from guessing at URL
  patterns. The migration data has 80 items in the Work collection, and whether
  each one has a public page depends on how the collection template is set up -
  which the sitemap answers definitively and inference does not.

  The interesting case is the Grid Items. This site gives a page only to the 13
  documents marked "Case Study"; the other ~67 are tiles that live on the
  Portfolio grid. If Webflow published a page for each, they all 404 at cutover
  unless they are redirected. And they should not all be swept to /portfolio:
  every Grid Item records a `parentBrand`, so a tile from the Adelante shoot can
  point at the Adelante case study, which is the page the visitor actually
  wanted. That mapping is the whole reason this is worth doing properly.

  Writes a proposed _redirects (Cloudflare Pages format) but does not install
  it - the fallbacks need a human eye before they ship.

  Our side of the comparison comes from Sanity plus the static route list, NOT
  from the deployed sitemap. The preview build deliberately omits every
  Sanity-driven route - that is the difference the production gate checks for -
  so reading the preview's sitemap reported 8 of our URLs instead of 26 and made
  ten live URLs look unmapped when most of them have a perfectly good home.

  Usage: node scripts/audit-urls.mjs [--live https://rumeaudesign.co] [--out DIR]
*/
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createClient} from '@sanity/client'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const LIVE = arg('live', 'https://rumeaudesign.co').replace(/\/$/, '')
const OUT = arg('out', 'urls')
await mkdir(OUT, {recursive: true})

const sanity = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true,
})

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

async function sitemapUrls(base) {
  const res = await fetch(`${base}/sitemap.xml`, {headers: {'User-Agent': BROWSER_UA}})
  if (!res.ok) throw new Error(`${base}/sitemap.xml -> HTTP ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => {
      try {
        return new URL(m[1].trim()).pathname.replace(/(.)\/$/, '$1')
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

console.log(`live: ${LIVE}\n`)

// Kept in step with STATIC_PATHS in src/pages/sitemap.xml.ts.
const STATIC = [
  '/', '/portfolio', '/about', '/video',
  '/collage', '/merchfolio', '/blog', '/privacy-policy',
]

const [livePaths, studies, posts] = await Promise.all([
  sitemapUrls(LIVE),
  sanity.fetch(`*[_type == "caseStudy" && pageType == "Case Study" && defined(slug.current)].slug.current`),
  sanity.fetch(`*[_type == "blogPost" && defined(slug.current)].slug.current`),
])

const newPaths = [
  ...STATIC,
  ...studies.map((s) => `/work/${s}`),
  ...posts.map((s) => `/blog/${s}`),
]
const newSet = new Set(newPaths)

console.log(`Webflow publishes ${livePaths.length} URLs`)
console.log(`This site builds   ${newPaths.length} URLs ` +
  `(${STATIC.length} static, ${studies.length} case studies, ${posts.length} posts)\n`)

/*
  Where a Grid Item should send someone.

  parentBrand is the brand a tile belongs to, and only documents marked
  "Case Study" have a page - so a tile whose parent is itself a Grid Item has
  nowhere better to go than the Portfolio.
*/
const tiles = await sanity.fetch(`
  *[_type == "caseStudy" && defined(slug.current)]{
    "slug": slug.current,
    pageType,
    "parentSlug": parentBrand->slug.current,
    "parentType": parentBrand->pageType
  }
`)
const bySlug = new Map(tiles.map((t) => [t.slug, t]))

function targetFor(p) {
  /*
    Webflow's actual prefixes, read off its sitemap rather than assumed:
    case studies live at /case-studies/, blog posts at /post/. Both differ from
    ours, so every one of those URLs moves even where the slug is identical -
    which is exactly the kind of change that silently drops ranking.
  */
  const slug = p.replace(/^\/(work|projects|case-studies|post|blog)\//, '').replace(/^\//, '')

  for (const candidate of [`/work/${slug}`, `/blog/${slug}`, `/${slug}`]) {
    if (newSet.has(candidate)) return {to: candidate, why: 'same page, new prefix'}
  }

  /*
    Slugs Webflow and Sanity disagree about. Only these two: Webflow named the
    case studies after their full titles, Sanity after the brand. No rule can
    derive one from the other, and getting them wrong sends the two best-linked
    pages on the old site to a grid instead of to themselves.
  */
  const RENAMED = {
    '/case-studies/dumpstat-podcast': '/work/dumpstat',
    '/case-studies/hug-a-mug-coffeehouse-ceramics-studio': '/work/hug-a-mug',
  }
  if (RENAMED[p] && newSet.has(RENAMED[p])) {
    return {to: RENAMED[p], why: 'same page, renamed slug'}
  }

  const doc = bySlug.get(slug)
  if (doc?.parentSlug && doc.parentType === 'Case Study' && newSet.has(`/work/${doc.parentSlug}`)) {
    return {to: `/work/${doc.parentSlug}`, why: `tile from ${doc.parentSlug}`}
  }
  if (doc) return {to: '/portfolio', why: 'tile with no case study parent'}

  /*
    Known Webflow leftovers. These were deliberately not ported - abandoned
    duplicate drafts, an unused template, and unedited Unsplash boilerplate -
    but they are published and possibly indexed, so they get sent somewhere
    sensible rather than left to 404.
  */
  const RETIRED = {
    '/home2026': ['/', 'abandoned duplicate of the homepage'],
    '/portfolio-copy-3': ['/portfolio', 'abandoned duplicate of the portfolio'],
    '/case-studies/case-study-template': ['/portfolio', 'unused Webflow template'],
    '/image-license-info': ['/', 'unedited Webflow boilerplate, not ported'],
  }
  if (RETIRED[p]) return {to: RETIRED[p][0], why: RETIRED[p][1]}

  if (p.startsWith('/post/') || p.startsWith('/blog/'))
    return {to: '/blog', why: 'post not carried over'}
  return {to: '/portfolio', why: 'NEEDS A DECISION - defaulting to the grid'}
}

const missing = livePaths.filter((p) => !newSet.has(p))
const added = newPaths.filter((p) => !livePaths.includes(p))

const rules = missing.map((p) => ({from: p, ...targetFor(p)}))
const needsThought = rules.filter((r) => r.why.startsWith('NEEDS'))

console.log(`${missing.length} live URL(s) have no equivalent here:\n`)
const grouped = new Map()
for (const r of rules) {
  if (!grouped.has(r.why)) grouped.set(r.why.replace(/tile from .*/, 'tile -> its case study'), [])
  grouped.get(r.why.replace(/tile from .*/, 'tile -> its case study')).push(r)
}
for (const [why, rs] of grouped) {
  console.log(`  ${rs.length.toString().padStart(3)}  ${why}`)
  for (const r of rs.slice(0, 4)) console.log(`         ${r.from}  ->  ${r.to}`)
  if (rs.length > 4) console.log(`         ... and ${rs.length - 4} more`)
}

if (added.length) {
  console.log(`\n${added.length} URL(s) are new here and were never on Webflow:`)
  for (const p of added) console.log(`  ${p}`)
}

/*
  301, not 302. A temporary redirect asks a crawler to keep the old URL as the
  canonical one, which is the opposite of the intent - these pages are not
  coming back.
*/
const file = [
  '# Generated by scripts/audit-urls.mjs from the live Webflow sitemap.',
  '# 301 because these moves are permanent; a 302 would ask crawlers to keep',
  '# the old URL as canonical, which is the opposite of the point.',
  '',
  ...rules.map((r) => `${r.from}  ${r.to}  301${r.why.startsWith('NEEDS') ? '   # review' : ''}`),
  '',
].join('\n')

await writeFile(path.join(OUT, '_redirects'), file)
await writeFile(
  path.join(OUT, 'urls.json'),
  JSON.stringify({live: livePaths, built: newPaths, missing, added, rules}, null, 2),
)

console.log(`\nwrote ${OUT}/_redirects (${rules.length} rules) and ${OUT}/urls.json`)
if (needsThought.length) {
  console.log(`\n${needsThought.length} rule(s) marked "# review" - those are guesses.`)
}
