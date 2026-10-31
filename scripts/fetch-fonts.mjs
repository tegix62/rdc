/*
  Licensed fonts, put in place for the PREVIEW build only.

  The repository is public, so a licensed font cannot be committed to it:
  anyone could download it from GitHub, which a webfont licence does not
  allow. It is uploaded in Studio's Fonts tool (studio/tools/FontsTool.tsx)
  as a Sanity asset labelled "site-font", and this step copies every such
  asset into public/fonts/licensed/ (ignored by git) before a preview build.
  A production build gets none, so the live site is unchanged until Chris
  says otherwise.

  First use: Friend (Simon Walker), which Chris has a web licence for, on
  the road map's headings - tried in one contained place after the whole
  homepage in it was "too transformational for this website right now".

  The other source is the R2 bucket (rdc-images): any font file there
  outside v2/ (the pictures). Chris put Friend there; fetched the same way,
  into the same folder. A file whose name says Friend is also saved as
  Friend-Regular.<ext>, the name the pages ask for, whatever it was called.

  Never fails the build: with Sanity unreachable or nothing uploaded, the
  pages fall back to the next font in their stack, and a warning says so.

  Usage: node scripts/fetch-fonts.mjs
*/
import {mkdir, rm, writeFile} from 'node:fs/promises'
import {AwsClient} from 'aws4fetch'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(root, 'public', 'fonts', 'licensed')
const FONT = /\.(otf|ttf|woff2?)$/i

// Its own name, kept to plain characters; and Friend also by the name the pages use.
async function keep(original, bytes, from) {
  const name = path.basename(original ?? '').replace(/[^\w.-]/g, '-')
  if (!FONT.test(name)) return
  await writeFile(path.join(dir, name), bytes)
  const ext = name.match(FONT)[0].toLowerCase()
  if (/friend/i.test(name) && name !== `Friend-Regular${ext}`) await writeFile(path.join(dir, `Friend-Regular${ext}`), bytes)
  console.log(`[fetch-fonts] ${name}, from ${from}`)
}

async function fromR2() {
  const id = (process.env.R2_ACCESS_KEY_ID ?? '').trim()
  const secret = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim()
  const endpoint = (process.env.R2_ENDPOINT ?? '').trim().replace(/\/$/, '').replace(/\/rdc-images$/, '')
  if (!id || !secret || !endpoint) return 0
  const r2 = new AwsClient({accessKeyId: id, secretAccessKey: secret, service: 's3', region: 'auto'})
  const bucket = `${endpoint}/rdc-images`
  const keys = []
  let token = ''
  for (;;) {
    const q = new URLSearchParams({'list-type': '2', 'max-keys': '1000'})
    if (token) q.set('continuation-token', token)
    const res = await r2.fetch(`${bucket}?${q}`)
    if (!res.ok) throw new Error(`listing R2: ${res.status}`)
    const xml = await res.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      const key = m[1].replace(/&amp;/g, '&')
      if (!key.startsWith('v2/') && FONT.test(key)) keys.push(key)
    }
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !next) break
    token = next[1]
  }
  for (const key of keys) {
    const res = await r2.fetch(`${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`)
    if (!res.ok) throw new Error(`${key}: ${res.status}`)
    await keep(key, Buffer.from(await res.arrayBuffer()), 'R2')
  }
  return keys.length
}

// Whatever an earlier build left behind goes, so a production build starts clean.
await rm(dir, {recursive: true, force: true})

if (process.env.PUBLIC_IS_PREVIEW !== 'true') {
  console.log('[fetch-fonts] not a preview build: no licensed fonts')
} else {
  // Plain fetch, not @sanity/client: a dropped connection there surfaced as an
  // uncaught socket error that the try below could not catch, failing the build.
  const QUERY = '*[_type == "sanity.fileAsset" && label == "site-font"]{url, originalFilename}'
  try {
    const answer = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(QUERY)}`)
    if (!answer.ok) throw new Error(`query: ${answer.status}`)
    const fonts = (await answer.json()).result ?? []
    await mkdir(dir, {recursive: true})
    for (const f of fonts) {
      if (!FONT.test(f.originalFilename ?? '')) continue
      const res = await fetch(f.url)
      if (!res.ok) throw new Error(`${f.originalFilename}: ${res.status}`)
      await keep(f.originalFilename, Buffer.from(await res.arrayBuffer()), 'Studio')
    }
    if (!fonts.length) console.log('[fetch-fonts] none uploaded in Studio (Fonts tool)')
  } catch (e) {
    console.warn(`[fetch-fonts] Studio's fonts skipped: ${e instanceof Error ? e.message : e}`)
  }
  try {
    await mkdir(dir, {recursive: true})
    const n = await fromR2()
    if (!n) console.log('[fetch-fonts] none in the R2 bucket (or no R2 secrets here)')
  } catch (e) {
    console.warn(`[fetch-fonts] R2's fonts skipped: ${e instanceof Error ? e.message : e}`)
  }
}
