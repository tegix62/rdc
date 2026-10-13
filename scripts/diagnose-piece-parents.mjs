/*
  Which grid items are already parented to another grid item?

  Chris wants to parent alternate shots and sketches to their SHIRT rather
  than to the case study, with the shirt still parented to the case study.
  The Parent Brand field has always accepted any caseStudy document, Grid
  Items included, and the site has quietly treated such a tile as having no
  project (no link). Before that becomes "this is an alternate shot of that
  shirt", it is worth knowing whether any data already says it by accident.

  READ-ONLY.
*/
const TOKEN = process.env.SANITY_API_TOKEN
const q = `*[_type == "caseStudy" && defined(parentBrand) && !(_id in path("drafts.**"))]{
  _id, title, pageType, category,
  "parent": parentBrand->{title, pageType, category, "grand": parentBrand->{title, pageType}}
}`
const res = await fetch(
  `https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(q)}`,
  {headers: TOKEN ? {Authorization: `Bearer ${TOKEN}`} : {}},
)
const docs = (await res.json()).result ?? []
const byType = new Map()
for (const d of docs) byType.set(d.parent?.pageType ?? '(missing)', (byType.get(d.parent?.pageType ?? '(missing)') ?? 0) + 1)
console.log(`${docs.length} document(s) with a Parent Brand`)
for (const [t, n] of byType) console.log(`  parent is ${t}: ${n}`)
const nested = docs.filter((d) => d.parent?.pageType !== 'Case Study')
console.log(`\nParented to something other than a Case Study (${nested.length}):`)
for (const d of nested) {
  console.log(
    `  ${d.title} [${d.pageType}, ${d.category ?? 'no category'}] -> ${d.parent?.title ?? '(missing)'} [${d.parent?.pageType}]` +
      (d.parent?.grand ? ` -> ${d.parent.grand.title} [${d.parent.grand.pageType}]` : ''),
  )
}
