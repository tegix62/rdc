/*
  The video grid items, and what the portfolio's grids make of them. Chris:
  "I'd like these to be present on Brand Identity as well! It looks like
  the relations aren't showing on that view."

  For each grid item with a video: its category, the project it is filed
  under (parentBrand), the piece it hangs off (pieceParent), whether it has
  a picture - and on the built /portfolio, whether it is a tile in the grid
  and with what category, project and family.

  Usage: node scripts/diagnose-video-items.mjs [base]
*/
const BASE = (process.argv[2] || 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const Q = `*[_type == "caseStudy" && pageType == "Grid Item" && (defined(heroVideo) || defined(heroVideoSrc)) && !(_id in path("drafts.**"))] | order(title asc){
  _id, title, category, pageType,
  "brand": parentBrand->{title, pageType, "slug": slug.current},
  "hangs": pieceParent->{title, pageType},
  "pic": defined(thumbnail.asset) || defined(mainImage.asset),
  heroVideo, heroVideoSrc
}`
const res = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(Q)}`, {
  headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {},
})
const body = await res.json()
const items = body.result ?? []
if (!body.result) console.log(JSON.stringify(body).slice(0, 400))
const html = await (await fetch(`${BASE}/portfolio`)).text()
console.log(`${items.length} video grid items\n`)
for (const it of items) {
  const id = it._id.replace(/^drafts\./, '')
  const tag = html.match(new RegExp(`<div[^>]*data-piece="${id}"[^>]*>`))?.[0]
  const attr = (n) => tag?.match(new RegExp(`${n}="([^"]*)"`))?.[1]
  console.log(
    `${it.title}\n   category ${it.category ?? '-'} | project ${it.brand ? `${it.brand.title} (${it.brand.pageType})` : '-'} | hangs off ${it.hangs?.title ?? '-'} | picture ${it.pic ? 'yes' : 'no'} | video ${it.heroVideo ? 'embed' : it.heroVideoSrc ? 'file' : '-'}\n` +
      `   grid tile: ${tag ? `yes - class "${attr('class')}", data-category "${attr('data-category') ?? ''}", family "${attr('data-family') ?? ''}"` : 'NOT IN THE GRID'}`,
  )
}
