/*
  What the Collage page lists: every document its filter (COLLAGE_FILTER in
  src/lib/collage.ts) takes, with what each one is - so the page can be
  narrowed to the collages themselves. Read-only, no pictures downloaded.

  Usage: node scripts/diagnose-collage-page.mjs
*/
const FILTER =
  '((category == "Collage" || slug.current match "collage-*" || slug.current match "*-collage") && !(category == "Sketch"))'
const Q = `*[_type == "caseStudy" && ${FILTER} && !(_id in path("drafts.**"))] | order(title asc){
  title, "slug": slug.current, category, pageType, "parent": parentBrand->slug.current, assetType,
  "scan": defined(fullScan), year, medium, realWidth, 
  "img": coalesce(mainImage.asset->metadata.dimensions, thumbnail.asset->metadata.dimensions){width, height}
}`
const res = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(Q)}`, {
  headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {},
})
const body = await res.json()
if (!body.result) {
  console.log(JSON.stringify(body).slice(0, 500))
  process.exit(1)
}
console.log(`${body.result.length} documents\n`)
for (const d of body.result) {
  const img = d.img ? `${d.img.width}x${d.img.height}` : 'no image'
  console.log(
    [d.title, d.slug, `cat=${d.category ?? '-'}`, `type=${d.pageType ?? '-'}`, `parent=${d.parent ?? '-'}`, `asset=${d.assetType ?? '-'}`, d.scan ? 'scan' : '', img, d.year ?? '', d.medium ?? '']
      .filter(Boolean)
      .join(' | '),
  )
}
