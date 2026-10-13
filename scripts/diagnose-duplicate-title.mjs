/*
  Every document whose title contains a phrase - drafts included - and what
  each one points at.

  Chris sees "Adelante Barbell Club More Kilos Photography" twice in the
  merch view and cannot see why. Two tiles with one title is either two
  documents (a duplicate, or a draft that is not paired with its published
  copy) or one document drawn twice; this tells which, with the ids and
  image references side by side so a duplicate is obvious.

  READ-ONLY.

  Usage: node scripts/diagnose-duplicate-title.mjs "More Kilos Photography"
*/
const TOKEN = process.env.SANITY_API_TOKEN
const PHRASE = process.argv[2] ?? 'More Kilos Photography'
const q = `*[_type == "caseStudy" && title match $p]{
  _id, _createdAt, _updatedAt, title, pageType, category,
  "parent": parentBrand->{_id, title, pageType},
  "thumb": thumbnail.asset._ref, "main": mainImage.asset._ref
} | order(_createdAt asc)`
const res = await fetch(
  `https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(q)}&$p=${encodeURIComponent(JSON.stringify(`*${PHRASE}*`))}&perspective=raw`,
  {headers: TOKEN ? {Authorization: `Bearer ${TOKEN}`} : {}},
)
const docs = (await res.json()).result ?? []
console.log(`${docs.length} document(s) titled like "${PHRASE}" (raw: drafts and published both listed)\n`)
for (const d of docs) {
  console.log(`${d._id}${d._id.startsWith('drafts.') ? '   <- DRAFT' : ''}`)
  console.log(`  "${d.title}"  [${d.pageType}, ${d.category ?? 'no category'}]`)
  console.log(`  created ${d._createdAt}, updated ${d._updatedAt}`)
  console.log(`  parent: ${d.parent ? `${d.parent.title} [${d.parent.pageType}] ${d.parent._id}` : '(none)'}`)
  console.log(`  thumbnail ${d.thumb ?? '-'}   main ${d.main ?? '-'}\n`)
}
const base = (id) => id.replace(/^drafts\./, '')
const ids = new Set(docs.map((d) => base(d._id)))
console.log(`${ids.size} distinct document(s) once drafts are paired with their published copies.`)
