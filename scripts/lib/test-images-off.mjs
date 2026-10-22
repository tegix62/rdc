/*
  TESTS DO NOT DOWNLOAD THE SITE'S PICTURES.

  In October 2026 the Sanity plan's monthly bandwidth ran out, and the cause
  was this repository's own browser tests: every run opened the site in a
  fresh browser and downloaded its pictures again - the gather measurement
  alone opened the portfolio about 80 times a run, dozens of runs a week.

  So every test browser answers picture requests itself. Loaded before any
  test script (NODE_OPTIONS=--import, set on each workflow that runs one),
  this patches Playwright so every page and context it opens replies to a
  request for a picture - from cdn.sanity.io, or from /img/ on the site
  (pictures through Cloudflare) - with a blank picture of the SAME SHAPE.
  The shape is in the address: a Sanity file is named <id>-<width>x<height>,
  and the query says the crop (rect) and the size asked for (w, h). So a
  tile lays out exactly as it would with the real picture, which is what the
  layout tests measure; only the pixels are missing. Videos are refused.

  REAL_IMAGES=1 turns this off for a run that needs real pixels - pictures
  sent to Chris, say - and that run goes through /img/ and Cloudflare's
  cache, not straight to Sanity.

  Nothing here is required by a test script, and a workflow without
  Playwright installed is unaffected: the import is tried, and skipped if it
  fails.
*/

/** Is this request one of the site's pictures or videos? */
export function isSitePicture(url) {
  return url.hostname === 'cdn.sanity.io' || url.pathname.startsWith('/img/')
}

/** The width and height the real picture at this address would have. */
export function placeholderSize(href) {
  const url = new URL(href)
  const m = url.pathname.match(/-(\d+)x(\d+)\.[a-z0-9]+$/i)
  let bw = m ? Number(m[1]) : 800
  let bh = m ? Number(m[2]) : 800
  const rect = url.searchParams.get('rect')?.split(',').map(Number)
  if (rect?.length === 4 && rect[2] > 0 && rect[3] > 0) {
    bw = rect[2]
    bh = rect[3]
  }
  const w = Number(url.searchParams.get('w')) || 0
  const h = Number(url.searchParams.get('h')) || 0
  if (w && h) return {w, h}
  if (w) return {w, h: Math.max(1, Math.round((w * bh) / bw))}
  if (h) return {w: Math.max(1, Math.round((h * bw) / bh)), h}
  return {w: bw, h: bh}
}

export function placeholderSvg({w, h}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="100%" height="100%" fill="#e6e6e6"/></svg>`
  )
}

async function answer(route) {
  const url = new URL(route.request().url())
  if (/\/files\//.test(url.pathname)) return route.abort()
  return route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: {'access-control-allow-origin': '*', 'cache-control': 'max-age=3600'},
    body: placeholderSvg(placeholderSize(url.href)),
  })
}

const guard = async (ctx) => {
  await ctx.route(isSitePicture, answer)
  return ctx
}

function patch(browserType) {
  if (!browserType || browserType.__picturesOff) return
  browserType.__picturesOff = true
  const launch = browserType.launch.bind(browserType)
  browserType.launch = async (...args) => {
    const browser = await launch(...args)
    const newContext = browser.newContext.bind(browser)
    const newPage = browser.newPage.bind(browser)
    browser.newContext = async (...a) => guard(await newContext(...a))
    browser.newPage = async (...a) => {
      const page = await newPage(...a)
      await guard(page.context())
      return page
    }
    return browser
  }
  const persistent = browserType.launchPersistentContext?.bind(browserType)
  if (persistent) browserType.launchPersistentContext = async (...a) => guard(await persistent(...a))
}

if (process.env.REAL_IMAGES !== '1') {
  try {
    const pw = await import('playwright')
    for (const t of [pw.chromium, pw.firefox, pw.webkit, pw.default?.chromium]) patch(t)
  } catch {
    // No Playwright in this job: nothing to patch.
  }
}
