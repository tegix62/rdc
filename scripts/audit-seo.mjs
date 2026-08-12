/*
  What is still worth WRITING, page by page.

  WHY THIS IS NOT THE SAME AS test-head.mjs

  test-head.mjs is a gate: it proves the head is well-formed and fails the build
  when it is not. It cannot tell you that a description is dull, or that it was
  assembled from three database fields rather than written by a person - because
  both of those are perfectly well-formed. Every page on the site currently
  passes that gate.

  This is the other half: it reports where the copy came from, so the difference
  between "shipped and correct" and "actually good" is visible somewhere other
  than in a search result three months from now.

  The distinction it draws is one word: WRITTEN vs DERIVED.

    written   somebody typed this sentence for a stranger to read.
    derived   assembled from category, client and principal type. True, unique
              per page, and readable - the fallback chain exists so that no page
              ever ships a duplicate - but nobody chose these words, and it
              reads like it.

  A derived description is not a bug and does not need fixing today. It is a
  place where ten minutes of writing would beat any amount of code.

  Descriptions are computed by importing the SITE'S OWN functions rather than
  reimplementing the fallback chain here. An audit that models the logic instead
  of calling it eventually disagrees with the thing it is auditing, and then it
  is worse than nothing: it reports on a site that does not exist.

  READ-ONLY. Changes nothing.

  Usage: SANITY_API_TOKEN=... node scripts/audit-seo.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only use).')
  process.exit(1)
}

const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

// Same esbuild hop test-meta.mjs uses: these are .ts and Node will not load them.
const outdir = path.join(root, 'node_modules', '.cache', 'seo-audit')
await mkdir(outdir, {recursive: true})
await build({
  entryPoints: [path.join(root, 'src/lib/meta.ts')],
  outfile: path.join(outdir, 'meta.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  logLevel: 'error',
})
const {caseStudyDescription, blogPostDescription, pageTitle} = await import(
  path.join(outdir, 'meta.mjs')
)

/*
  Google renders roughly 150-160 characters of description and cuts the rest, and
  truncates a title somewhere around 60 depending on character widths. Neither is
  a rule - both are "you have stopped choosing what a stranger reads at this
  point", which is the thing worth flagging.

  The lower bounds are softer and worth stating plainly: a 40-character
  description is not broken, it is just leaving the space empty.
*/
const TITLE_MAX = 60
const DESC_MIN = 70
const DESC_MAX = 160

const [settings, studies, posts, pages] = await Promise.all([
  groq(`*[_type == "siteSettings"][0]{
    siteTitle, tagline, founderName, founderRole, email, locality, areaServed,
    "hasSocialImage": defined(socialImage.asset),
    "socialCount": count(socialLinks[defined(url)])
  }`),
  groq(`*[_type == "caseStudy" && pageType == "Case Study" && defined(slug.current)]
    | order(title asc){
      "slug": slug.current, title, category, client, principalType,
      seoDescription, oneLineSummary, summary
    }`),
  groq(`*[_type == "blogPost" && defined(slug.current)] | order(publishedAt desc){
    "slug": slug.current, title, metaDescription, excerpt, publishedAt
  }`),
  groq(`*[_type == "page" && defined(slug.current)] | order(slug.current asc){
    "slug": slug.current, title, seoDescription
  }`),
])

const siteName = settings?.siteTitle ?? 'Rumeau Design Co'

const rows = []

/*
  The nine static pages carry a hardcoded fallback in the template, chosen per
  page - so an empty seoDescription here means the page ships a real sentence
  that happens to live in the repo rather than in Studio. That is a different
  situation from a derived case-study line, and worth naming differently: the
  copy exists, it just cannot be edited without a deploy.
*/
for (const page of pages) {
  rows.push({
    kind: 'page',
    route: page.slug === 'home' ? '/' : `/${page.slug}`,
    title: page.title,
    description: page.seoDescription?.trim() ?? '',
    source: page.seoDescription?.trim() ? 'written' : 'in the template',
  })
}

for (const study of studies) {
  const source = study.seoDescription?.trim()
    ? 'written (search-only)'
    : study.oneLineSummary?.trim()
      ? 'written (blurb)'
      : study.summary?.trim()
        ? 'written (summary, first sentence)'
        : 'derived'
  rows.push({
    kind: 'work',
    route: `/work/${study.slug}`,
    title: study.title,
    description: caseStudyDescription(study, siteName),
    source,
  })
}

for (const post of posts) {
  const source = post.metaDescription?.trim()
    ? 'written (search-only)'
    : post.excerpt?.trim()
      ? 'written (excerpt)'
      : 'derived'
  rows.push({
    kind: 'post',
    route: `/blog/${post.slug}`,
    title: post.title,
    description: blogPostDescription(post),
    source,
  })
}

// --- report ------------------------------------------------------------------
const bar = (n) => '='.repeat(n)
console.log(`\n${bar(74)}\nSEO copy audit - ${rows.length} pages with content in Sanity\n${bar(74)}`)

const derived = rows.filter((r) => r.source === 'derived')
const templated = rows.filter((r) => r.source === 'in the template')
const written = rows.filter((r) => r.source.startsWith('written'))

console.log(`\n  ${written.length} written   ${templated.length} in the template   ${derived.length} derived`)

