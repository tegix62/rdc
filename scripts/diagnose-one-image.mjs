/*
  Why does one picture look low-res on the site? Finds every address the
  built pages give for one Sanity file (by its hash) on a few pages, then
  fetches the largest of each <img>'s candidates once and says what came
  back: status, type, bytes and its real pixel size - against the width the
  page asks for and the size of the upload.

  Downloads a handful of copies of ONE picture, not the site's pictures.

  Usage: node scripts/diagnose-one-image.mjs <hash> <base> [paths...]
*/
const [HASH, BASE = 'https://rumeaudesign.co', ...rest] = process.argv.slice(2)
const PATHS = rest.length ? rest : ['/', '/portfolio', '/merchfolio']
if (!HASH) {
  console.log('Give the file hash.')
  process.exit(1)
}

// Pixel size from the first bytes of a WebP, PNG, JPEG or AVIF.
function sizeOf(b) {
  const s = (i, n) => String.fromCharCode(...b.subarray(i, i + n))
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') {
    const kind = s(12, 4)
    if (kind === 'VP8X') return {w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16))}
    if (kind === 'VP8L') {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return {w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1}
    }
    if (kind === 'VP8 ') return {w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff}
  }
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return {w: b.readUInt32BE(16), h: b.readUInt32BE(20)}
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i < b.length) {
      const m = b[i + 1]
      const len = b.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return {w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5)}
      i += 2 + len
    }
  }
  const at = b.indexOf('ispe')
  if (at > 0) return {w: b.readUInt32BE(at + 8), h: b.readUInt32BE(at + 12)}
  return null
}

const seen = new Set()
let file = null
for (const path of PATHS) {
  const res = await fetch(BASE + path)
  const html = await res.text()
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(HASH))
  console.log(`\n${BASE}${path} (${res.status}): ${imgs.length} <img> of this file`)
  for (const tag of imgs.slice(0, 4)) {
    const attr = (n) => tag.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&')
    const set = (attr('srcset') ?? '').split(/,\s+/).filter(Boolean).map((c) => {
      const [u, w] = c.trim().split(/\s+/)
      return {u, w: parseInt(w)}
    })
    console.log(`  class="${tag.match(/class="([^"]*)"/)?.[1] ?? ''}" width=${attr('width')} sizes="${attr('sizes')}"`)
    console.log(`  src: ${attr('src')}`)
    console.log(`  srcset widths: ${set.map((c) => c.w).join(' ') || '(none)'}${tag.includes('data-') ? `; data: ${[...tag.matchAll(/\s(data-[a-z-]+)=/g)].map((m) => m[1]).join(' ')}` : ''}`)
    const biggest = set.sort((a, z) => z.w - a.w)[0]?.u ?? attr('src')
    for (const u of [biggest, attr('src')]) {
      if (!u || seen.has(u)) continue
      seen.add(u)
      const full = new URL(u, BASE).href
      file ??= new URL(full).pathname.match(/images\/8337vjtf\/production\/[^/?]+/)?.[0]
      const r = await fetch(full, {headers: {accept: 'image/webp,image/*;q=0.9,*/*;q=0.8'}})
      const buf = Buffer.from(await r.arrayBuffer())
      const px = r.ok ? sizeOf(buf) : null
      console.log(`    ${r.status} ${r.headers.get('content-type')} ${(buf.length / 1024).toFixed(0)} KB ${px ? `${px.w}x${px.h}` : '?'}  ${full}`)
      if (!r.ok) console.log(`      ${buf.toString('utf8').slice(0, 200)}`)
    }
  }
}
// And straight from Sanity, to tell the CDN from the route.
if (!file) process.exit(0)
const direct = `https://cdn.sanity.io/${file}?w=1600&fm=webp`
const r = await fetch(direct)
const buf = Buffer.from(await r.arrayBuffer())
console.log(`\nSanity directly: ${r.status} ${r.headers.get('content-type')} ${(buf.length / 1024).toFixed(0)} KB ${JSON.stringify(r.ok ? sizeOf(buf) : buf.toString('utf8').slice(0, 200))}`)
