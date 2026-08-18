/*
  Unpublish specific blogPost documents by slug - moves each one to a draft
  (`drafts.<id>`) rather than deleting it, so the writing that exists is not
  lost and Chris can finish and republish from Studio whenever he gets to it.

  WHY A DRAFT, NOT A DELETE

  These were published by accident before the post itself was actually
  written - the words are missing, not wrong. Deleting throws away the slug,
  the image picks, anything already set up; moving to draft keeps all of that
  and simply takes it off the live site, which is the only thing that was
  actually broken.

  Reports by default. APPLY=yes performs the move.

  Usage:
    SANITY_API_TOKEN=... SLUGS=professional-design,my-first-logo node scripts/unpublish-blog-posts.mjs
    SANITY_API_TOKEN=... SLUGS=... APPLY=yes node scripts/unpublish-blog-posts.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const APPLY = process.env.APPLY === 'yes'
const SLUGS = (process.env.SLUGS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}
if (!SLUGS.length) {
  console.error('SLUGS is required - a comma-separated list of blogPost slugs to unpublish.')
  process.exit(1)
}

// Slugs inlined as a JSON array literal directly in the GROQ string, matching
// every other read-only script in this repo, rather than the query-param
// mechanism ($slugs=...) - one fewer thing to get wrong against an API this
// sandbox cannot reach to test.
const slugList = JSON.stringify(SLUGS)
const query = `*[_type == "blogPost" && slug.current in ${slugList} && !(_id in path("drafts.**"))]`
const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Query failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const docs = (await res.json()).result ?? []

console.log(`\nFound ${docs.length} of ${SLUGS.length} requested slug(s):\n`)
for (const slug of SLUGS) {
  const doc = docs.find((d) => d.slug?.current === slug)
  console.log(doc ? `  FOUND    ${slug} (${doc._id})` : `  MISSING  ${slug} - already unpublished, or the slug is wrong`)
}

if (!docs.length) {
  console.log('\nNothing to do.\n')
  process.exit(0)
}

if (!APPLY) {
  console.log(`\nDry run. Re-run with APPLY=yes to move ${docs.length} document(s) to draft.\n`)
  process.exit(0)
}

const mutations = docs.flatMap((doc) => {
  // Strip system fields that createIfNotExists does not accept / should not carry over.
  const {_id, _rev, _createdAt, _updatedAt, ...rest} = doc
  return [
    {createIfNotExists: {...rest, _id: `drafts.${_id}`}},
    {delete: {id: _id}},
  ]
})

const mutate = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${DATASET}`,
  {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({mutations}),
  },
)
if (!mutate.ok) {
  console.error(`\nUnpublish FAILED: ${mutate.status}`)
  console.error(await mutate.text())
  process.exit(1)
}

console.log(`\nMoved ${docs.length} document(s) to draft. They no longer appear on /blog or in the`)
console.log('sitemap, and each one is still fully there in Studio, waiting as a draft to be')
console.log('finished and republished whenever.\n')
