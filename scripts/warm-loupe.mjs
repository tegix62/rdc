/*
  Asks the image CDN for every magnifier patch of every collage scan once,
  so no visitor is the first to ask for one.

  Measured on the Magnesium Mildness scan (7,186 x 7,178px, 43 MB): the
  first cut of a patch took about 2 seconds, and the same patch afterwards
  9-220 ms. The magnifier only ever asks for patches on the fixed grid in
  src/lib/loupeGrid.mjs - imported here, so the URLs are the same bytes -
  which is what makes warming possible at all.

  Eight at a time: enough to finish a scan in about a minute, few enough
  not to look like abuse of a CDN we are a customer of. Reports any patch
  that does not come back 200, since that is a hole in the glass.

  Usage: node scripts/warm-loupe.mjs
*/
import {tileGrid, tileUrl} from '../src/lib/loupeGrid.mjs'

const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const query = `*[_type == "caseStudy" && defined(fullScan.asset) && !(_id in path("drafts.**"))]{
  title, "scan": fullScan.asset->{url, "w": metadata.dimensions.width, "h": metadata.dimensions.height}
}`
const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
)
if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`)
const docs = (await res.json()).result ?? []

let failed = 0
for (const d of docs) {
  const {url, w, h} = d.scan ?? {}
  if (!url || !w || !h) continue
  const grid = tileGrid(w, h)
  const t0 = performance.now()
  let slow = 0
  let i = 0
  const worker = async () => {
    while (i < grid.length) {
      const p = grid[i++]
      const s = performance.now()
      const r = await fetch(tileUrl(url, p.x, p.y, p.w, p.h))
      await r.arrayBuffer()
      if (performance.now() - s > 800) slow++
      if (r.status !== 200) {
        failed++
        console.log(`  FAIL ${r.status} at ${p.x},${p.y}`)
      }
    }
  }
  await Promise.all(Array.from({length: 8}, worker))
  console.log(
    `${d.title}: ${grid.length} patches in ${((performance.now() - t0) / 1000).toFixed(0)}s, ` +
      `${slow} were cold (over 800 ms) - the rest were already warm`,
  )
}
if (failed) {
  console.log(`\n${failed} patch(es) failed.`)
  process.exit(1)
}
