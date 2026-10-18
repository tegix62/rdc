/*
  Does a magnifier patch show the part of the scan it claims to?

  Screenshots of the glass showed seams and patches whose content did not
  match the picture beneath them. The placement arithmetic is consistent,
  so the question is what the image CDN returns for a `rect` on a 7,186px,
  43 MB original. For each of the four patches meeting at the scan's centre
  this fetches the patch exactly as the page does, reports its real pixel
  size, and searches a small copy of the whole scan for where that patch
  actually matches best - position and scale. If the CDN reads rect in some
  other coordinate space, the offset or scale here says which.

  Usage: node scripts/diagnose-loupe-patches.mjs   (needs `sharp`)
*/
import sharp from 'sharp'
import {TILE, tileUrl} from '../src/lib/loupeGrid.mjs'

const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const q = `*[_type == "caseStudy" && defined(fullScan.asset) && !(_id in path("drafts.**"))][0]{
  title, "scan": fullScan.asset->{url, "w": metadata.dimensions.width, "h": metadata.dimensions.height, "orientation": metadata.exif.Orientation}
}`
const doc = (
  await (await fetch(`https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(q)}`)).json()
).result
const {url, w: W, h: H, orientation} = doc.scan
console.log(`${doc.title}: ${W} x ${H}, EXIF orientation ${orientation ?? 'none'}\n`)

const get = async (u) => Buffer.from(await (await fetch(u)).arrayBuffer())
const gray = async (buf, w, h) =>
  sharp(buf).resize(w, h, {fit: 'fill'}).greyscale().raw().toBuffer()

// The whole scan, small, as the reference to search in.
const R = 360
const refBuf = await get(`${url}?w=${R}&fm=png`)
const refMeta = await sharp(refBuf).metadata()
const RH = refMeta.height
const ref = await sharp(refBuf).greyscale().raw().toBuffer()
console.log(`reference copy: ${refMeta.width} x ${RH}`)

const diff = (a, aw, b, bx, by, bw, n) => {
  let sum = 0
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) sum += Math.abs(a[j * aw + i] - b[(by + j) * bw + bx + i])
  return sum / (n * n)
}

const cx = Math.floor(W / 2 / TILE) * TILE
const cy = Math.floor(H / 2 / TILE) * TILE
for (const [x, y] of [[cx - TILE, cy - TILE], [cx, cy - TILE], [cx - TILE, cy], [cx, cy]]) {
  const w = Math.min(TILE, W - x)
  const h = Math.min(TILE, H - y)
  const buf = await get(tileUrl(url, x, y, w, h))
  const meta = await sharp(buf).metadata()

  // Expected position in the reference, and how well it matches there.
  const k = R / W
  const ex = Math.round(x * k)
  const ey = Math.round(y * k)
  let best = {d: Infinity}
  for (const scale of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]) {
    const n = Math.max(4, Math.round(TILE * k * scale))
    if (n >= R || n >= RH) continue
    const patch = await gray(buf, n, n)
    for (let by = 0; by + n <= RH; by += 1)
      for (let bx = 0; bx + n <= R; bx += 1) {
        const d = diff(patch, n, ref, bx, by, R, n)
        if (d < best.d) best = {d, bx, by, scale, n}
      }
  }
  const nExp = Math.round(TILE * k)
  const expected = diff(await gray(buf, nExp, nExp), nExp, ref, ex, ey, R, nExp)
  console.log(
    `patch ${x},${y} (${w}x${h} asked): came back ${meta.width}x${meta.height} ${meta.format}\n` +
      `  at its own place (${ex},${ey}): mean diff ${expected.toFixed(1)}\n` +
      `  best match: (${best.bx},${best.by}) at scale ${best.scale}, mean diff ${best.d.toFixed(1)}` +
      `  -> in scan pixels (${Math.round(best.bx / k)},${Math.round(best.by / k)}), covering ${Math.round(best.n / k)}px`,
  )
}
