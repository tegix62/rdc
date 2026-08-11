/*
  Every image the homepage renders, and which asset each one points at.

  WHY

  The page audit found the homepage fetching one 3,981 KB animated WebP TWICE on
  desktop and once on mobile - 8,377 KB against 4,512 KB, about half the desktop
  page being a second copy of a single file. Two responses for one URL.

  The audit can see that it happened. It cannot see WHY, because it records
  network requests and not which element asked for them. The obvious suspect is
  one asset used in two places on the same page: the hero background is a CSS
  background, and if the same file is also a work tile then desktop loads both
  while a phone lazy-loads the tile below the fold and never fetches it. That
  would explain the one-request difference exactly - but it is a hypothesis, and
  the last two times I reasoned from one of those without checking I was wrong
  in a way that cost hours.

  So this lists the homepage's images by asset id and says plainly whether any id
  appears more than once. It proves or kills the theory rather than dressing it
  up.

  Usage: node scripts/diagnose-homepage-images.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

const idOf = (ref) => {
  const m = typeof ref === 'string' && ref.match(/^image-([^-]+)-(\d+x\d+)-([a-z0-9]+)$/i)
  return m ? {id: m[1], dims: m[2], ext: m[3]} : null
}

const q = (s) => encodeURIComponent(s)
const fetchGroq = async (groq) => {
  const res = await fetch(
    `https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${q(groq)}`,
  )
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

const settings = await fetchGroq(`*[_type == "siteSettings"][0]{
  "hero": heroBackground.asset._ref,
  "proof": proofBandBackground.asset._ref,
  "portrait": portrait.asset._ref,
  "logo": logo.asset._ref,
  "favicon": favicon.asset._ref,
  "social": socialImage.asset._ref,
  "clientLogos": clientLogos[]{ "ref": logo.asset._ref, alt },
  "featured": featuredWork[]->{ title, "thumb": thumbnail.asset._ref, "main": mainImage.asset._ref }
}`)

// What the grid falls back to while the picker is empty - the same query
// getFeaturedWork uses.
const studies = await fetchGroq(`*[_type == "caseStudy" && pageType == "Case Study"
   && (defined(thumbnail) || defined(mainImage))]
  | order(title asc)[0...8]{ title, "thumb": thumbnail.asset._ref, "main": mainImage.asset._ref }`)

const used = []
const add = (where, ref) => {
  const d = idOf(ref)
  if (d) used.push({where, ...d})
}

add('hero background (CSS)', settings?.hero)
add('proof band background (CSS)', settings?.proof)
add('portrait', settings?.portrait)
add('nav + footer wordmark', settings?.logo)
add('favicon', settings?.favicon)
add('default social card', settings?.social)
for (const [i, l] of (settings?.clientLogos ?? []).entries()) {
  add(`client logo ${i + 1} (${l?.alt ?? 'no alt'})`, l?.ref)
}

const grid = settings?.featured?.length ? settings.featured : studies
const gridSource = settings?.featured?.length ? 'curated picker' : 'FALLBACK (picker empty)'
for (const item of grid ?? []) {
  add(`work grid: ${item?.title ?? '?'} [${gridSource}]`, item?.thumb ?? item?.main)
}

console.log(`# Homepage images\n`)
console.log(`Work grid source: ${gridSource}\n`)
const pad = (s, n) => String(s).padEnd(n)
console.log(pad('where', 46) + pad('dimensions', 12) + 'asset')
console.log('-'.repeat(46 + 12 + 20))
for (const u of used) {
  console.log(pad(u.where.slice(0, 45), 46) + pad(`${u.dims} ${u.ext}`, 12) + u.id.slice(0, 16))
}

const byId = new Map()
for (const u of used) byId.set(u.id, [...(byId.get(u.id) ?? []), u.where])
const dupes = [...byId.entries()].filter(([, wheres]) => wheres.length > 1)

console.log(`\n## The same asset used more than once\n`)
if (!dupes.length) {
  console.log(`None. Every image on the homepage is a distinct asset.`)
  console.log(`\nSo the doubled 3,981 KB request is NOT one file in two places, and`)
  console.log(`the next place to look is the request waterfall itself - a preload`)
  console.log(`racing the CSS background, or a cache-busting difference between the`)
  console.log(`two URLs that the audit's grouping by URL would not show.`)
} else {
  for (const [id, wheres] of dupes) {
    const d = used.find((u) => u.id === id)
    console.log(`  ${id.slice(0, 16)} (${d.dims} ${d.ext}) is used ${wheres.length}x:`)
    for (const w of wheres) console.log(`    - ${w}`)
  }
  console.log(`\nEach of these is downloaded once per place it appears, unless the`)
  console.log(`browser has it cached before the second request starts.`)
}
