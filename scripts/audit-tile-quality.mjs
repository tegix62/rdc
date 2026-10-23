/*
  Which grid pictures were shrunk or squeezed too far to open well?

  Chris, October 2026: "I've been doing a lot of webp optimization trying to
  get stuff down to 500kb" - after learning that the site does its own
  resizing and compression (Sanity re-encodes every picture for each
  visitor), so squeezing an upload mostly costs quality, not visitors' time.

  For every tile's picture (Grid Thumbnail, else Main Image), from Sanity's
  own record of the file - no picture is downloaded:
    - TOO SMALL TO OPEN: the long side under 1600px. An opened tile is
      shown up to ~2000 device pixels (portfolio.astro asks for 2000), so
      below this it is stretched, and soft.
    - LIKELY OVER-COMPRESSED: a lossy file (JPEG, WebP) with fewer than
      0.35 bits per pixel. A clean 2000px photo or mockup usually needs
      more; line art on flat colour can go lower and look fine, so these
      are worth a look, not certainly damaged.
    - SERVED AS UPLOADED and over 2MB: these reach visitors as they are.
  Then a line on what to re-export, if anything.

  Usage: node scripts/audit-tile-quality.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const query = `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"] && !(_id in path("drafts.**"))]{
  title, pageType,
  "pass": select(defined(thumbnail.asset) => thumbnail.noRecompress, mainImage.noRecompress),
  "a": coalesce(thumbnail.asset->, mainImage.asset->){
    "w": metadata.dimensions.width, "h": metadata.dimensions.height, size, mimeType, "alpha": metadata.hasAlpha, _updatedAt
  }
}`
const res = await fetch(`https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`)
const docs = ((await res.json()).result ?? []).filter((d) => d.a?.w)

const kb = (b) => `${Math.round(b / 1024)}KB`
const rows = docs.map((d) => {
  const long = Math.max(d.a.w, d.a.h)
  const bpp = (d.a.size * 8) / (d.a.w * d.a.h)
  const lossy = /jpe?g|webp/.test(d.a.mimeType ?? '')
  const flags = []
  if (long < 1600) flags.push(`too small to open (${long}px long side)`)
  if (lossy && !d.pass && bpp < 0.35) flags.push(`likely over-compressed (${bpp.toFixed(2)} bits/px)`)
  if (d.pass && d.a.size > 2 * 1048576) flags.push(`served as uploaded at ${kb(d.a.size)}`)
  return {...d, long, bpp, flags}
})

const flagged = rows.filter((r) => r.flags.length).sort((a, b) => a.title.localeCompare(b.title))
console.log(`${rows.length} grid pictures checked; ${flagged.length} worth a look\n`)
for (const r of flagged) {
  console.log(`${r.title}`)
  console.log(`    ${r.a.w}x${r.a.h} ${r.a.mimeType?.replace('image/', '')} ${kb(r.a.size)} - ${r.flags.join('; ')}`)
}
const fine = rows.filter((r) => !r.flags.length)
console.log(`\n${fine.length} look fine: big enough to open, and not squeezed hard.`)
const webp = rows.filter((r) => /webp/.test(r.a.mimeType ?? ''))
console.log(`${webp.length} of the ${rows.length} are WebP uploads.`)
