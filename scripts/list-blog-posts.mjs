/*
  Every published blogPost, with enough of the body to judge "is this
  actually written" rather than guessing from the slug.

  READ-ONLY.

  Usage: SANITY_API_TOKEN=... node scripts/list-blog-posts.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only use).')
  process.exit(1)
}

const query = `*[_type == "blogPost" && !(_id in path("drafts.**"))] | order(publishedAt desc){
  _id, title, slug, publishedAt, excerpt, metaDescription, body
}`
const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Query failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const posts = (await res.json()).result ?? []
console.log(`\n${posts.length} published blog post(s)\n${'='.repeat(74)}`)

const wordCount = (body) => {
  if (!Array.isArray(body)) return 0
  const text = body
    .filter((b) => b._type === 'block')
    .flatMap((b) => (b.children ?? []).map((c) => c.text ?? ''))
    .join(' ')
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

for (const p of posts) {
  console.log(`\n_id: ${p._id}`)
  console.log(`title: ${p.title}`)
  console.log(`slug: ${p.slug?.current}`)
  console.log(`publishedAt: ${p.publishedAt}`)
  console.log(`excerpt: ${p.excerpt ?? '(none)'}`)
  console.log(`metaDescription: ${p.metaDescription ?? '(none)'}`)
  console.log(`body blocks: ${Array.isArray(p.body) ? p.body.length : 0}`)
  console.log(`body word count: ${wordCount(p.body)}`)
  console.log(`body preview:`)
  const text = (p.body ?? [])
    .filter((b) => b._type === 'block')
    .flatMap((b) => (b.children ?? []).map((c) => c.text ?? ''))
    .join(' ')
  console.log(`  ${text.slice(0, 500)}${text.length > 500 ? '…' : ''}`)
}
console.log(`\n${'='.repeat(74)}\n`)
