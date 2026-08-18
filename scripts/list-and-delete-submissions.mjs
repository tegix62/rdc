/*
  Lists every `submission` document in the public Sanity dataset - and, only
  with APPLY=yes, deletes it.

  WHY THIS EXISTS

  Before the contact form moved to D1, enquiries were written to Sanity's
  `submission` type in the PRODUCTION dataset - which is public-read. A real
  test submission from that period, including a real phone number, is still
  sitting there. `submission` is no longer written to (functions/api/contact.ts
  writes to D1 now), so anything found here is leftover, not live data.

  Reports by default. APPLY=yes deletes every submission found.

  Usage:
    SANITY_API_TOKEN=... node scripts/list-and-delete-submissions.mjs
    SANITY_API_TOKEN=... APPLY=yes node scripts/list-and-delete-submissions.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const APPLY = process.env.APPLY === 'yes'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}

const query = `*[_type == "submission" && !(_id in path("drafts.**"))]`
const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Query failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const docs = (await res.json()).result ?? []

console.log(`\n${docs.length} submission document(s) in the public dataset:\n`)
for (const d of docs) {
  console.log(`  ${d._id}`)
  console.log(`    name:  ${d.name ?? '(none)'}`)
  console.log(`    email: ${d.email ?? '(none)'}`)
  console.log(`    phone: ${d.phone ?? '(none)'}`)
  console.log(`    createdAt: ${d._createdAt}`)
}

if (!docs.length) {
  console.log('\nNothing to do.\n')
  process.exit(0)
}

if (!APPLY) {
  console.log(`\nDry run. Re-run with APPLY=yes to delete ${docs.length} document(s).\n`)
  process.exit(0)
}

const mutate = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${DATASET}`,
  {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({mutations: docs.map((d) => ({delete: {id: d._id}}))}),
  },
)
if (!mutate.ok) {
  console.error(`\nDelete FAILED: ${mutate.status}`)
  console.error(await mutate.text())
  process.exit(1)
}

console.log(`\nDeleted ${docs.length} submission document(s) from the public dataset.\n`)
