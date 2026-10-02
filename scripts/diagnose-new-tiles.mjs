/*
  Why a newly uploaded tile is not on the Portfolio.

  WHY THIS EXISTS

  Chris uploaded a batch of grid items, published each one, and does not
  see them. There are three different reasons that can happen and they
  look identical from the outside:

    1. THE QUERY DROPS IT. getAllGridItems is

         *[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
            && (defined(thumbnail) || defined(mainImage))]

       so a document with no image is not a blank tile - it is not on the
       page at all. Same for a pageType that is anything other than those
       two strings, including empty.

    2. IT IS STILL A DRAFT. Publishing each one is what Chris describes
       doing, but a document edited after publishing has a draft again,
       and the site builds from published.

    3. THE SITE HAS NOT REBUILT SINCE. A publish fires a webhook that
       rebuilds; if the build ran before the last publish, the tile is in
       the dataset and not in the HTML.

  This separates them. For the most recently touched documents it reports
  what the query sees, what is only in a draft, and when each was last
  updated - so the answer is "it is missing because X" rather than "it is
  missing".

  READ-ONLY. Reports; changes nothing.

  Usage: SANITY_API_TOKEN=... [LIMIT=25] node scripts/diagnose-new-tiles.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const LIMIT = Number(process.env.LIMIT ?? 25)

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only use).')
  process.exit(1)
}

const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()).result
}

const recent = await groq(
  `*[_type == "caseStudy"] | order(_updatedAt desc) [0...${LIMIT}]{
    _id, _updatedAt, title, "path": slug.current,
    "pageType": pageType,
    "hasThumb": defined(thumbnail),
    "hasMain": defined(mainImage),
    "category": category,
    "hasParent": defined(parentBrand)
  }`,
)

/*
  The query the page actually runs, asked for separately rather than
  reimplemented here - the whole point is to compare what Chris sees in
  Studio against what the BUILD sees, so this has to be the build's own
  condition.
*/
const onPage = await groq(
  `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
     && (defined(thumbnail) || defined(mainImage))
     && !(_id in path("drafts.**"))]{"id": _id}`,
)
const visible = new Set(onPage.map((d) => d.id))

console.log(`${visible.size} documents are on the Portfolio.\n`)
console.log(`The ${recent.length} most recently touched:\n`)

const published = recent.filter((d) => !d._id.startsWith('drafts.'))
const draftIds = new Set(
  recent.filter((d) => d._id.startsWith('drafts.')).map((d) => d._id.replace('drafts.', '')),
)

for (const d of recent) {
  const isDraft = d._id.startsWith('drafts.')
  const id = isDraft ? d._id.replace('drafts.', '') : d._id
  if (isDraft && published.some((p) => p._id === id)) continue // reported on the published row

  const reasons = []
  if (!['Case Study', 'Grid Item'].includes(d.pageType)) {
    reasons.push(`pageType is ${d.pageType ? `"${d.pageType}"` : 'EMPTY'} - the query wants "Grid Item"`)
  }
  if (!d.hasThumb && !d.hasMain) reasons.push('NO IMAGE - the query skips it entirely')
  if (isDraft) reasons.push('never published - only a draft exists')

  const state = visible.has(id)
    ? 'ON THE PAGE'
    : reasons.length
      ? 'MISSING'
      : 'MISSING for no reason this can see'

  console.log(`  ${state.padEnd(12)} ${(d.path ?? d.title ?? id).slice(0, 44).padEnd(46)} ${d._updatedAt}`)
  if (!visible.has(id)) for (const r of reasons) console.log(`               - ${r}`)
  if (visible.has(id) && !d.category) {
    console.log('               - no category, so it shows under "All" and under no filter button')
  }
  if (draftIds.has(id) && visible.has(id)) {
    console.log('               - has unpublished changes; the page shows the published version')
  }
}

/*
  The build is static, so "in the dataset" and "in the HTML" are different
  claims. The newest publish time is what a deploy has to be later than.
*/
const newest = recent.filter((d) => !d._id.startsWith('drafts.'))[0]
if (newest) {
  console.log(`\nNewest published change: ${newest._updatedAt} (${newest.path ?? newest.title})`)
  console.log('A deploy that finished BEFORE that time does not contain it.')
}
