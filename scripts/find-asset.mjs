/*
  Find an uploaded picture by its file name, in Sanity and in the R2 bucket
  (outside v2/, where the site's own copies live). For when Chris names a
  picture - "the municipal selfie" - and its address is needed.

  Usage: node scripts/find-asset.mjs <word> [<word> ...]
  Env:   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (optional)
*/
const words = process.argv.slice(2).map((w) => w.toLowerCase())
if (!words.length) throw new Error('name a word to look for')

const QUERY = '*[_type == "sanity.imageAsset"]{_id, originalFilename, title, url, "w": metadata.dimensions.width, "h": metadata.dimensions.height, "alpha": metadata.hasAlpha, _createdAt}'
const res = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(QUERY)}`)
const assets = (await res.json()).result ?? []
const hit = (s) => words.some((w) => String(s ?? '').toLowerCase().includes(w))
const found = assets.filter((a) => hit(a.originalFilename) || hit(a.title))
console.log(`Sanity: ${assets.length} pictures, ${found.length} named like ${words.join(' / ')}`)
for (const a of found) console.log(`  ${a._id}  ${a.originalFilename}  ${a.w}x${a.h}${a.alpha ? ' (transparent)' : ''}  ${a._createdAt}`)

const id = (process.env.R2_ACCESS_KEY_ID ?? '').trim()
const secret = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim()
const endpoint = (process.env.R2_ENDPOINT ?? '').trim().replace(/\/$/, '').replace(/\/rdc-images$/, '')
if (id && secret && endpoint) {
  const {AwsClient} = await import('aws4fetch')
  const r2 = new AwsClient({accessKeyId: id, secretAccessKey: secret, service: 's3', region: 'auto'})
  let token = ''
  const keys = []
  for (;;) {
    const q = new URLSearchParams({'list-type': '2', 'max-keys': '1000'})
    if (token) q.set('continuation-token', token)
    const xml = await (await r2.fetch(`${endpoint}/rdc-images?${q}`)).text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) if (!m[1].startsWith('v2/')) keys.push(m[1])
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !next) break
    token = next[1]
  }
  console.log(`R2 (outside v2/): ${keys.length} files`)
  for (const k of keys) console.log(`  ${hit(k) ? '>> ' : '   '}${k}`)
}
