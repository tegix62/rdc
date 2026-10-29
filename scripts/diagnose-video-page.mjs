/*
  What is on the video page, video by video: its section, where it plays
  from (YouTube / R2 / Sanity file), whether it has a poster and the
  poster's shape, its playback setting and caption. No video downloaded.
  For bringing the video work into the All view.

  Usage: node scripts/diagnose-video-page.mjs
*/
const Q = `*[_type == "page" && slug.current == "video"][0]{
  sections[]{_type, _key, title, heading, url, videoSrc, "file": videoFile.asset->url, videoPlayback, "poster": videoPoster.asset->{"w": metadata.dimensions.width, "h": metadata.dimensions.height}, "cap": pt::text(caption), caption,
    items[]{_type, _key, url, videoSrc, "file": videoFile.asset->url, videoPlayback, "poster": videoPoster.asset->{"w": metadata.dimensions.width, "h": metadata.dimensions.height}, "cap": pt::text(caption), caption}}
}`
const res = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(Q)}`, {
  headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {},
})
const page = (await res.json()).result
if (!page) {
  console.log('no video page')
  process.exit(0)
}
const line = (v, where) => {
  const src = v.url ? `youtube/vimeo ${v.url}` : v.videoSrc ? `R2 ${v.videoSrc.split('/').pop()}` : v.file ? 'sanity file' : 'none'
  const cap = typeof v.cap === 'string' ? v.cap : typeof v.caption === 'string' ? v.caption : ''
  console.log(`${where.padEnd(28)} ${src.slice(0, 70).padEnd(70)} poster ${v.poster ? `${v.poster.w}x${v.poster.h}` : '-'}  ${v.videoPlayback ?? ''}  ${cap.slice(0, 60)}`)
}
for (const s of page.sections ?? []) {
  console.log(`\n[${s._type}] ${s.title ?? s.heading ?? ''}`)
  if (s.items) s.items.forEach((it, i) => it._type === 'mediaVideo' ? line(it, `  item ${i}`) : console.log(`  item ${i} ${it._type}`))
  else if (s.url || s.videoSrc || s.file) line(s, '  (section)')
}
