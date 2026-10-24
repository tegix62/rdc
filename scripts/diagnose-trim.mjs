/*
  How much each grid tile would be trimmed (src/lib/trim.ts), from the
  tiny previews of the real pictures. Reads metadata only; downloads no
  pictures. Usage: node scripts/diagnose-trim.mjs
*/
import sharp from 'sharp'
import {trimOf} from '../src/lib/trim.ts'

const q = `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"] && (defined(thumbnail.asset) || defined(mainImage.asset))]{
  title, "a": coalesce(thumbnail.asset, mainImage.asset)->{"lqip": metadata.lqip, "alpha": metadata.hasAlpha}
} | order(title asc)`
const res = await fetch(`https://8337vjtf.apicdn.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(q)}`)
const {result} = await res.json()
let trimmed = 0
for (const it of result) {
  const l = it.a?.lqip
  if (!l) continue
  const t = await trimOf(l)
  // What the bounding box is before the "not worth it" rule, for reading.
  const buf = Buffer.from(l.slice(l.indexOf(',') + 1), 'base64')
  const {info} = await sharp(buf).raw().toBuffer({resolveWithObject: true})
  if (t) trimmed++
  const area = t ? ((t.x1 - t.x0) * (t.y1 - t.y0) * 100).toFixed(0) + '%' : 'whole'
  console.log(`${area.padStart(6)}  ${l.slice(5, l.indexOf(';')).padEnd(11)} ${info.width}x${info.height}x${info.channels} alpha=${it.a.alpha}  ${(it.title ?? '').slice(0, 50)}`)
}
console.log(`\n${trimmed} of ${result.length} trimmed`)
