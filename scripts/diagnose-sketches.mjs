/*
  The sketches in Sanity: how many, what each batch hangs off, and how big
  the pictures are - to confirm an upload landed, and to say how large
  they can be shown. READ-ONLY.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-sketches.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const ask = async (q, perspective = 'raw') => {
  const url = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(q)}&perspective=${perspective}`
  const res = await fetch(url, {headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {}})
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()).result
}
const docs = await ask(`*[_type == "caseStudy" && category == "Sketch"]{
  _id, title, year, "parent": parentBrand->title, "project": parentBrand->parentBrand->title,
  "w": thumbnail.asset->metadata.dimensions.width, "h": thumbnail.asset->metadata.dimensions.height,
  "size": thumbnail.asset->size, "ext": thumbnail.asset->extension
}`)
const published = docs.filter((d) => !d._id.startsWith('drafts.'))
const drafts = docs.filter((d) => d._id.startsWith('drafts.'))
console.log(`Sketches: ${published.length} published, ${drafts.length} unpublished draft(s)`)
const by = {}
for (const d of published) {
  const k = d.parent ? `${d.parent}${d.project ? ` (in ${d.project})` : ''}` : '(no parent)'
  ;(by[k] ??= []).push(d)
}
for (const [k, list] of Object.entries(by)) console.log(`  ${list.length} under ${k}`)
const noPic = published.filter((d) => !d.w)
if (noPic.length) console.log(`  ${noPic.length} with no picture: ${noPic.map((d) => d.title).slice(0, 8).join(' | ')}`)
const ws = published.filter((d) => d.w).map((d) => Math.max(d.w, d.h)).sort((a, z) => a - z)
if (ws.length) {
  const mid = ws[Math.floor(ws.length / 2)]
  console.log(`  long side: smallest ${ws[0]}px, typical ${mid}px, largest ${ws[ws.length - 1]}px`)
  const mb = published.reduce((t, d) => t + (d.size ?? 0), 0) / 1048576
  console.log(`  ${mb.toFixed(0)} MB in all; types: ${[...new Set(published.map((d) => d.ext))].join(', ')}`)
}
console.log(`  first titles: ${published.slice(0, 5).map((d) => d.title).join(' | ')}`)
