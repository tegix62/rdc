/*
  What each project could say around its cluster, from what is already in
  Sanity: the words a title block and a result block would draw on.

  Chris wants the case study block above a merch gather and maybe "a result
  block". Before designing either, this counts what exists - a block that
  only three projects can fill is a different design from one all of them
  can.

  READ-ONLY. Published documents only.

  Usage: node scripts/diagnose-cluster-copy.mjs
*/
const q = `*[_type == "caseStudy" && pageType == "Case Study" && !(_id in path("drafts.**"))] | order(title asc){
  title, "slug": slug.current, subtitle, headline, client, resultStat, category,
  "summary": pt::text(summary),
  "pieces": count(*[_type == "caseStudy" && (parentBrand._ref == ^._id || parentBrand->parentBrand._ref == ^._id)])
}`
const res = await fetch(
  `https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(q)}`,
)
if (!res.ok) {
  console.error(`${res.status} ${res.statusText}`)
  process.exit(1)
}
const rows = (await res.json()).result
const clip = (s, n = 90) => (s ? (s.length > n ? `${s.slice(0, n)}...` : s) : '-')
const has = (k) => rows.filter((r) => typeof r[k] === 'string' ? r[k].trim() : r[k]).length
console.log(`${rows.length} projects. Filled in: summary ${has('summary')}, result stat ${has('resultStat')}, client ${has('client')}, kicker ${has('subtitle')}, display headline ${has('headline')}\n`)
for (const r of rows) {
  console.log(`${r.title}  (/work/${r.slug}, ${r.pieces} pieces, ${r.category ?? 'no category'})`)
  console.log(`  kicker:  ${clip(r.subtitle)}`)
  console.log(`  client:  ${clip(r.client)}`)
  console.log(`  result:  ${clip(r.resultStat)}`)
  console.log(`  summary: ${clip(r.summary, 140)}${r.summary ? ` (${r.summary.length} chars)` : ''}`)
  console.log('')
}
