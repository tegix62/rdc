/*
  PICTURES FROM R2 - a build step after proxy-images.mjs. See
  scripts/lib/r2-images.mjs for why and for the keys.

  1. Every /img/v2/ picture the built pages use.
  2. Those not yet in the rdc-images bucket are copied in: fetched from the
     live site's own /img/ route (mostly out of Cloudflare's cache, so
     Sanity is rarely asked), stored as the route serves them, marked to be
     kept for a year. At most R2_MAX_UPLOADS a build (default 300), because
     each fetch is one of the 100,000 Function requests a day; the first
     full copy is a run with a high cap, just after the daily reset.
  3. Every page's pictures that are in the bucket are pointed at
     img.rumeaudesign.co; the rest keep /img/ until a later build copies them.

  Without the R2 secrets it changes nothing: the pages keep /img/.

  Usage: node scripts/r2-images.mjs [dist-dir]
  Env:   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (secrets);
         R2_MAX_UPLOADS, R2_SOURCE (default https://rumeaudesign.co)
*/
import {readdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {findPictures, findScans, keyFor, markScans, rewritePictures} from './lib/r2-images.mjs'

const DIST = process.argv[2] ?? 'dist'
const BUCKET = 'rdc-images'
const SOURCE = (process.env.R2_SOURCE || 'https://rumeaudesign.co').replace(/\/$/, '')
const MAX = Number(process.env.R2_MAX_UPLOADS ?? 300)
const id = (process.env.R2_ACCESS_KEY_ID ?? '').trim()
const secret = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim()
const ENDPOINT = (process.env.R2_ENDPOINT ?? '').trim().replace(/\/$/, '').replace(/\/rdc-images$/, '')

if (!id || !secret || !ENDPOINT) {
  console.log('[r2-images] no R2 secrets here - pictures stay on /img/')
  process.exit(0)
}

// Cloudflare's token page shows several values; say which secret holds the
// wrong one, by its length only (never the value).
const wrong = []
if (id.length !== 32) wrong.push(`R2_ACCESS_KEY_ID is ${id.length} characters, an Access Key ID is 32 (the "Token value" is a different thing)`)
if (secret.length !== 64) wrong.push(`R2_SECRET_ACCESS_KEY is ${secret.length} characters, a Secret Access Key is 64`)
if (!/^https:\/\/[0-9a-f]{32}\.(eu\.|fedramp\.)?r2\.cloudflarestorage\.com$/.test(ENDPOINT)) wrong.push('R2_ENDPOINT should be https://<account id>.r2.cloudflarestorage.com')
if (wrong.length) {
  for (const w of wrong) console.log(`[r2-images] ${w}`)
  console.log('[r2-images] pictures stay on /img/ until the secrets are fixed')
  process.exit(0)
}

const {AwsClient} = await import('aws4fetch')
const r2 = new AwsClient({accessKeyId: id, secretAccessKey: secret, service: 's3', region: 'auto'})
const bucketUrl = `${ENDPOINT}/${BUCKET}`

async function* htmlFiles(dir) {
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* htmlFiles(p)
    else if (e.name.endsWith('.html')) yield p
  }
}

// What is in the bucket already.
async function listKeys() {
  const keys = new Set()
  let token = ''
  for (;;) {
    const q = new URLSearchParams({'list-type': '2', prefix: 'v2/', 'max-keys': '1000'})
    if (token) q.set('continuation-token', token)
    const res = await r2.fetch(`${bucketUrl}?${q}`)
    if (!res.ok) throw new Error(`listing the bucket: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const xml = await res.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.add(m[1].replace(/&amp;/g, '&'))
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !next) break
    token = next[1]
  }
  return keys
}

let have
try {
  have = await listKeys()
} catch (e) {
  console.log(`[r2-images] could not read the bucket (${String(e).slice(0, 200)}) - pictures stay on /img/`)
  process.exit(0)
}

// 1. Every picture the pages use, by key.
const files = []
const wanted = new Map()
for await (const file of htmlFiles(DIST)) {
  const html = await readFile(file, 'utf8')
  files.push(file)
  for (const p of findPictures(html)) {
    const key = keyFor(p.path, p.query)
    if (key && !wanted.has(key)) wanted.set(key, p)
  }
}
// Then the magnifiers' patches - after the pictures, so a capped build
// copies what every visitor sees first.
const pictures = wanted.size
for (const file of files) {
  for (const scan of findScans(await readFile(file, 'utf8')))
    for (const p of scan.patches) if (p.key && !wanted.has(p.key)) wanted.set(p.key, p)
}
console.log(`[r2-images] ${wanted.size - pictures} magnifier patches`)
const missing = [...wanted.keys()].filter((k) => !have.has(k))
console.log(`[r2-images] ${wanted.size} pictures in the pages; ${wanted.size - missing.length} already in R2, ${missing.length} to copy (at most ${MAX} this build)`)

// 2. Copy what is missing, a few at a time.
let copied = 0
let failed = 0
const queue = missing.slice(0, MAX)
async function worker() {
  for (;;) {
    const key = queue.shift()
    if (!key) return
    const p = wanted.get(key)
    try {
      const src = await fetch(`${SOURCE}/img/v2/${p.path}${p.query ? `?${p.query}` : ''}`, {headers: {accept: 'image/webp,image/*;q=0.9,*/*;q=0.8'}})
      const type = src.headers.get('content-type') ?? ''
      if (!src.ok || !type.startsWith('image/')) throw new Error(`source HTTP ${src.status} ${type}`)
      const body = new Uint8Array(await src.arrayBuffer())
      const put = await r2.fetch(`${bucketUrl}/${key.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'PUT',
        body,
        headers: {'content-type': type, 'cache-control': 'public, max-age=31536000, immutable'},
      })
      if (!put.ok) throw new Error(`R2 HTTP ${put.status} ${(await put.text()).slice(0, 120)}`)
      have.add(key)
      copied++
    } catch (e) {
      failed++
      if (failed <= 5) console.log(`[r2-images] could not copy ${key}: ${String(e).slice(0, 160)}`)
    }
  }
}
await Promise.all(Array.from({length: 8}, worker))
console.log(`[r2-images] copied ${copied}, ${failed} failed, ${Math.max(0, missing.length - MAX)} left for a later build`)

// The public address serves what the bucket holds - one picture, fetched for real.
const sample = [...wanted.keys()].find((k) => have.has(k))
if (sample) {
  try {
    const res = await fetch(`https://img.rumeaudesign.co/${sample}`)
    console.log(`[r2-images] img.rumeaudesign.co answers: HTTP ${res.status}, ${res.headers.get('content-type')}, ${res.headers.get('cache-control')}`)
    if (!res.ok) {
      console.log('[r2-images] the public address does not serve the bucket - pictures stay on /img/')
      process.exit(0)
    }
  } catch (e) {
    console.log(`[r2-images] img.rumeaudesign.co did not answer (${String(e).slice(0, 120)}) - pictures stay on /img/`)
    process.exit(0)
  }
}

// 3. Point the pages at what is in R2.
let moved = 0
let kept = 0
let marked = 0
for (const file of files) {
  const before = await readFile(file, 'utf8')
  const r = rewritePictures(before, have)
  const l = markScans(r.html, have)
  if (r.moved || l.marked) await writeFile(file, l.html)
  moved += r.moved
  kept += r.kept
  marked += l.marked
}
console.log(`[r2-images] ${moved} picture address(es) now load from img.rumeaudesign.co; ${kept} still through /img/`)
console.log(`[r2-images] ${marked} magnifier(s) take their patches from R2`)
