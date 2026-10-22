/*
  Point a built page's pictures at /img/ - the Cloudflare route in
  functions/img/[[path]].ts - instead of straight at cdn.sanity.io.

  Everything a browser loads as a picture or video on the page: src, srcset,
  posters, data-* attributes the scripts read (the magnifier's scan, the
  portfolio's sharper upgrade), inline style url()s. Left as they are:

    <meta> tags        og:image and friends are read by other sites'
                       crawlers, which need an absolute address and visit
                       rarely
    JSON-LD            structured data for search engines, the same
    preconnect hints   pointless once nothing loads from that host

  Relative /img/ rather than an absolute address, so the preview's pages use
  the preview's route and the live site's use its own.
*/
const FROM = 'https://cdn.sanity.io/'
const TO = '/img/'
const FROM_ESCAPED = 'https:\\/\\/cdn.sanity.io\\/'
const TO_ESCAPED = '\\/img\\/'

const KEEP = /<meta\b[^>]*>|<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>|<link\b[^>]*rel=["']preconnect["'][^>]*>/gi

const swap = (s) => s.split(FROM).join(TO).split(FROM_ESCAPED).join(TO_ESCAPED)

/** Returns {html, count}: the page with its pictures pointed at /img/, and how many were. */
export function rewriteHtml(html) {
  let out = ''
  let last = 0
  let count = 0
  const take = (s) => {
    count += s.split(FROM).length - 1 + (s.split(FROM_ESCAPED).length - 1)
    return swap(s)
  }
  for (const m of html.matchAll(KEEP)) {
    out += take(html.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  out += take(html.slice(last))
  return {html: out, count}
}
