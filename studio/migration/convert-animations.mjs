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

  DRY_RUN=1 does everything except write: it downloads, transcodes, and reports
  the exact per-file numbers, then uploads nothing and leaves the map alone.
  Added because the first real run creates two new file assets per animation -
  38 of them on this dataset - and "how much would this actually save" is a
  question worth answering before that, not after. It also reports which files
  would fail the 10% margin the frontend applies, since those get converted,
  stored, and then never served.

  Requires: ffmpeg on PATH. SANITY_API_TOKEN is needed to write, so DRY_RUN
  works without one.
  Run: npm run convert:animations              (from studio/)
       DRY_RUN=1 npm run convert:animations    (report only)
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
const DRY_RUN = process.env.DRY_RUN === '1'

/*
  The Accept header a browser sends.

  Worth sending regardless: Sanity content-negotiates the bare asset URL, and
  src/lib/animated.ts had exactly this bug - reading a 1,348 KB animated WebP as
  a 15 KB JPEG because Node's default wildcard Accept got it a static fallback.
  Matching what the site does removes one way for the two to disagree about the
  same file.

  It is NOT, however, why this script has never converted a WebP. I asserted
  that here, added a diagnostic that only reported the case I had already
  guessed, and the run came back byte-identical with the diagnostic silent -
  which means the WebPs were arriving as valid RIFF all along and something
  else rejects them. Left standing as a correct-but-unrelated fix, and the
  rejection now prints the actual container bytes instead of a theory.

  The facts as they stand: 19 files are genuinely animated, the script has only
  ever attempted 11, and all 11 are GIFs. Six animated WebPs - including the
  3,981 KB homepage hero - are skipped every run. Why is still open.
*/
const BROWSER_ACCEPT =
  'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
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
  /*
    A dry run only reads - the CDN for the bytes, and the public dataset for the
    map - so it needs no token. The unconditional check that used to be here
    exited first and made DRY_RUN unusable without one, which contradicted the
    mode's whole purpose.
  */
  if (!DRY_RUN && !process.env.SANITY_API_TOKEN) {
    console.error(
      'SANITY_API_TOKEN is required to write (needs write access). ' +
        'Use DRY_RUN=1 to report the numbers without one.',
    )
    process.exit(1)
  }
  if (DRY_RUN) console.log('DRY RUN - transcoding and measuring, writing nothing.\n')
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

  /*
    Report what is already in the map before doing anything.

    "skipped: already done" hides the question that actually matters - an entry
    can exist and still never be served, because lib/animatedVideo.ts requires
    the mp4 to come in under 90% of the source. A conversion sitting in the map
    at 105% of its original is storage paid for nothing, and from the outside it
    looks identical to a conversion that works.
  */
  if ((existing.entries ?? []).length) {
    console.log(`\nalready in the map (${existing.entries.length}):`)
    for (const e of existing.entries) {
      const src = e.sourceBytes
      const out = e.mp4Bytes
      if (typeof src !== 'number' || typeof out !== 'number') {
        console.log(`  ? ${e.assetId}  sizes not recorded - animation is served`)
        continue
      }
      const served = out < src * 0.9
      const pct = ((out / src) * 100).toFixed(0)
      console.log(
        `  ${served ? '+' : '-'} ${e.assetId}  ${kb(src)} -> ${kb(out)} (${pct}% of source)  ` +
          `${served ? 'VIDEO IS SERVED' : 'not served - animation still ships'}`,
      )
    }
    console.log('')
  }

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

    const res = await fetch(asset.url, {headers: {Accept: BROWSER_ACCEPT}})
    if (!res.ok) {
      console.log(`  ! ${assetId} download failed (${res.status})`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())

    /*
      Say so, rather than `continue`. A silent skip is how six animated WebPs
      went missing from every run of this script without leaving a trace.
    */
    if (asset.extension === 'webp' && !isAnimatedWebp(buf)) {
      /*
        Report the bytes, not a theory about them.

        The previous version of this only spoke up when the file was not RIFF,
        because that was the cause I had guessed. It stayed silent on every real
        rejection and told me nothing - a diagnostic written to confirm a
        hypothesis rather than to describe what happened. So this prints the
        actual container fields isAnimatedWebp() looks at, and lets them say
        what is wrong.
      */
      const printable = (a, b) => buf.toString('ascii', a, b).replace(/[^\x20-\x7e]/g, '?')
      console.log(
        `  . ${assetId} not treated as animated:` +
          ` riff=${printable(0, 4)} kind=${printable(8, 12)} chunk=${printable(12, 16)}` +
          ` flags=0x${(buf[20] ?? 0).toString(16).padStart(2, '0')}` +
          ` bytes=${kb(buf.length)} (asset says ${kb(asset.size ?? 0)})`,
      )
      continue
    }

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

      /*
        The 10% margin the frontend applies, reported here rather than
        discovered later. lib/animatedVideo.ts serves the video only when the
        mp4 is under 90% of the source, so anything between 90% and 100%
        converts, uploads, records - and is then never used. Better to say so.
      */
      const clearsMargin = mp4Buf.length < buf.length * 0.9
      if (!clearsMargin) {
        console.log(
          `  ~ ${assetId} converts but only to ${kb(mp4Buf.length)} of ${kb(buf.length)} ` +
            `- under the 10% margin, so the animation would still be served`,
        )
      }

      if (DRY_RUN) {
        const pctDry = (((mp4Buf.length - buf.length) / buf.length) * 100).toFixed(0)
        console.log(
          `  ? ${assetId}  ${asset.extension}  ${asset.w}x${asset.h}  ` +
            `${kb(buf.length)} -> mp4 ${kb(mp4Buf.length)} (${pctDry}%), webm ${kb(webmBuf.length)}` +
            `${clearsMargin ? '' : '  [would not be served]'}`,
        )
        converted += 1
        sourceTotal += buf.length
        outTotal += mp4Buf.length
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

  if (!DRY_RUN) {
    await client.createOrReplace({
      _id: MAP_ID,
      _type: 'animatedVideoMap',
      entries,
      generatedAt: new Date().toISOString(),
    })
  }

  console.log(
    DRY_RUN
      ? `\nwould convert ${converted}, skipping ${skipped} already done`
      : `\nconverted ${converted}, skipped ${skipped} already done, ${entries.length} total in the map`,
  )
  if (converted) {
    const pct = (((outTotal - sourceTotal) / sourceTotal) * 100).toFixed(0)
    console.log(`animation weight: ${kb(sourceTotal)} -> ${kb(outTotal)} (${pct}%)`)
  }
  if (DRY_RUN) console.log('Nothing was written. Drop DRY_RUN to do it for real.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
