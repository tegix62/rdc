/*
  The largest YouTube thumbnail that actually exists for a video.

  WHY THIS EXISTS

  The facade used sddefault (640x480) unconditionally, with a comment
  explaining the choice: maxresdefault only exists for videos uploaded at
  1080p or above and 404s for the rest, and a broken image where the poster
  should be is worse than a soft one.

  The reasoning was sound and the premise was incomplete. It is about the
  VIDEO's resolution, and Chris sets custom thumbnails on YouTube - which are
  uploaded at 1280x720 whatever the video is. Probed across the site's
  videos: maxresdefault exists for all of them, at 1280x720, while the page
  was painting the 640px version across 1104 CSS pixels.

  So the size is asked for rather than assumed. Where maxresdefault exists it
  doubles the poster's width for free; where it does not, sddefault is still
  there and the old behaviour is what happens.

  WHY A SIZE CHECK AND NOT JUST A STATUS

  A 404 is not the only way a variant can be absent. YouTube has long served
  a 120x90 grey placeholder for some missing thumbnails - a 200 response
  carrying nothing - and a poster that is technically present and visibly
  grey is the exact failure the original comment was avoiding. Content-length
  separates them without decoding anything: the placeholder is a kilobyte or
  two, a real 1280x720 still is tens of kilobytes. The threshold sits far
  from both.

  Never throws. A build that cannot reach i.ytimg.com returns the sddefault
  URL and renders exactly as it did before - a slow or blocked third party
  must not be able to fail a build, which is the same reason Vimeo's
  thumbnails were left out of this entirely.
*/

const MAXRES = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
const SDDEFAULT = (id: string) => `https://i.ytimg.com/vi/${id}/sddefault.jpg`

/*
  Well above the grey placeholder (~1-2 KB) and well below a real still
  (~40-150 KB). Chosen to sit in the empty space between the two rather than
  near either, so neither has to be measured precisely to stay on the right
  side of it.
*/
const PLACEHOLDER_CEILING = 10_000

/*
  One probe per video for the whole build, not one per place the video
  appears. The promise is cached rather than the result, so pages rendering
  in parallel share a single request instead of each starting their own -
  the same shape as isAnimatedSource and the asset alt-text lookup.
*/
const cache = new Map<string, Promise<string>>()

async function probe(id: string): Promise<string> {
  try {
    const res = await fetch(MAXRES(id), {method: 'HEAD', signal: AbortSignal.timeout(5000)})
    if (!res.ok) return SDDEFAULT(id)
    const len = Number(res.headers.get('content-length') ?? 0)
    // A missing content-length is not evidence of absence; only a present
    // and small one is. Treating "unknown" as a miss would quietly send
    // every video back to 640px the day YouTube stops sending the header.
    if (len > 0 && len <= PLACEHOLDER_CEILING) return SDDEFAULT(id)
    return MAXRES(id)
  } catch {
    return SDDEFAULT(id)
  }
}

/** The best poster URL for a YouTube id, probed once per build. */
export function youTubePoster(id: string): Promise<string> {
  const hit = cache.get(id)
  if (hit) return hit
  const p = probe(id)
  cache.set(id, p)
  return p
}
