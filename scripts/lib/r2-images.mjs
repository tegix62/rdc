/*
  PICTURES FROM R2 - the plain parts of scripts/r2-images.mjs, tested by
  scripts/test-r2-images.mjs.

  The built pages ask for their pictures at /img/v2/<sanity path>?<query>
  (scripts/lib/proxy-images.mjs), and every one of those requests runs the
  /img/ Function - which the free plan counts, 100,000 a day, and which the
  site was reaching (Cloudflare's alert at 77%, 30 October 2026). R2 serves
  files from Cloudflare's cache without running anything. So each picture
  the pages use is copied once into the rdc-images bucket, under a key that
  says everything its address says, and the pages are pointed at
  img.rumeaudesign.co instead. A picture not (yet) in the bucket keeps its
  /img/ address, which still works.

  THE KEY. An R2 public address is a path - no query - so the query goes
  into the path: v2/<query, & as ~ and = as _>/<sanity path>, e.g.
    v2/rect_0,0,1000,800~w_1600~fm_webp~q_82/images/8337vjtf/production/<hash>-1000x800.png
  The file name stays last, so the picture's own size can still be read off
  the address (the test browsers' blank pictures do). A query with anything
  outside letters, digits and , . - is left on /img/.
*/

export const HOST = 'https://img.rumeaudesign.co'
const SAFE = /^[A-Za-z0-9,.-]*$/
const PATH = /^images\/8337vjtf\/production\/[A-Za-z0-9._-]+$/

/** The R2 key for a /img/v2/ picture, or null if it cannot have one. */
export function keyFor(path, query) {
  if (!PATH.test(path)) return null
  const pairs = query ? query.split('&').filter(Boolean) : []
  const parts = []
  for (const p of pairs) {
    const [k, v = ''] = p.split('=')
    if (!/^[a-z]+$/i.test(k) || !SAFE.test(v)) return null
    parts.push(`${k}_${v}`)
  }
  return `v2/${parts.length ? parts.join('~') : '-'}/${path}`
}

/** The query a key was made from (for the test browsers' blanks). */
export function queryOfKey(key) {
  const m = key.match(/^v2\/([^/]+)\//)
  if (!m || m[1] === '-') return ''
  return m[1]
    .split('~')
    .map((p) => {
      const i = p.indexOf('_')
      return i < 0 ? p : `${p.slice(0, i)}=${p.slice(i + 1)}`
    })
    .join('&')
}

/*
  Every /img/v2/ picture address in a page, as written there: in attributes
  (& as &amp;), and in inline JSON with escaped slashes (\/) and & as
  &. Each comes back with what was written, so the page can be
  rewritten exactly, and the path and query it means.
*/
const FIND = /(\\\/|\/)img\1v2\1((?:images)\1[0-9a-z]+\1production\1[A-Za-z0-9._-]+)((?:\?|\\u003f)(?:[^"'\s)<>\\]|\\u0026)*)?/gi

const read = (m) => {
  let written = m[0]
  let rawQuery = m[3] ?? ''
  // A srcset list's comma is not the picture's.
  let trail = ''
  while (rawQuery.endsWith(',')) {
    rawQuery = rawQuery.slice(0, -1)
    written = written.slice(0, -1)
    trail += ','
  }
  const slash = m[1]
  const path = m[2].split(slash).join('/')
  const query = rawQuery
    .replace(/^(\?|\\u003f)/i, '')
    .split('&amp;').join('&')
    .split('\\u0026').join('&')
  return {written, trail, path, query, escaped: slash !== '/'}
}

export function findPictures(html) {
  return [...html.matchAll(FIND)].map(read)
}

/*
  The page with each picture whose key is in `have` pointed at R2; returns
  {html, moved, kept}. One pass over the page, each address swapped where it
  stands - never a find-and-replace of the text, which would also swap a bare
  address inside a longer one that begins with it.
*/
export function rewritePictures(html, have) {
  let moved = 0
  let kept = 0
  const out = html.replace(FIND, (...m) => {
    const p = read(m)
    const key = keyFor(p.path, p.query)
    if (!key || !have.has(key)) {
      kept++
      return m[0]
    }
    moved++
    const url = `${HOST}/${key}`
    return (p.escaped ? url.split('/').join('\\/') : url) + p.trail
  })
  return {html: out, moved, kept}
}
