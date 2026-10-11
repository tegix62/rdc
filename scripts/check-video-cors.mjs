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
  const ctype = res.headers.get('content-type')
  const playable = Boolean(ctype && /^video\//i.test(ctype))
  if (!missing && !playable) anyBlocked = true
  console.log(`    HTTP ${res.status}${missing ? '  <- the file is not there' : ''}`)
  console.log(
    `    content-type: ${ctype ?? '(none)'}` +
      (playable ? '' : '  <- not a video type, so a browser will not play it'),
  )
  console.log(`    access-control-allow-origin: ${allow ?? '(none sent)'}`)
  console.log(
    ok
      ? '    -> frames CAN be captured from this host.'
      : '    -> frames CANNOT be captured; the canvas would be tainted.',
  )
  console.log('')
}

if (anyBlocked) {
  console.log('At least one host needs a CORS rule before the frame grabber can capture')
  console.log('from it. For R2: the bucket’s CORS policy, allowing the Studio origin')
  console.log('above, with GET and the Range header. Playback is unaffected either way.')
} else {
  console.log('Every host we serve video from allows frame capture.')
}
