/*
  Clear the project-only fields that grid items are still carrying.

  WHY

  The audit found 8 tiles holding a Search blurb and 5 holding a Client's
  Logo. Both are leftovers from when every document was a project: the
  fields are hidden on a tile's form, so the values cannot be seen or
  edited there, and nothing reads them for a tile.

  CHECKED RATHER THAN ASSUMED, because "page-only" is a claim about the
  schema and not about the queries. Every read of either field across the
  site:

    oneLineSummary  work/[slug].astro and caseStudyNode in
                    structuredData.ts - both only run for a project page
    clientLogo      work/[slug].astro only. The homepage's logo row is
                    siteSettings.clientLogos, a different field entirely

  A grid item has no page, so neither is ever read for one.

  SAFETY

  Dry run unless APPLY=1. One transaction, so the dataset never sits
  half-cleared. Only documents whose pageType is not "Case Study", so a
  project cannot be caught by it - and drafts as well as published, or a
  draft would put the value straight back on its next publish.

  Sanity keeps document history, so a mistake here is recoverable per
  document.

  Usage:
    SANITY_API_TOKEN=... node scripts/clear-dead-tile-fields.mjs
    SANITY_API_TOKEN=... APPLY=1 node scripts/clear-dead-tile-fields.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const APPLY = process.env.APPLY === '1'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}

const api = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01`
const groq = async (query) => {
  const res = await fetch(`${api}/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
    headers: {Authorization: `Bearer ${TOKEN}`},
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()).result
}

const DEAD = ['oneLineSummary', 'clientLogo']

const tiles = await groq(
  `*[_type == "caseStudy" && pageType != "Case Study" && (defined(oneLineSummary) || defined(clientLogo))]{
    _id, title, "path": slug.current, oneLineSummary, clientLogo
  } | order(title asc)`,
)

console.log(`${tiles.length} grid item(s) carrying a project-only field\n`)

const mutations = []
for (const t of tiles) {
  const fields = DEAD.filter((f) => t[f] !== undefined && t[f] !== null)
  if (!fields.length) continue
  console.log(`  ${(t.path ?? t._id).padEnd(34)} ${fields.join(', ')}`)
  if (t.oneLineSummary) {
    console.log(`      blurb: ${JSON.stringify(String(t.oneLineSummary).slice(0, 80))}`)
  }
  mutations.push({patch: {id: t._id, unset: fields}})
}

if (!mutations.length) {
  console.log('\nNothing to clear.')
  process.exit(0)
}

console.log(`\n${mutations.length} document(s) to clear.`)
if (!APPLY) {
  console.log('DRY RUN - nothing written. Set APPLY=1 to clear these.')
  process.exit(0)
}

const res = await fetch(`${api}/data/mutate/${DATASET}?returnIds=true`, {
  method: 'POST',
  headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations}),
})
const body = await res.text()
if (!res.ok) {
  console.error(`\nFAILED ${res.status} ${res.statusText}\n${body}`)
  process.exit(1)
}
console.log(`\nCleared. ${body}`)
