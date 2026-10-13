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

/*
  ONE DOCUMENT CAN STILL BE SEEN TWICE - THROUGH ITS PICTURE.

  If another tile shows the same image file, the grid has two tiles that
  look identical and, at a glance, read as the same piece twice. So every
  other document using any of these images is listed too.
*/
const refs = [...new Set(docs.flatMap((d) => [d.thumb, d.main]).filter(Boolean))]
if (refs.length) {
  const q2 = `*[_type == "caseStudy" && (thumbnail.asset._ref in $refs || mainImage.asset._ref in $refs)]{
    _id, title, pageType, category, "parent": parentBrand->title,
    "thumb": thumbnail.asset._ref, "main": mainImage.asset._ref
  }`
  const r2 = await fetch(
    `https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(q2)}&$refs=${encodeURIComponent(JSON.stringify(refs))}&perspective=raw`,
    {headers: TOKEN ? {Authorization: `Bearer ${TOKEN}`} : {}},
  )
  const same = ((await r2.json()).result ?? []).filter((d) => !docs.some((x) => x._id === d._id))
  console.log(`\n${same.length} OTHER document(s) using the same picture:`)
  for (const d of same) {
    const which = refs.includes(d.thumb) ? 'as its Tile Image (thumbnail)' : 'as its Main Image (and the tile falls back to it)'
    console.log(`  ${d._id}  "${d.title}" [${d.pageType}, ${d.category ?? 'no category'}], parent ${d.parent ?? '(none)'} - ${which}`)
  }
}