// --- the actual punch list ---------------------------------------------------
console.log(`\n${bar(74)}\nWORTH WRITING, in order\n${bar(74)}`)

if (derived.length) {
  console.log(`\n1. ${derived.length} page(s) ship a description nobody wrote.`)
  console.log('   Assembled from category and client. True and unique, but it reads')
  console.log('   like a database row, and this is the sentence a stranger decides on.\n')
  for (const r of derived) {
    console.log(`   ${r.route}`)
    console.log(`     now: ${r.description}`)
  }
  console.log('\n   Fix: Studio → the project → "Short blurb (one line)". One sentence each.')
} else {
  console.log('\n1. Every page has a description somebody wrote. Nothing to do.')
}

/*
  Length is reported second because it is genuinely secondary. A short
  description is not an error - it is unused space in the one piece of copy
  whose entire job is to earn a click.
*/
const short = rows.filter((r) => r.description.length < DESC_MIN)
const long = rows.filter((r) => r.description.length > DESC_MAX)

console.log(`\n2. Length. Google renders about ${DESC_MAX} characters.\n`)
if (short.length) {
  console.log(`   ${short.length} under ${DESC_MIN} characters - room left on the table:`)
  for (const r of short) console.log(`     ${String(r.description.length).padStart(3)}  ${r.route}`)
} else {
  console.log(`   Nothing under ${DESC_MIN} characters.`)
}
if (long.length) {
  console.log(`\n   ${long.length} over ${DESC_MAX} - these are cut off mid-thought in a result:`)
  for (const r of long) console.log(`     ${String(r.description.length).padStart(3)}  ${r.route}`)
} else {
  console.log(`   Nothing over ${DESC_MAX} characters.`)
}

/*
  Titles are measured as they SHIP - with the site-name suffix - because that is
  what Google truncates. Measuring the bare title would report every project as
  comfortably short while the rendered result is cut off.
*/
const longTitles = rows
  .map((r) => ({...r, full: pageTitle(r.title ?? '', siteName)}))
  .filter((r) => r.full.length > TITLE_MAX)

console.log(`\n3. Titles over ${TITLE_MAX} characters, measured WITH the " | ${siteName}" suffix.\n`)
if (longTitles.length) {
  console.log('   Google cuts these. The project name survives; the studio name is what')
  console.log('   gets lost, which is the half worth keeping in a search result.\n')
  for (const r of longTitles) {
    console.log(`     ${String(r.full.length).padStart(3)}  ${r.full}`)
  }
} else {
  console.log('   None.')
}

// --- duplicates --------------------------------------------------------------
const byDescription = new Map()
for (const r of rows) {
  const list = byDescription.get(r.description) ?? []
  list.push(r.route)
  byDescription.set(r.description, list)
}
const dupes = [...byDescription.entries()].filter(([, routes]) => routes.length > 1)

console.log('\n4. Duplicate descriptions.\n')
if (dupes.length) {
  console.log('   Duplicate meta descriptions are the one SEO fault Google names outright.')
  for (const [desc, routes] of dupes) {
    console.log(`     "${desc.slice(0, 50)}…" on ${routes.join(' + ')}`)
  }
} else {
  console.log(`   None. ${byDescription.size} distinct across ${rows.length} pages.`)
}

// --- the five Studio boxes ---------------------------------------------------
console.log(`\n${bar(74)}\nSTUDIO → SITE SETTINGS → SEARCH\n${bar(74)}`)
console.log('\nThese go into the JSON-LD block, which is how a search engine is told what')
console.log('kind of thing this business is rather than left to infer it. Nothing on the')
console.log('page changes either way, which is why an empty one is easy to miss.\n')

const SEO_FIELDS = [
  ['founderName', 'Your name - ties you to the studio as a search entity'],
  ['founderRole', 'Your title (optional)'],
  ['email', 'Public email (optional - only if you want it machine-readable)'],
  ['locality', 'City or region you work from'],
  ['areaServed', 'Who you take work from'],
]
let emptyFields = 0
for (const [field, why] of SEO_FIELDS) {
  const value = settings?.[field]?.trim?.() ?? ''
  if (value) console.log(`  set    ${field.padEnd(12)} "${value}"`)
  else {
    emptyFields += 1
    console.log(`  EMPTY  ${field.padEnd(12)} ${why}`)
  }
}

console.log('\nAlso:')
console.log(
  settings?.hasSocialImage
    ? '  set    default share image'
    : '  EMPTY  default share image - every card falls back to the padded wordmark',
)
console.log(`  ${settings?.socialCount ?? 0} social link(s), which become the studio\'s sameAs list`)

// --- summary -----------------------------------------------------------------
console.log(`\n${bar(74)}`)
const jobs = []
if (derived.length) jobs.push(`${derived.length} description(s) to write`)
if (long.length) jobs.push(`${long.length} to shorten`)
if (dupes.length) jobs.push(`${dupes.length} duplicate(s) to split`)
if (emptyFields) jobs.push(`${emptyFields} Studio field(s) to fill`)
console.log(jobs.length ? `Worth doing: ${jobs.join(', ')}.` : 'Nothing outstanding.')
console.log(
  'None of it blocks a deploy - every page already ships a unique, valid description.',
)
console.log(`${bar(74)}\n`)
