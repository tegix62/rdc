/*
  Why is one piece not on the site? Looks a piece up by title in the
  published dataset and says, field by field, whether it meets what the
  Portfolio needs (getAllGridItems and tileImage): a page type of Case Study
  or Grid Item, a Grid Thumbnail or Main Image with a FILE in it (an image
  field can be saved with no file), a category for the filters, a parent
  project for the gather. Then whether a draft is waiting unpublished.

  Usage: node scripts/diagnose-piece.mjs "BalloonShop"
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TERM = process.argv[2] ?? ''
if (!TERM) {
  console.log('Give part of the title to look for.')
  process.exit(1)
}

const query = `*[_type == "caseStudy" && title match $term]{
  _id, _updatedAt, title, pageType, category, merchPlacement,
  "thumbFile": thumbnail.asset->{_id, url, "w": metadata.dimensions.width, "h": metadata.dimensions.height, size, "opaque": metadata.isOpaque},
  "mainFile": mainImage.asset->{_id, url, "w": metadata.dimensions.width, "h": metadata.dimensions.height, size},
  "thumbSet": defined(thumbnail), "mainSet": defined(mainImage),
  "thumbCrop": thumbnail.crop, "mainCrop": mainImage.crop,
  "parent": parentBrand->{title, pageType, "parent": parentBrand->title}
}`
const ask = async (q, token) => {
  const url = `https://${PROJECT_ID}.${token ? 'api' : 'apicdn'}.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(q)}&$term=${encodeURIComponent(JSON.stringify(`*${TERM}*`))}${token ? '&perspective=raw' : ''}`
  const res = await fetch(url, token ? {headers: {authorization: `Bearer ${token}`}} : {})
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()).result ?? []
}

const docs = await ask(query)
const token = process.env.SANITY_API_TOKEN
const all = token ? await ask(query, token) : []
const drafts = all.filter((d) => d._id.startsWith('drafts.'))

console.log(`Published pieces matching "${TERM}": ${docs.filter((d) => !d._id.startsWith('drafts.')).length}`)
for (const d of docs.filter((d) => !d._id.startsWith('drafts.'))) {
  const file = d.thumbFile ?? d.mainFile
  const ok = (good, text, fix) => console.log(`  ${good ? 'ok  ' : 'NO  '} ${text}${good || !fix ? '' : ` - ${fix}`}`)
  console.log(`\n${d.title}  (last changed ${d._updatedAt})`)
  ok(['Case Study', 'Grid Item'].includes(d.pageType), `Page Type: ${d.pageType ?? '(empty)'}`, 'set it to Grid Item')
  ok(!!file, `picture: ${d.thumbFile ? 'Grid Thumbnail' : d.mainFile ? 'Main Image' : 'none'}${file ? `, ${file.w}x${file.h}, ${(file.size / 1048576).toFixed(1)} MB` : ''}`,
    d.thumbSet || d.mainSet ? 'the image field is saved but holds no file - upload the picture into it' : 'add a Grid Thumbnail')
  // Both picture fields, as uploaded: the site shows the Grid Thumbnail
  // when it holds a file, so a small one there hides a big Main Image.
  for (const [name, f, crop] of [['Grid Thumbnail', d.thumbFile, d.thumbCrop], ['Main Image', d.mainFile, d.mainCrop]]) {
    if (!f) continue
    const kept = crop ? (1 - (crop.left ?? 0) - (crop.right ?? 0)) : 1
    console.log(`       ${name}: ${f.w}x${f.h}, ${(f.size / 1048576).toFixed(1)} MB, ${f.url}${crop && kept < 0.999 ? ` - cropped to ${Math.round(kept * 100)}% of its width (${Math.round(f.w * kept)}px)` : ''}`)
  }
  ok(!!d.category, `Category: ${d.category ?? '(empty)'}`, 'set Merch & Apparel to show under that filter')
  ok(!!d.parent, `Parent Brand: ${d.parent ? `${d.parent.title}${d.parent.parent ? ` (in ${d.parent.parent})` : ''}` : '(none)'}`, 'set the project, so it gathers with it')
  if (d.category === 'Merch & Apparel') console.log(`       merch view: ${d.merchPlacement ?? (d.thumbFile?.opaque === false ? 'front (see-through background)' : 'back (has a background)')}`)
}
// Every piece under each matching project, whatever it is called - and
// whether the All view would gather it (four pieces or more, the project's
// own tile included; FAMILY_MIN in portfolio.astro).
for (const d of docs.filter((d) => d.pageType === 'Case Study')) {
  const kids = await ask(`*[_type == "caseStudy" && !(_id in path("drafts.**")) && (parentBrand._ref == "${d._id}" || parentBrand->parentBrand._ref == "${d._id}")]{title, pageType, "pic": defined(coalesce(thumbnail.asset, mainImage.asset)), category}`)
  const shown = kids.filter((k) => k.pic && ['Case Study', 'Grid Item'].includes(k.pageType))
  console.log(`\n${d.title}: ${shown.length} piece(s) under it on the grid, ${shown.length + 1} with its own tile - ${shown.length + 1 >= 4 ? 'gathers in the All view' : 'too few to gather in the All view (needs 4)'}`)
  for (const k of kids) console.log(`  ${k.pic ? '   ' : 'NO '} ${k.title} (${k.pageType ?? 'no page type'}, ${k.category ?? 'no category'})`)
}
if (token) {
  for (const d of drafts) console.log(`\nDRAFT waiting, not published: ${d.title} (changed ${d._updatedAt}) - press Publish in Studio`)
} else {
  console.log('\n(no token here, so unpublished drafts cannot be seen)')
}
