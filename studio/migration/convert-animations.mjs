/*
  Converts animated images in the dataset to h264/VP9 video and records the
  results in the `animatedVideoMap` document.

  Why this exists: animated GIF and animated WebP can't be usefully re-encoded
  by the image CDN. Asking it to resize one produced a 10,721 KB response from
  a source under 1 MB, so animations now bypass transforms and ship as
  uploaded. That stops the CDN making things worse but leaves the originals
  as-is, and GIF is a deeply inefficient way to move a moving picture. The same
  animation as h264 is usually an order of magnitude smaller.

  Safe to re-run. Already-converted assets are skipped unless FORCE=1, so it
  costs nothing to run again after adding one animation.

  Requires: ffmpeg on PATH, and SANITY_API_TOKEN with write access.
  Run: npm run convert:animations   (from studio/)
*/
import {createClient} from '@sanity/client'
import {execFile} from 'node:child_process'
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const run = promisify(execFile)

const client = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const FORCE = process.env.FORCE === '1'
const MAP_ID = 'animatedVideoMap'
const kb = (n) => `${(n / 1024).toFixed(0)} KB`

/*
  A WebP is a RIFF container; an animated one carries a VP8X chunk with the
  animation feature bit set and an ANIM chunk. Both sit in the first bytes, so
  the header is enough to tell them apart - static and animated WebP are
  otherwise identical from the outside.
*/
const isAnimatedWebp = (buf) => {
  if (buf.length < 32) return false
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return false
  if (buf.toString('ascii', 8, 4) !== 'WEBP') return false
  if (buf.toString('ascii', 12, 4) !== 'VP8X') return false
  return (buf[20] & 0x02) !== 0 || buf.toString('ascii', 0, 64).includes('ANIM')
}

async function ffmpegAvailable() {
  try {
    await run('ffmpeg', ['-version'])
    return true
  } catch {
    return false
  }
}

async function convert(dir, sourcePath) {
  const mp4 = path.join(dir, 'out.mp4')
  const webm = path.join(dir, 'out.webm')

  // yuv420p and even dimensions are required for the file to play on Safari
  // and older Android at all; -an because these are silent animations.
  const evenScale = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

  await run('ffmpeg', [
    '-y', '-i', sourcePath,
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    '-vf', evenScale,
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'slow',
    '-an',
    mp4,
  ])

  await run('ffmpeg', [
    '-y', '-i', sourcePath,
    '-vf', evenScale,
    '-c:v', 'libvpx-vp9',
    '-crf', '34',
    '-b:v', '0',
    '-row-mt', '1',
    '-an',
    webm,
  ])

  return {mp4, webm}
}

async function main() {
  if (!process.env.SANITY_API_TOKEN) {
    console.error('SANITY_API_TOKEN is required (needs write access).')
    process.exit(1)
  }
  if (!(await ffmpegAvailable())) {
    console.error('ffmpeg not found on PATH.')
    process.exit(1)
  }

  // Candidates: every GIF, plus every WebP (filtered to animated ones below,
  // which needs the bytes).
  const assets = await client.fetch(
    `*[_type == "sanity.imageAsset" && extension in ["gif", "webp"]]{
      _id, url, extension, size, "w": metadata.dimensions.width, "h": metadata.dimensions.height
    }`,
  )
  console.log(`${assets.length} gif/webp asset(s) in the dataset`)

  const existing = (await client.fetch(`*[_id == $id][0]`, {id: MAP_ID})) ?? {}
  const done = new Set((existing.entries ?? []).map((e) => e.assetId))

  const entries = FORCE ? [] : [...(existing.entries ?? [])]
  let converted = 0
  let sourceTotal = 0
  let outTotal = 0
  let skipped = 0

  for (const asset of assets) {
    // Sanity asset ids look like image-<hash>-<w>x<h>-<ext>; the frontend
    // matches on the hash, so store that.
    const assetId = asset._id.replace(/^image-/, '').replace(/-\d+x\d+-[a-z0-9]+$/i, '')

    if (!FORCE && done.has(assetId)) {
      skipped += 1
      continue
    }

    const res = await fetch(asset.url)
    if (!res.ok) {
      console.log(`  ! ${assetId} download failed (${res.status})`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())

    if (asset.extension === 'webp' && !isAnimatedWebp(buf)) continue

    const dir = await mkdtemp(path.join(tmpdir(), 'anim-'))
    try {
      const src = path.join(dir, `in.${asset.extension}`)
      await writeFile(src, buf)
      const {mp4, webm} = await convert(dir, src)

      const mp4Buf = await readFile(mp4)
      const webmBuf = await readFile(webm)

      // Only worth it if the video is actually smaller. A short, tiny
      // animation can transcode larger, and shipping that would be a
      // regression dressed up as an optimisation.
      if (mp4Buf.length >= buf.length) {
        console.log(
          `  = ${assetId} skipped: mp4 ${kb(mp4Buf.length)} is not smaller than source ${kb(buf.length)}`,
        )
        continue
      }

      const mp4Asset = await client.assets.upload('file', mp4Buf, {filename: `${assetId}.mp4`})
      const webmAsset = await client.assets.upload('file', webmBuf, {filename: `${assetId}.webm`})

      entries.push({
        _key: assetId.slice(0, 12) + Math.random().toString(36).slice(2, 8),
        assetId,
        mp4: {_type: 'file', asset: {_type: 'reference', _ref: mp4Asset._id}},
        webm: {_type: 'file', asset: {_type: 'reference', _ref: webmAsset._id}},
        width: asset.w ?? null,
        height: asset.h ?? null,
        sourceBytes: buf.length,
        mp4Bytes: mp4Buf.length,
      })

      converted += 1
      sourceTotal += buf.length
      outTotal += mp4Buf.length
      const pct = (((mp4Buf.length - buf.length) / buf.length) * 100).toFixed(0)
      console.log(
        `  + ${assetId}  ${asset.extension}  ${kb(buf.length)} -> mp4 ${kb(mp4Buf.length)} (${pct}%), webm ${kb(webmBuf.length)}`,
      )
    } catch (err) {
      console.log(`  ! ${assetId} conversion failed: ${err.message}`)
    } finally {
      await rm(dir, {recursive: true, force: true})
    }
  }

  await client.createOrReplace({
    _id: MAP_ID,
    _type: 'animatedVideoMap',
    entries,
    generatedAt: new Date().toISOString(),
  })

  console.log(
    `\nconverted ${converted}, skipped ${skipped} already done, ${entries.length} total in the map`,
  )
  if (converted) {
    const pct = (((outTotal - sourceTotal) / sourceTotal) * 100).toFixed(0)
    console.log(`animation weight: ${kb(sourceTotal)} -> ${kb(outTotal)} (${pct}%)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
