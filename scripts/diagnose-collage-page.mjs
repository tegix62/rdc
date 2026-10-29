/*
  What the Collage page lists: every document its filter (COLLAGE_FILTER in
  src/lib/collage.ts) takes, with what each one is - so the page can be
  narrowed to the collages themselves. Read-only, no pictures downloaded.

  Usage: node scripts/diagnose-collage-page.mjs
*/
const OLD =
  '((category == "Collage" || slug.current match "collage-*" || slug.current match "*-collage") && !(category == "Sketch"))'
// The narrower one (src/lib/collage.ts): the title starts or ends with the word, and the piece is not filed under another.
const FILTER =
  '((category == "Collage" || string::startsWith(lower(title), "collage") || string::split(lower(title), " ")[-1] == "collage") && !defined(parentBrand) && !(category == "Sketch"))'
const Q = `*[_type == "caseStudy" && ${OLD} && !(_id in path("drafts.**"))] | order(title asc){
  title, "kept": ${FILTER}, "slug": slug.current, category, pageType, "parent": parentBrand->slug.current, assetType,
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
    [d.kept ? 'KEPT   ' : 'dropped', d.title, d.slug, `cat=${d.category ?? '-'}`, `type=${d.pageType ?? '-'}`, `parent=${d.parent ?? '-'}`, `asset=${d.assetType ?? '-'}`, d.scan ? 'scan' : '', img, d.year ?? '', d.medium ?? '']
      .filter(Boolean)
      .join(' | '),
  )
}

// And what the built page shows (its HTML only - no pictures fetched).
const base = process.env.BASE || 'https://preview.rumeau-design-co.pages.dev'
const html = await (await fetch(`${base}/collage/`)).text().catch(() => '')
const names = [...html.matchAll(/class="series__name"[^>]*>([^<]*)</g)].map((m) => m[1])
console.log(`\n${base}/collage/ shows ${names.length}: ${names.join(', ')}`)
