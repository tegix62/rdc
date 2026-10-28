/*
  How busy each piece in the All view is, measured from what Sanity already
  knows about its picture - no picture is downloaded.

  Chris: "Is there a way to perhaps measure the complexity of an image to
  give it more size?" - and the Chateau Seven C7 icon, a simple mark, is
  "gigantic". Compressed bytes per pixel is a fair stand-in for detail: a
  flat mark on white compresses to almost nothing, a dense illustration or
  a photograph does not. Printed per piece with its kind, format and shape,
  most detailed first, to see whether it sorts them the way an eye would.

  Usage: node scripts/diagnose-complexity.mjs
*/
const Q = `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"] && !(category == "Sketch")
  && (defined(thumbnail) || defined(mainImage))]{
  title, pageType, category, heroTile, tileTreatment,
  "a": coalesce(thumbnail.asset, mainImage.asset)->{size, mimeType, "w": metadata.dimensions.width, "h": metadata.dimensions.height, "alpha": metadata.hasAlpha, "opaque": metadata.isOpaque, "lqip": metadata.lqip}
}`
const url = `https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(Q)}`
const res = await fetch(url, {headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {}})
const rows = (await res.json()).result.filter((r) => r.a?.size)
for (const r of rows) {
  r.bpp = r.a.size / (r.a.w * r.a.h)
  r.lq = (r.a.lqip ?? '').length
}
rows.sort((a, z) => z.lq - a.lq)
console.log('lqip-len  bytes/px  format  w x h        kind        treatment  title')
for (const r of rows)
  console.log(
    `${String(r.lq).padStart(8)}  ${r.bpp.toFixed(3).padStart(8)}  ${(r.a.mimeType ?? '').replace('image/', '').padEnd(6)}  ${`${r.a.w}x${r.a.h}`.padEnd(11)}  ${(r.pageType === 'Case Study' ? 'CASE' : r.heroTile ? 'hero' : '').padEnd(10)}  ${(r.tileTreatment ?? '').padEnd(9)}  ${r.title}`,
  )
