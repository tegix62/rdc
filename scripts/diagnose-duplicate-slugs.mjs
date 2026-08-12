/*
  Two published documents sharing one slug.

  WHY THIS EXISTS

  The SEO audit reported `/work/chateau-seven` twice, with identical copy. That
  is not a duplicate description - it is two documents claiming the same URL.

  Nothing in the pipeline notices. The build iterates case studies and writes a
  page per slug, so the second one silently overwrites the first, and WHICH
  survives depends on query order rather than on anything anybody decided. The
  sitemap lists the URL twice. Every existing check passes: test-head compares
  built pages, and only one page per path is ever built.

  The symptom it produces is much stranger than the cause. Chris changed Chateau
  Seven's main image, Sanity saved it - verified - and the live page did not
  change. If the edit landed on the document that loses the race, that is exactly
  what you would see, and no amount of redeploying fixes it.

  So this reports every slug held by more than one published document, per type,
  with enough detail to decide which copy to keep: when each was created and last
  touched, and which images each carries.

  READ-ONLY. Reports; changes nothing.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-duplicate-slugs.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only use).')
  process.exit(1)
}

const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

/*
  Published documents only. A draft shares its slug with the document it is a
  draft OF, by design, so including drafts would report a duplicate for every
  document currently being edited - noise that would bury the real thing.
*/
const docs = await groq(`*[_type in ["caseStudy", "blogPost", "page"] && defined(slug.current)
  && !(_id in path("drafts.**"))]{
    _id, _type, _createdAt, _updatedAt, title, pageType,
    "slug": slug.current,
    "thumb": thumbnail.asset._ref,
    "main": mainImage.asset._ref,
    "blocks": count(body)
  } | order(_type asc, slug asc, _createdAt asc)`)

console.log(`${docs.length} published documents with a slug\n`)

const groups = new Map()
for (const d of docs) {
  const key = `${d._type}:${d.slug}`
  groups.set(key, [...(groups.get(key) ?? []), d])
}

const dupes = [...groups.entries()].filter(([, list]) => list.length > 1)

if (!dupes.length) {
  console.log('No slug is held by more than one published document.')
  process.exit(0)
}

console.log(`${dupes.length} slug(s) held by more than one document:\n`)

const short = (ref) => (typeof ref === 'string' ? ref.slice(6, 22) : '(none)')

for (const [key, list] of dupes) {
  const [type, slug] = key.split(':')
  const route = type === 'caseStudy' ? `/work/${slug}` : type === 'blogPost' ? `/blog/${slug}` : `/${slug}`
  console.log(`${route}   (${type}, ${list.length} documents)\n`)
  for (const d of list) {
    console.log(`  _id         ${d._id}`)
    console.log(`  title       ${d.title ?? '(none)'}`)
    console.log(`  pageType    ${d.pageType ?? '(n/a)'}`)
    console.log(`  created     ${d._createdAt}`)
    console.log(`  updated     ${d._updatedAt}`)
    console.log(`  thumbnail   ${short(d.thumb)}`)
    console.log(`  mainImage   ${short(d.main)}`)
    console.log(`  body blocks ${d.blocks ?? 0}`)
    console.log()
  }

  /*
    Which one the site currently serves is not knowable from here with certainty
    - it depends on the order the build's query returns them, which is why this
    prints the facts and refuses to guess. What IS knowable is which was touched
    most recently, and that is almost always the one somebody meant to keep.
  */
  const newest = list.reduce((a, b) => (a._updatedAt > b._updatedAt ? a : b))
  console.log(`  Most recently edited: ${newest._id} (${newest._updatedAt})`)
  console.log(`  That is probably the one to keep, but check the images above - the`)
  console.log(`  page may currently be rendering the other one.\n`)
}

console.log('Two documents cannot share a URL. Delete or re-slug the losers in')
console.log('Studio, then re-run this.')
process.exit(1)
