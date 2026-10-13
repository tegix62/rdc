/*
  What the Merch & Apparel tiles actually are, as data.

  WHY THIS EXISTS

  Chris wants the Merch & Apparel view to lead with the single-mockup tees -
  "a simple tee with no background" - and put the other camera angles and
  scene mockups at the end. Before deciding whether that needs a new field he
  has to fill in for every tile, it is worth knowing whether the images
  already say it: a tee cut out on transparency is an image with an alpha
  channel, and Sanity records that for every asset (metadata.isOpaque /
  hasAlpha). The palette's dominant background says whether an opaque image
  is a flat studio colour or a photograph.

  Prints every tile the Merch filter shows, with the facts a rule could use,
  and the image URL so each verdict can be checked by eye.

  READ-ONLY.
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

const img = (f) => `${f}{
  "ref": asset._ref,
  "mime": asset->mimeType,
  "w": asset->metadata.dimensions.width,
  "h": asset->metadata.dimensions.height,
  "hasAlpha": asset->metadata.hasAlpha,
  "isOpaque": asset->metadata.isOpaque,
  "bg": asset->metadata.palette.dominant.background,
  "url": asset->url
}`
const query = `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
  && category == "Merch & Apparel" && !(_id in path("drafts.**"))
  && (defined(thumbnail) || defined(mainImage))]{
  _id, title, pageType, assetType, tileTreatment, heroTile,
  "parent": parentBrand->title,
  ${img('thumbnail')}, ${img('mainImage')}
} | order(parent asc, title asc)`

const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: TOKEN ? {Authorization: `Bearer ${TOKEN}`} : {}},
)
if (!res.ok) {
  console.error(`Sanity: ${res.status} ${await res.text()}`)
  process.exit(2)
}
const docs = (await res.json()).result ?? []

// The picture the tile actually shows: the thumbnail when it has an asset, the main image otherwise.
const shown = (d) => (d.thumbnail?.ref ? d.thumbnail : d.mainImage)

let transparent = 0
console.log(`${docs.length} Merch & Apparel tile(s)\n`)
let last = null
for (const d of docs) {
  if (d.parent !== last) {
    console.log(`\n== ${d.parent ?? '(no parent)'}`)
    last = d.parent
  }
  const s = shown(d) ?? {}
  const clear = s.isOpaque === false
  if (clear) transparent++
  console.log(
    `  ${clear ? 'CLEAR ' : 'opaque'}  ${String(s.mime ?? '?').padEnd(10)} ${String(s.w ?? '?').padStart(5)}x${String(s.h ?? '?').padEnd(5)} ` +
      `bg ${s.bg ?? '?'}  ${d.pageType === 'Case Study' ? '[STUDY] ' : ''}${d.title}` +
      `${d.assetType ? `  (${d.assetType})` : ''}${d.heroTile ? '  HERO' : ''}`,
  )
  console.log(`          ${s.url ?? '(no url)'}`)
}
console.log(`\n${transparent} of ${docs.length} show an image with real transparency.`)
