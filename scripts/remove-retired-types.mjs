/*
  Delete every document of the two retired data-collecting types, so their
  folders can leave Studio.

  WHY

  Chris, on the folders in Studio that "seem obsolete that claim to collect
  data": "yes remove those two".

    formFunnel  - the /contact step counters, frozen since 17 August 2026
                  (incrementing them was what redeployed the site several
                  hundred times). One document, `formFunnel.contact`.
    submission  - contact enquiries, from when they were written into this
                  public-read dataset. They have gone to D1 since; the
                  unauthenticated privacy check counts 0 published.

  ORDER: documents first, schema second. Removing the types from the schema
  while documents remain would leave them as orphans Studio cannot render or
  delete.

  PRINTS IDS AND TYPES ONLY. A submission holds a person's name, email and
  phone, and this repository's workflow logs are public - so no field of any
  document is ever printed, not even in the dry run.

  Dry run unless APPLY=1. Drafts included. One transaction. Read back after.

  Usage: SANITY_API_TOKEN=... [APPLY=1] node scripts/remove-retired-types.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TYPES = ['formFunnel', 'submission']
const TOKEN = process.env.SANITY_API_TOKEN
const APPLY = process.env.APPLY === '1'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is not set.')
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

// _id and _type only - see the header.
const QUERY = `*[_type in ${JSON.stringify(TYPES)}]{_id, _type}`
const docs = await groq(QUERY)
for (const t of TYPES) console.log(`${t}: ${docs.filter((d) => d._type === t).length} document(s), drafts included`)
for (const d of docs) console.log(`  ${d._type.padEnd(11)} ${d._type === 'submission' ? '(id withheld)' : d._id}`)

if (!docs.length) {
  console.log('\nNothing to delete. The schema types can go.')
  process.exit(0)
}
if (!APPLY) {
  console.log('\nDRY RUN - nothing was deleted. Set APPLY=1 to delete these.')
  process.exit(0)
}

const res = await fetch(`${api}/data/mutate/${DATASET}`, {
  method: 'POST',
  headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations: docs.map((d) => ({delete: {id: d._id}}))}),
})
if (!res.ok) {
  // The body can echo a document; report the status only.
  console.error(`\nFAILED ${res.status} ${res.statusText}`)
  process.exit(1)
}
console.log(`\nDeleted ${docs.length} document(s).`)

const left = await groq(QUERY)
if (left.length) {
  console.error(`VERIFY FAILED: ${left.length} document(s) of the retired types remain.`)
  process.exit(1)
}
console.log('Verified: no formFunnel or submission documents remain. The schema types can go.')
