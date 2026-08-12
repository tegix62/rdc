/*
  Write the search descriptions Chris approved.

  Four were over the ~160 characters Google renders, all migrated from Webflow
  and all saying "heritage" twice while listing the same three audiences twice.
  The fifth is a blog post that had no written description at all and was
  shipping "How I Overworked a Flyer — notes from Rumeau Design Co.", which is
  assembled from the title and reads like it.

  Not shortened in code. Over-length descriptions are not penalised - Google
  truncates them for display - and the head sends max-snippet:-1, so cutting
  them automatically would discard a tail somebody wrote in exchange for
  nothing. These are rewrites, which is the thing truncation cannot do.

  DRY BY DEFAULT. Changes nothing unless SET=yes.

  Usage:
    SANITY_API_TOKEN=... node scripts/set-descriptions.mjs
    SANITY_API_TOKEN=... SET=yes node scripts/set-descriptions.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const API = `https://${PROJECT_ID}.api.sanity.io`
const TOKEN = process.env.SANITY_API_TOKEN
const LIVE = process.env.SET === 'yes'

/*
  Hyphens, not em dashes, at Chris's instruction - his house style.

  Worth stating so nobody "improves" them back: an em dash here is a typographic
  preference, and this is his copy.
*/
const CHANGES = [
  {
    type: 'page',
    slug: 'home',
    field: 'seoDescription',
    text:
      'Brand identity and merch design for apparel brands and musicians. ' +
      'Heritage-style branding, custom type and illustration by Chris Rumeau, New Jersey.',
  },
  {
    type: 'page',
    slug: 'about',
    field: 'seoDescription',
    text:
      'Chris Rumeau builds brand identities for apparel brands and musicians - ' +
      'heritage craft, hand-drawn precision, based in New Jersey.',
  },
  {
    type: 'page',
    slug: 'portfolio',
    field: 'seoDescription',
    text:
      'Brand identity, merch and illustration work by Chris Rumeau - heritage-style ' +
      'branding and apparel graphics for startups, musicians and apparel brands.',
  },
  {
    type: 'blogPost',
    slug: 'brand-identity-cost-why-400-is-too-low',
    field: 'metaDescription',
    text:
      'Why a $400 budget rarely buys a brand identity that works - what quality ' +
      'branding involves, and what you get for the difference.',
  },
  {
    type: 'blogPost',
    slug: 'how-i-overworked-a-flyer',
    field: 'metaDescription',
    text:
      'A flyer for Two Point Oh that kept getting louder. On knowing when a design ' +
      'is finished, and what happens when the client is good and you are the problem.',
  },
]

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}
const auth = {Authorization: `Bearer ${TOKEN}`}

const groq = async (query) => {
  const res = await fetch(`${API}/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
    headers: auth,
  })
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

console.log(LIVE ? '# Writing descriptions\n' : '# DRY RUN - nothing will be changed\n')

/*
  Published documents, plus a check for whether a draft exists.

  Patching the published document is what makes the change live, but if a draft
  is open on the same document Studio shows the DRAFT - so the edit would look
  like it had not happened, and publishing that draft later would silently
  overwrite what this wrote. That is a confusing enough failure to be worth
  refusing rather than warning about.
*/
const types = [...new Set(CHANGES.map((c) => c.type))]
const docs = await groq(`*[_type in ${JSON.stringify(types)} && defined(slug.current)]{
  _id, _type, "slug": slug.current, title,
  "isDraft": _id in path("drafts.**")
}`)

const published = new Map(docs.filter((d) => !d.isDraft).map((d) => [`${d._type}:${d.slug}`, d]))
const drafts = new Set(docs.filter((d) => d.isDraft).map((d) => `${d._type}:${d.slug}`))

const missing = CHANGES.filter((c) => !published.has(`${c.type}:${c.slug}`))
if (missing.length) {
  console.error('No published document for:')
  for (const c of missing) console.error(`  ${c.type} / ${c.slug}`)
  process.exit(1)
}

const blocked = CHANGES.filter((c) => drafts.has(`${c.type}:${c.slug}`))
if (blocked.length) {
  console.error('These documents have unpublished drafts open in Studio:\n')
  for (const c of blocked) console.error(`  ${c.type} / ${c.slug}`)
  console.error(
    '\nStudio shows the draft, so this change would appear not to have happened -\n' +
      'and publishing that draft later would overwrite it. Publish or discard the\n' +
      'drafts first, then re-run.',
  )
  process.exit(1)
}

// --- what would change --------------------------------------------------------
const current = await groq(`*[_id in ${JSON.stringify(CHANGES.map((c) => published.get(`${c.type}:${c.slug}`)._id))}]{
  _id, seoDescription, metaDescription
}`)
const byId = new Map(current.map((d) => [d._id, d]))

for (const c of CHANGES) {
  const doc = published.get(`${c.type}:${c.slug}`)
  const was = byId.get(doc._id)?.[c.field] ?? ''
  console.log(`${c.type} / ${c.slug}  (${c.field})`)
  console.log(`  was  ${was ? `${was.length} chars` : '(empty)'}`)
  if (was) console.log(`       ${was}`)
  console.log(`  now  ${c.text.length} chars`)
  console.log(`       ${c.text}`)
  if (c.text.length > 160) console.log(`  WARNING: still over 160`)
  if (/[—–]/.test(c.text)) console.log(`  WARNING: contains an em or en dash`)
  console.log()
}

if (!LIVE) {
  console.log('DRY RUN. Nothing was changed. Re-run with SET=yes to apply.')
  process.exit(0)
}

const mutations = CHANGES.map((c) => ({
  patch: {
    id: published.get(`${c.type}:${c.slug}`)._id,
    set: {[c.field]: c.text},
  },
}))

const res = await fetch(`${API}/v2024-01-01/data/mutate/${DATASET}`, {
  method: 'POST',
  headers: {...auth, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations}),
})
if (!res.ok) throw new Error(`Patch failed: ${res.status} ${await res.text()}`)

/*
  Read back the TEXT, not a count. "5 documents patched" would be equally true
  of five documents patched with the wrong strings.
*/
const after = await groq(`*[_id in ${JSON.stringify(CHANGES.map((c) => published.get(`${c.type}:${c.slug}`)._id))}]{
  _id, seoDescription, metaDescription
}`)
const afterById = new Map(after.map((d) => [d._id, d]))

console.log('Written. Reading it back:\n')
let wrong = 0
for (const c of CHANGES) {
  const doc = published.get(`${c.type}:${c.slug}`)
  const got = afterById.get(doc._id)?.[c.field]
  const ok = got === c.text
  if (!ok) wrong += 1
  console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${c.type} / ${c.slug}`)
  if (!ok) console.log(`         got: ${got ?? '(nothing)'}`)
}

if (wrong) {
  console.error(`\n${wrong} did not come back as written. Check Studio.`)
  process.exit(1)
}
console.log('\nAll five written. Live at the next deploy - or immediately, if the')
console.log('publish webhook fires from any Studio edit.')
