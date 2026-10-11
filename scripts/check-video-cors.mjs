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
  Several pages, not one.

  The first run asked /video and found nothing: a videoSection can
  render a facade for a YouTube link, and a self-hosted clip may sit on
  the Portfolio grid or a case study rather than on the page named after
  video. Looking at one page and concluding "nothing to test" is a
  measurement that describes the page I picked, not the site.
*/
const DEFAULT_PAGES = [
  'https://rumeaudesign.co/video',
  'https://rumeaudesign.co/',
  'https://rumeaudesign.co/portfolio',
  'https://rumeaudesign.co/merchfolio',
  'https://rumeaudesign.co/collage',
]
const args = process.argv.slice(2)
const ORIGIN_ARG = args.find((a) => a.includes('sanity.studio') || a.includes('localhost'))
const PAGES = args.filter((a) => a !== ORIGIN_ARG)
const pages = PAGES.length ? PAGES : DEFAULT_PAGES
const ORIGIN = ORIGIN_ARG ?? 'https://rumeau-design-co.sanity.studio'

let html = ''
for (const page of pages) {
  try {
    html += await fetch(page, {redirect: 'follow'}).then((r) => r.text())
  } catch (err) {
    console.log(`  could not read ${page}: ${String(err?.message ?? err)}`)
  }
}
const PAGE = pages.join(', ')

/*
  Any absolute media URL on the page. Both <source src> and a poster-less
  <video src> are fair game, and so is a Sanity-hosted file, because the
  point is to test each HOST we serve video from rather than one tag.
*/
const urls = [...html.matchAll(/https?:\\?\/\\?\/[^"'\s<>\\]+\.(?:mp4|webm|mov)/gi)].map((m) =>
  m[0].replace(/\\/g, ''),
)
const hosts = new Map()
for (const u of urls) {
  const h = new URL(u).host
  if (!hosts.has(h)) hosts.set(h, u)
}

console.log(`${PAGE}\nasking as ${ORIGIN}\n`)

if (!hosts.size) {
  console.log('  No video files found on that page, so there is nothing to test.')
  console.log('  Pass a page that embeds a self-hosted video, or a direct URL to one.')
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
  if (!ok) anyBlocked = true
  console.log(`  ${host}`)
  console.log(`    HTTP ${res.status}`)
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
