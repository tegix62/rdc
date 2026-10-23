/*
  Does Sanity's CDN honour a Range request on an original file?

  The build asks for the first 4 KB of every WebP, GIF and PNG original
  (src/lib/animated.ts) to see whether it is animated. If the CDN answers
  206 with 4 KB, that costs nothing; if it ignores the Range and answers
  200 with the whole file, every build downloads every such original in
  full - October 2026: 1.35 GB of Sanity bandwidth in a day with 73 builds.

  Reads only the status and headers of each answer and cancels the body,
  so this downloads next to nothing itself.

  Usage: node scripts/check-range.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

const q = `*[_type == "sanity.imageAsset" && extension in ["webp", "gif", "png"]] | order(size desc)[0...8]{url, size, extension}`
const res = await fetch(`https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(q)}`)
const assets = (await res.json()).result ?? []
const all = await (await fetch(`https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent('{"n": count(*[_type == "sanity.imageAsset" && extension in ["webp", "gif", "png"]]), "bytes": math::sum(*[_type == "sanity.imageAsset" && extension in ["webp", "gif", "png"]].size)}')}`)).json()

let honoured = 0
for (const a of assets) {
  const r = await fetch(a.url, {headers: {Range: 'bytes=0-4095', Accept: ACCEPT}})
  const len = r.headers.get('content-length')
  console.log(`${r.status} ${r.headers.get('content-range') ?? '(no content-range)'}  would send ${len ?? '?'} bytes of a ${(a.size / 1048576).toFixed(2)} MB ${a.extension}  ${a.url.split('/').pop()}`)
  if (r.status === 206) honoured++
  await r.body?.cancel()
}
console.log(`\n${honoured} of ${assets.length} answered with only the part asked for (206).`)
console.log(`The build probes ${all.result?.n ?? '?'} such originals, ${((all.result?.bytes ?? 0) / 1048576).toFixed(0)} MB in all - per build, if the Range is ignored.`)
