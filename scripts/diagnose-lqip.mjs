/*
  What do Sanity's tiny previews (metadata.lqip) look like for a picture on
  transparency? The world page means to trim each tile to its artwork from
  the preview, and that depends on whether transparency survives in it (and
  if not, what it is flattened to). Reads metadata only; downloads no
  pictures. Usage: node scripts/diagnose-lqip.mjs
*/
import sharp from 'sharp'

const q = `{
  "alpha": *[_type == "sanity.imageAsset" && metadata.hasAlpha == true && defined(metadata.lqip)][0...6]{originalFilename, "lqip": metadata.lqip, "opaque": metadata.isOpaque, "bg": metadata.palette.dominant.background},
  "solid": *[_type == "sanity.imageAsset" && metadata.hasAlpha != true && defined(metadata.lqip)][0...3]{originalFilename, "lqip": metadata.lqip, "opaque": metadata.isOpaque, "bg": metadata.palette.dominant.background}
}`
const res = await fetch(`https://8337vjtf.apicdn.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(q)}`)
const {result} = await res.json()
for (const [kind, list] of Object.entries(result)) {
  console.log(`\n== ${kind}`)
  for (const a of list) {
    const head = a.lqip.slice(0, a.lqip.indexOf(','))
    const buf = Buffer.from(a.lqip.slice(a.lqip.indexOf(',') + 1), 'base64')
    const {data, info} = await sharp(buf).raw().toBuffer({resolveWithObject: true})
    const px = (x, y) => {
      const k = (y * info.width + x) * info.channels
      return Array.from(data.subarray(k, k + info.channels)).join(',')
    }
    const w = info.width - 1
    const h = info.height - 1
    console.log(`${(a.originalFilename ?? '').slice(0, 40).padEnd(40)} ${head} ${info.width}x${info.height}x${info.channels} isOpaque=${a.opaque} bg=${a.bg}`)
    console.log(`   corners ${px(0, 0)} | ${px(w, 0)} | ${px(0, h)} | ${px(w, h)}   centre ${px(w >> 1, h >> 1)}`)
  }
}
