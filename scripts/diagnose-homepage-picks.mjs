/*
  The two content decisions left before launch, with the real options listed.

  1. siteSettings.socialImage is empty, so every page without an image of its
     own - the homepage, About, Portfolio, Blog index - previews as the
     wordmark padded onto white when someone pastes the link. That is the first
     thing a prospective client sees in a DM.

  2. siteSettings.featuredWork is empty, so the homepage grid falls back to
     most-recently-added. Recency is a fine default and a poor showcase: it
     puts whatever was uploaded last in front of a client rather than whatever
     is strongest.

  Both need Chris to choose. Neither choice can be made from a list of ids, so
  this prints what there is to choose FROM: every case study that could go in
  the grid, and every image big enough to work as a share card.

  A share card is displayed at 1200x630 and CROPPED to that shape, so the
  useful facts about a candidate are its width and how far its shape is from
  1.91:1 - a tall image loses its top and bottom.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-homepage-picks.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    TOKEN ? {headers: {Authorization: `Bearer ${TOKEN}`}} : undefined,
  )
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

/*
  Dimensions come out of the asset id, not a metadata lookup: Sanity encodes
  them as image-<hash>-<w>x<h>-<ext>, so one query answers what would otherwise
  be one request per image.
*/
const dims = (ref) => {
  const m = /-(\d+)x(\d+)-[a-z]+$/.exec(ref ?? '')
  return m ? {w: Number(m[1]), h: Number(m[2])} : null
}

const CARD_RATIO = 1200 / 630 // 1.905

/*
  How much of an image the 1200x630 crop throws away.

  The first version of this computed `1 - min(1, CARD_RATIO / ratio)`, which is
  backwards, and it clamped to zero for every image narrower than the card -
  so it reported "loses about 0%" for a 2000x2000 square that actually loses
  nearly half its height. Every candidate looked equally safe, which made the
  whole column worthless for choosing between them.

  Fit by width when the image is taller than the card: the visible strip is
  width/CARD_RATIO tall out of an actual height of width/ratio, so the kept
  fraction is ratio/CARD_RATIO. Fit by height in the other direction, and the
  kept fraction of the width is CARD_RATIO/ratio.
*/
const cropNote = (ratio) => {
  if (Math.abs(ratio - CARD_RATIO) < 0.02) return 'almost exactly the card shape - no meaningful crop'
  const pct = Math.round((1 - (ratio < CARD_RATIO ? ratio / CARD_RATIO : CARD_RATIO / ratio)) * 100)
  return ratio < CARD_RATIO
    ? `taller than the card - loses ${pct}% off the top and bottom`
    : `wider than the card - loses ${pct}% off the sides`
}

// Checked here rather than assumed, because the first version of this was
// wrong in a way that read as reassuring.
for (const [ratio, want] of [[1, 47], [1.78, 7], [CARD_RATIO, 0], [3, 36]]) {
  const got = Math.round((1 - (ratio < CARD_RATIO ? ratio / CARD_RATIO : CARD_RATIO / ratio)) * 100)
  if (Math.abs(got - want) > 1) throw new Error(`crop maths wrong: ratio ${ratio} gave ${got}%, expected ~${want}%`)
}

console.log('# The two homepage decisions\n')

// --- 1. Grid candidates ----------------------------------------------------
const studies = await groq(`*[_type == "caseStudy" && pageType == "Case Study"]{
  _id, title, "slug": slug.current, heroTile,
  "thumb": thumbnail.asset._ref, "main": mainImage.asset._ref,
  "children": count(*[_type == "caseStudy" && parentBrand._ref == ^._id])
} | order(title asc)`)

console.log(`## Homepage grid - ${studies.length} case studies to choose from\n`)
console.log(`The grid is four columns. A "hero tile" spans two, so it counts as`)
console.log(`two cells - worth knowing when aiming for full rows.\n`)

let cells = 0
for (const s of studies) {
  const ref = s.thumb ?? s.main
  const d = dims(ref)
  const width = s.heroTile ? 2 : 1
  cells += width
  console.log(`  ${s.title}`)
  console.log(`      /work/${s.slug}`)
  console.log(
    `      ${s.heroTile ? 'HERO TILE (2 cells)' : '1 cell'}   ` +
      `image ${ref ? `${d?.w}x${d?.h}` : 'MISSING - cannot appear in the grid'}   ` +
      `${s.children} related tile(s)`,
  )
  console.log()
}
console.log(`  All of them together = ${cells} cells = ${(cells / 4).toFixed(2)} rows.\n`)

// --- 2. Share card candidates ---------------------------------------------
/*
  Drawn from what is already in the site rather than from the whole asset
  library: an image already chosen as a project's main image has been picked
  for looking good at large size, which is most of what a share card needs.
*/
const images = await groq(`*[_type == "caseStudy" && defined(mainImage.asset)]{
  title, "ref": mainImage.asset._ref
}`)

const settings = await groq(`*[_type == "siteSettings"][0]{
  "social": socialImage.asset._ref,
  "hero": heroBackground.asset._ref,
  "portrait": portrait.asset._ref,
  "logo": logo.asset._ref
}`)

console.log(`## Share card - currently ${settings?.social ? 'SET' : 'EMPTY (falls back to the wordmark)'}\n`)
console.log(`Shown at 1200x630 and cropped to it. Ratio 1.91 is a perfect fit;`)
console.log(`anything much taller loses its top and bottom to the crop.\n`)

const candidates = [
  ...(settings?.hero ? [{title: 'Homepage hero background', ref: settings.hero}] : []),
  ...(settings?.portrait ? [{title: 'Your portrait', ref: settings.portrait}] : []),
  ...images,
]
  .map((c) => ({...c, d: dims(c.ref)}))
  .filter((c) => c.d && c.d.w >= 1200)
  .map((c) => ({...c, ratio: c.d.w / c.d.h}))
  .sort((a, b) => Math.abs(a.ratio - CARD_RATIO) - Math.abs(b.ratio - CARD_RATIO))

if (!candidates.length) {
  console.log(`  Nothing in the site is 1200px wide or more. A share card would`)
  console.log(`  have to be exported specially - 1200x630 exactly.\n`)
} else {
  console.log(`  ${candidates.length} image(s) at least 1200px wide, closest shape first:\n`)
  for (const c of candidates.slice(0, 12)) {
    console.log(`  ${c.title}`)
    console.log(`      ${c.d.w}x${c.d.h}  ratio ${c.ratio.toFixed(2)}  ${cropNote(c.ratio)}`)
  }
  console.log()
}

const tooSmall = [...images].map((c) => ({...c, d: dims(c.ref)})).filter((c) => c.d && c.d.w < 1200)
if (tooSmall.length) {
  console.log(`  ${tooSmall.length} main image(s) are under 1200px wide and were skipped -`)
  console.log(`  upscaling one would ship a soft card, which reads as a cheap site.\n`)
}
