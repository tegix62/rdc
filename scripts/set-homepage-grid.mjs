/*
  Fill siteSettings.featuredWork - the homepage work grid.

  Empty today, so the grid falls back to most-recently-added. Recency is a
  reasonable default and a poor showcase: it puts whatever was uploaded last in
  front of a client rather than whatever is strongest.

  WHY THESE FOUR

  The grid is four columns and there are six case studies, which is one full row
  plus two orphans against two empty cells - a shape that reads as broken rather
  than short. Four is the number that makes a clean row.

  Adelante, Hug a Mug and DumpStat are the three projects the testimonial cards
  further down the page already quote by name, with revenue and audience
  figures attached. Showing those tiles above the quotes means the evidence and
  the claim are about the same work, rather than a visitor scrolling past four
  projects to read praise for three others.

  Chateau Seven completes the row. Left out: "More Kilos, Less Egos", which is
  an Adelante offcut and would put the same brand on screen twice, and Two Point
  Oh, whose tile image is 800x800 and visibly soft at grid size.

  None of this is permanent. The field is a drag-and-drop picker in Studio -
  Site Settings -> Homepage -> "Work grid" - and rearranging it is faster than
  reading this comment.

  DRY BY DEFAULT. Changes nothing unless SET=yes.

  Usage:
    SANITY_API_TOKEN=... node scripts/set-homepage-grid.mjs
    SANITY_API_TOKEN=... SET=yes node scripts/set-homepage-grid.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const API = `https://${PROJECT_ID}.api.sanity.io`
const TOKEN = process.env.SANITY_API_TOKEN
const LIVE = process.env.SET === 'yes'

// Order is the display order, left to right.
const SLUGS = ['adelante-barbell-club', 'hug-a-mug', 'dumpstat', 'chateau-seven']

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}
const auth = {Authorization: `Bearer ${TOKEN}`}

const groq = async (query) => {
  const res = await fetch(`${API}/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
    headers: auth,
  })
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

console.log(LIVE ? '# Setting the homepage grid\n' : '# DRY RUN - nothing will be changed\n')

const found = await groq(`*[_type == "caseStudy" && slug.current in ${JSON.stringify(SLUGS)}
  && !(_id in path("drafts.**"))]{_id, title, "slug": slug.current, heroTile,
  "hasImage": defined(thumbnail.asset) || defined(mainImage.asset)}`)

/*
  Resolve by slug and check every one landed. A reference to an id that does not
  exist renders as a silently missing tile - the grid would just be shorter,
  with nothing anywhere saying why.
*/
const bySlug = new Map(found.map((d) => [d.slug, d]))
const missing = SLUGS.filter((s) => !bySlug.has(s))
if (missing.length) {
  console.error(`These slugs matched no published case study: ${missing.join(', ')}`)
  console.error('Refusing to write a grid with holes in it.')
  process.exit(1)
}

const imageless = found.filter((d) => !d.hasImage)
if (imageless.length) {
  console.error(`No tile image: ${imageless.map((d) => d.title).join(', ')}`)
  console.error('A tile with no image cannot render. Refusing.')
  process.exit(1)
}

const current = await groq(`*[_type == "siteSettings"][0]{
  "picked": featuredWork[]->{title, "slug": slug.current}
}`)

console.log('Now:')
if (!current?.picked?.length) console.log('  (empty - the grid is falling back to most-recently-added)\n')
else for (const p of current.picked) console.log(`  ${p.title}`)
console.log()

let cells = 0
console.log('Would become:')
for (const slug of SLUGS) {
  const d = bySlug.get(slug)
  cells += d.heroTile ? 2 : 1
  console.log(`  ${d.title}${d.heroTile ? '   [hero tile - spans 2 columns]' : ''}`)
}
console.log(`\n  ${cells} cells across a 4-column grid = ${(cells / 4).toFixed(2)} rows.`)
if (cells % 4 !== 0) {
  console.log(`  NOT a whole number of rows - the last row will have ${cells % 4} of 4 filled.`)
}
console.log()

if (!LIVE) {
  console.log('DRY RUN. Nothing was changed. Re-run with SET=yes to apply.')
  process.exit(0)
}

const featuredWork = SLUGS.map((slug, i) => ({
  _type: 'reference',
  _key: `grid${i}`,
  _ref: bySlug.get(slug)._id,
}))

const res = await fetch(`${API}/v2024-01-01/data/mutate/${DATASET}`, {
  method: 'POST',
  headers: {...auth, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations: [{patch: {id: 'siteSettings', set: {featuredWork}}}]}),
})
if (!res.ok) throw new Error(`Patch failed: ${res.status} ${await res.text()}`)

// Read back the resolved titles, not the count: four references to the wrong
// documents would satisfy a count check perfectly.
const after = await groq(`*[_id == "siteSettings"][0].featuredWork[]->{"slug": slug.current, title}`)
console.log('Set. Reading it back:\n')
for (const [i, d] of (after ?? []).entries()) {
  const ok = d?.slug === SLUGS[i]
  console.log(`  ${ok ? 'ok  ' : 'WRONG'}  ${i + 1}. ${d?.title ?? '(unresolved)'}`)
}
console.log()

const wrong = (after ?? []).filter((d, i) => d?.slug !== SLUGS[i]).length
if (wrong || (after ?? []).length !== SLUGS.length) {
  console.error('The grid did not come back as written. Check Studio.')
  process.exit(1)
}
console.log('The homepage grid is set, in this order.')
console.log('It appears on the site at the next production deploy.')
