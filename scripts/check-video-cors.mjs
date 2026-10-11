/*
  Can the Studio read frames out of the videos we serve?

  WHY THIS EXISTS

  The poster frame grabber (studio/components/VideoPosterPicker.tsx)
  draws a <video> onto a canvas and reads it back. The browser forbids
  that unless the host serving the video says it is allowed, with an
  Access-Control-Allow-Origin header on the video itself.

  Videos uploaded through Studio go to an R2 bucket. The CORS headers in
  this repo are on the UPLOAD endpoint (functions/api/upload-video.ts),
  which is a different thing entirely - R2's public bucket sends none by
  default. So the grabber may play a video perfectly and still be unable
  to capture from it.

  Rather than leave Chris to find that out by pressing a button, this
  asks the question directly: find a video the live site actually
  serves, request it the way a browser would from the Studio's origin,
  and report what comes back.

  READ-ONLY.

  Usage: node scripts/check-video-cors.mjs [page-url ...] [studio-origin]
*/
/*
  ASK SANITY, NOT THE RENDERED PAGES.

  Three runs scraped pages for a video URL and found none, which was
  true and useless: a videoSection renders a facade for a YouTube link,
  so a self-hosted clip need not appear in any page's HTML - and a clip
  just uploaded may not be referenced anywhere yet at all. Scraping
  answers "is a video on this page", and the question is "which hosts
  do we serve video from".

  The documents hold the answer directly. videoSrc on any document, plus
  the hero video on siteSettings, covers every self-hosted route.
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

const args = process.argv.slice(2).filter(Boolean)
const ORIGIN =
  args.find((a) => a.includes('sanity.studio') || a.includes('localhost')) ??
  'https://rumeau-design-co.sanity.studio'
const explicit = args.filter((a) => /^https?:\/\//.test(a) && a !== ORIGIN)

const urls = [...explicit]

if (!explicit.length) {
  if (!TOKEN) {
    console.error('SANITY_API_TOKEN is required (read-only is enough), or pass a video URL.')
    process.exit(2)
  }
  /*
    THE WHOLE DOCUMENT, SCANNED - NOT A LIST OF PLACES I THOUGHT OF.

    The previous query named three paths: videoSrc on a document,
    siteSettings' hero, and sections[].videoSrc. It found two videos,
    pronounced both healthy, and missed the one Chris was actually
    looking at - because a media row keeps its videos in
    sections[].items[], one level deeper than any path I listed.

    Enumerating the places a URL can hide is a losing game: the next
    nested array breaks it again, silently, with a green run. So this
    pulls the documents and scans them for video URLs wherever they
    sit. More data over the wire, and no blind spots that depend on me
    remembering the schema.
  */
  const query = `*[!(_id in path("drafts.**"))]`
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  if (!res.ok) {
    console.error(`Sanity: ${res.status} ${res.statusText}`)
    process.exit(2)
  }
  const docs = (await res.json()).result ?? []
  const blob = JSON.stringify(docs)
  for (const m of blob.matchAll(/https?:\/\/[^"'\s\\]+\.(?:mp4|webm|mov)/gi)) {
    if (!urls.includes(m[0])) urls.push(m[0])
  }
}

/*
  EVERY URL, NOT ONE PER HOST.

  This used to keep one URL per host, which answers "is this host
  configured for CORS" and says nothing about whether each video is
  actually there. Chris then hit a clip that would not load at all from
  a host this check had already passed - because the file behind that
  particular URL is missing, which deduplicating by host made invisible.

  A video that 404s is broken on the live site too, not only in the
  Studio, so this is worth finding per file.
*/
const targets = []
for (const u of urls) {
  try {
    new URL(u)
    if (!targets.includes(u)) targets.push(u)
  } catch {
    /* not a URL - skip */
  }
}
const hosts = new Map(targets.map((u) => [u, u]))

const PAGE = `${urls.length} video URL(s) from Sanity`

console.log(`${PAGE}\nasking as ${ORIGIN}\n`)

if (!hosts.size) {
  console.log('  No self-hosted video URLs exist in the dataset, so there is nothing')
  console.log('  to test. Every video here is a YouTube or Vimeo link.')
  process.exit(0)
}

let anyBlocked = false
for (const [host, url] of hosts) {
  /*
    GET with a Range rather than HEAD: some CDNs answer HEAD from a
    different path than a real media request, and a browser fetching a
    video issues a ranged GET. One byte is enough to read the headers.
  */
  let res
  try {
    res = await fetch(url, {headers: {Origin: ORIGIN, Range: 'bytes=0-0'}})
  } catch (err) {
    console.log(`  ${host}\n    request failed: ${String(err?.message ?? err)}\n`)
    anyBlocked = true
    continue
  }
  const allow = res.headers.get('access-control-allow-origin')
  const ok = allow === '*' || allow === ORIGIN
  const missing = res.status >= 400
  if (!ok || missing) anyBlocked = true
  console.log(`  ${new URL(host).pathname}  (${new URL(host).host})`)
  /*
    CONTENT-TYPE, BECAUSE fetch DOES NOT CARE AND <video> DOES.

    A file can answer 206 with perfect CORS and still refuse to play: a
    browser will not decode a video served as application/octet-stream
    or with no type at all. Every check so far used fetch, which reads
    the bytes happily either way - so a clip that is fine by every
    measurement here can be a black box in the Studio and on the page.

    The upload worker sets this from the File's own type. A clip put in
    the bucket by any other route may carry nothing.
  */
  /*
    IS IT ACTUALLY A VIDEO FILE?

    Present, correct CORS, correct content-type - and the browser still
    would not decode it. Every one of those says something about the
    SERVER. None of them says the bytes are a playable movie, and a
    truncated or half-finished upload answers 206 just as happily as a
    whole one.

    Content-Range on a ranged request carries the true total size, and
    the first bytes of an MP4 carry an 'ftyp' box at offset 4. Between
    them: how big it really is, and whether it is the thing it claims.
  */
  let total = null
  let signature = null
  try {
    const head = await fetch(url, {headers: {Origin: ORIGIN, Range: 'bytes=0-31'}})
    const cr = head.headers.get('content-range')
    total = cr?.split('/')[1] ?? null
    const buf = new Uint8Array(await head.arrayBuffer())
    const ascii = String.fromCharCode(...buf.slice(4, 12))
    signature = /ftyp/.test(ascii)
      ? `MP4 (${ascii.slice(4).replace(/[^\x20-\x7e]/g, '').trim() || 'ftyp'})`
      : buf[0] === 0x1a && buf[1] === 0x45
        ? 'WebM/Matroska'
        : `unrecognised (${[...buf.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' ')})`
  } catch {
    /* leave both null */
  }

  /*
    IS THE INDEX AT THE FRONT? ("fast start")

    An MP4 keeps its index in a 'moov' atom. Exported normally that atom
    goes at the END of the file, so a browser cannot know the duration,
    seek, or paint a single frame until it has fetched everything - 34MB
    before anything appears. On a phone that reads as a black box with
    "?s" on it, and a flaky connection turns it into an error.

    Every other check here passed on exactly such a file, because being
    slow to start is not a fault of the server, the headers or the
    bytes. It is a fault of how the file was written, and the only fix
    is to re-export it with fast start / "optimize for web" - moving it
    between buckets will not help.

    Looked for in the first 512KB: present means front-loaded, absent
    means it is at the end.
  */
  let faststart = null
  let codec = null
  if (signature?.startsWith('MP4')) {
    try {
      const probe = await fetch(url, {headers: {Origin: ORIGIN, Range: 'bytes=0-524287'}})
      const txt = Buffer.from(await probe.arrayBuffer()).toString('latin1')
      faststart = txt.includes('moov')
      /*
        WHICH CODEC, SO "UNSUPPORTED" BECOMES ACTIONABLE.

        Chris's clip returns MediaError code 4 - the browser cannot
        decode it - on a file that is valid, fast-started and correctly
        served. "Unsupported codec" is true and useless on its own; what
        he needs is which one, so he knows what to export instead.

        An MP4 names its codec in a sample entry inside moov, as a
        four-character code. Those are distinctive enough to find by
        scanning, which beats writing a box parser for one fact.
      */
      // Plain JS: this is a .mjs, and a type annotation here is a syntax
      // error rather than a hint.
      const CODECS = [
        [/hvc1|hev1|hvcC/, 'HEVC / H.265 - Safari only, and not everywhere'],
        [/av01/, 'AV1 - very limited support'],
        [/vp09/, 'VP9 in MP4 - patchy support'],
        [/ap4h|apch|apcn|apcs/, 'Apple ProRes - an editing codec, not a web one'],
        [/dvh1|dvhe/, 'Dolby Vision - not playable on the open web'],
        [/avc1|avcC/, 'H.264 / AVC - the one browsers all support'],
        [/mp4v/, 'MPEG-4 Part 2 - old, poorly supported'],
      ]
      for (const [re, name] of CODECS) {
        if (re.test(txt)) {
          codec = name
          break
        }
      }
    } catch {
      /* leave null */
    }
  }

  const ctype = res.headers.get('content-type')
  const playable = Boolean(ctype && /^video\//i.test(ctype))
  if (!missing && !playable) anyBlocked = true
  console.log(`    HTTP ${res.status}${missing ? '  <- the file is not there' : ''}`)
  console.log(
    `    content-type: ${ctype ?? '(none)'}` +
      (playable ? '' : '  <- not a video type, so a browser will not play it'),
  )
  const bytes = total ? Number(total) : null
  console.log(
    `    size: ${bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '(unknown)'}` +
      (bytes !== null && bytes < 10_000 ? '  <- far too small to be a real clip' : ''),
  )
  console.log(`    looks like: ${signature ?? '(could not read the first bytes)'}`)
  if (codec) {
    const web = /H\.264/.test(codec)
    console.log(`    codec: ${codec}${web ? '' : '  <- browsers will refuse this'}`)
    if (!web) anyBlocked = true
  }
  if (faststart !== null) {
    console.log(
      `    fast start: ${faststart ? 'yes - plays and scrubs immediately' : 'NO - the index is at the end, so the whole file must download before anything shows'}`,
    )
    if (!faststart) anyBlocked = true
  }
  if (signature?.startsWith('unrecognised') || (bytes !== null && bytes < 10_000)) {
    anyBlocked = true
  }
  console.log(`    access-control-allow-origin: ${allow ?? '(none sent)'}`)
  console.log(
    ok
      ? '    -> frames CAN be captured from this host.'
      : '    -> frames CANNOT be captured; the canvas would be tainted.',
  )
  console.log('')
}

if (anyBlocked) {
  console.log('Something above is marked. A missing CORS rule is a bucket setting; a')
  console.log('file with no fast start has to be re-exported with "optimize for web",')
  console.log('since moving the same file cannot fix where its index sits.')
} else {
  console.log('Every host we serve video from allows frame capture.')
}
