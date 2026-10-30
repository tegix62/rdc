/*
  The homepage pictures in Site Settings: which file each is. For bringing
  the original homepage's "blue logo flash sheet" to the work-first one.
  Usage: node scripts/diagnose-hero.mjs
*/
const Q = `*[_type == "siteSettings"][0]{
  "heroBackground": heroBackground.asset->{originalFilename, mimeType, size, "w": metadata.dimensions.width, "h": metadata.dimensions.height, url},
  "heroVideo": heroVideo.asset->{originalFilename, mimeType, size},
  "proofBand": proofBandBackground.asset->{originalFilename, mimeType, size, "w": metadata.dimensions.width, "h": metadata.dimensions.height},
  "portrait": portrait.asset->{originalFilename}
}`
const res = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(Q)}`, {
  headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {},
})
console.log(JSON.stringify((await res.json()).result, null, 2))
// Other uploads that look like a flash sheet, by file name.
const F = `*[_type == "sanity.imageAsset" && (originalFilename match "*flash*" || originalFilename match "*Flash*")]{originalFilename, mimeType, size, "w": metadata.dimensions.width, "h": metadata.dimensions.height, _id}`
const r2 = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(F)}`, {
  headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {},
})
console.log('\nflash uploads:', JSON.stringify((await r2.json()).result, null, 2))
