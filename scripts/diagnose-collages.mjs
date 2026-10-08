/*
  What the collage artwork actually is, as files.

  WHY THIS EXISTS

  Chris is thinking about slicing pieces out of his collages and building a
  scrolling experience from them, and asked where to start. The answer turns
  almost entirely on one number he does not have in front of him: how many
  pixels the originals hold.

  A full-bleed scroll section is roughly 1920 CSS pixels wide and 2x on a
  retina screen, so ~3840 real pixels for ONE slice. If a collage is 2000px
  across in total, a slice of a third of it carries about 660 - shown across
  3840 that is a six-fold enlargement, and no amount of design rescues it.
  So "can this be done at all" is a question about the uploads, and it is
  answerable without seeing the artwork.

  Also looks for pieces already named as details, because the fastest start
  is usually the one already begun.

  READ-ONLY.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-collages.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only is enough).')
  process.exit(2)
}

const query = `*[_type == "caseStudy" &&
   (title match "*collage*" || title match "*detail*" || title match "*anatomy*")
   && !(_id in path("drafts.**"))]{
     title,
     "slug": slug.current,
     pageType,
     category,
     assetType,
     parentSlug,
     "thumbRef": thumbnail.asset._ref,
     "mainRef": mainImage.asset._ref,
     "noRecompress": coalesce(thumbnail.noRecompress, mainImage.noRecompress)
   } | order(title asc)`

const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Sanity: ${res.status} ${res.statusText}`)
  process.exit(2)
}
const docs = (await res.json()).result ?? []

// A Sanity asset reference carries the uploaded dimensions: image-<hash>-WxH-ext
const dims = (ref) => {
  const m = String(ref ?? '').match(/-(\d+)x(\d+)-\w+$/)
  return m ? {w: Number(m[1]), h: Number(m[2])} : null
}

console.log(`${docs.length} collage-related document(s)\n`)
console.log('  uploaded      ratio   as-uploaded   title')
const sizes = []
for (const d of docs) {
  const dim = dims(d.thumbRef) ?? dims(d.mainRef)
  if (dim) sizes.push(dim)
  const ratio = dim ? (dim.w / dim.h).toFixed(2) + ':1' : '-'
  console.log(
    `  ${String(dim ? `${dim.w}x${dim.h}` : 'no image').padEnd(12)}  ${ratio.padStart(6)}   ` +
      `${(d.noRecompress ? 'yes' : 'no').padStart(11)}   ${d.title}`,
  )
  if (d.parentSlug) console.log(`                                        part of ${d.parentSlug}`)
}

/*
  THE NUMBER THAT DECIDES IT.

  One full-bleed section at 1920 CSS wide on a 2x screen needs ~3840 real
  pixels. Slicing means showing a FRACTION of the collage at that size, so
  the requirement is on the fraction, not on the whole file.
*/
const widest = sizes.length ? Math.max(...sizes.map((s) => s.w)) : 0
const NEED = 3840

console.log(`\n  WHAT A SCROLLING TREATMENT WOULD NEED`)
console.log(`    one full-bleed section at 1920 css, 2x screen   ${NEED}px`)
console.log(`    the largest collage upload here                 ${widest}px`)
if (widest) {
  for (const frac of [1, 1 / 2, 1 / 3, 1 / 4]) {
    const have = Math.round(widest * frac)
    const label = frac === 1 ? 'the whole piece' : `a ${Math.round(1 / frac)}-way slice`
    const over = (NEED / have).toFixed(1)
    console.log(
      `    ${label.padEnd(18)} gives ${String(have + 'px').padStart(7)}  ` +
        `-> ${over}x enlargement${Number(over) <= 1 ? '  ok' : ''}`,
    )
  }
}

const details = docs.filter((d) => /detail/i.test(d.title ?? ''))
if (details.length) {
  console.log(`\n  ALREADY SLICED: ${details.length} piece(s) are named as details`)
  for (const d of details) console.log(`    ${d.title}`)
}
