/*
  For every tile the Portfolio draws: which image field holds its picture,
  and which fields are present but empty.

  WHY THIS EXISTS

  Eight of Chris's grid items rendered as blank boxes. The fix was in the
  code - an empty Grid Thumbnail is truthy and used to beat the Main Project
  Image behind it - but Chris asked a fair question afterwards: wasn't it just
  that he put the pictures in Main Project Image rather than Grid Thumbnail?

  That is a factual question with three possible answers, and arguing it from
  the shape of the code would be the same kind of guesswork that made this bug
  take all afternoon:

    - if mainImage-only tiles are RARE or absent, he has a point: the site
      effectively expects a thumbnail, and his upload went against the grain.
    - if mainImage-only tiles are COMMON and were on the page all along, then
      Main Project Image is an ordinary way to fill a tile and the eight broke
      for the other reason - the empty shell.

  So this counts them. Four states per document, which are not the same thing
  and have been conflated at least twice:

    thumbnail        Grid Thumbnail holds a file. It wins, as intended.
    mainImage        no thumbnail FIELD at all; drawn from Main Project Image.
    SHELL            thumbnail field exists with no asset - the eight.
    none             neither field holds a file. Not a tile.

  `defined(thumbnail)` is true for a shell, which is why that is not the test
  used here - the whole bug lives in the gap between "the field exists" and
  "the field holds a file". asset._ref is the only honest check.

  READ-ONLY.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-tile-image-fields.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only is enough).')
  process.exit(2)
}

const query = `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
   && (defined(thumbnail) || defined(mainImage))
   && !(_id in path("drafts.**"))]{
     title,
     "slug": slug.current,
     pageType,
     "thumbField": defined(thumbnail),
     "thumbRef": thumbnail.asset._ref,
     "mainField": defined(mainImage),
     "mainRef": mainImage.asset._ref,
     _createdAt
   } | order(_createdAt asc)`

const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Sanity: ${res.status} ${res.statusText}`)
  process.exit(2)
}
const docs = (await res.json()).result ?? []

const stateOf = (d) => {
  if (typeof d.thumbRef === 'string') return 'thumbnail'
  if (typeof d.mainRef === 'string') return d.thumbField ? 'SHELL' : 'mainImage'
  return 'none'
}

const groups = {thumbnail: [], mainImage: [], SHELL: [], none: []}
for (const d of docs) groups[stateOf(d)].push(d)

console.log(`${docs.length} tile document(s) the Portfolio query accepts\n`)
console.log(`  thumbnail  ${String(groups.thumbnail.length).padStart(3)}  Grid Thumbnail holds a file`)
console.log(`  mainImage  ${String(groups.mainImage.length).padStart(3)}  no thumbnail field; drawn from Main Project Image`)
console.log(`  SHELL      ${String(groups.SHELL.length).padStart(3)}  thumbnail field present with NO file - beat mainImage`)
console.log(`  none       ${String(groups.none.length).padStart(3)}  neither field holds a file`)

/*
  The answer to the actual question. A mainImage-only tile that predates the
  eight is proof that Main Project Image has been drawing tiles on this site
  for as long as the site has existed.
*/
if (groups.mainImage.length) {
  const sorted = [...groups.mainImage].sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)))
  console.log(
    `\n  Main Project Image alone draws ${groups.mainImage.length} tile(s), the oldest created ` +
      `${String(sorted[0]._createdAt).slice(0, 10)}:`,
  )
  for (const d of sorted.slice(0, 12)) {
    console.log(`    ${String(d._createdAt).slice(0, 10)}  ${d.title}`)
  }
  if (sorted.length > 12) console.log(`    ... and ${sorted.length - 12} more`)
} else {
  console.log('\n  No tile is drawn from Main Project Image alone.')
}

if (groups.SHELL.length) {
  console.log(`\n  The empty thumbnail shells (${groups.SHELL.length}) - these are the blank tiles:`)
  for (const d of groups.SHELL) console.log(`    ${d.slug ?? '(no slug)'}  ${d.title}`)
}

if (groups.none.length) {
  console.log(`\n  Accepted by the query but holding no file at all (${groups.none.length}):`)
  for (const d of groups.none) console.log(`    ${d.slug ?? '(no slug)'}  ${d.title}`)
}
