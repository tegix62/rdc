/*
  What each standalone page is actually built out of.

  WHY THIS EXISTS

  Chris asked for the Video page to be customisable "essentially like the
  Page Builder". It already is: page.sections accepts all eight block types -
  full image, two up, three up, image+text, video, media row, media+text,
  aesthetic range - and src/pages/video.astro renders them.

  So the useful question is not "can it" but "what is on it now". A page
  holding only `body` looks un-customisable from Studio even when the Page
  Sections field is sitting right there, and that is the likeliest reason
  for the request.

  Reports every page document: its slug, whether it has body text, how many
  sections and of what type. Which also shows which pages have ALREADY been
  built this way, so Video has an example to copy rather than a blank field.

  READ-ONLY.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-pages.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only is enough).')
  process.exit(2)
}

const query = `*[_type == "page" && !(_id in path("drafts.**"))]{
  title,
  "slug": slug.current,
  "bodyBlocks": count(body),
  "sections": sections[]{_type, _key, title, heading},
  "hasHero": defined(heroImage) || defined(hero)
} | order(slug asc)`

const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Sanity: ${res.status} ${res.statusText}`)
  process.exit(2)
}
const pages = (await res.json()).result ?? []

console.log(`${pages.length} page document(s)\n`)

for (const p of pages) {
  const sections = p.sections ?? []
  console.log(`  /${p.slug ?? '(no slug)'}   ${p.title ?? '(untitled)'}`)
  console.log(
    `    body: ${p.bodyBlocks ?? 0} block(s)` +
      `   sections: ${sections.length}` +
      (sections.length ? '' : '   <- nothing built with the Page Builder yet'),
  )
  for (const s of sections) {
    const label = s.heading || s.title || ''
    console.log(`      ${s._type}${label ? `  "${String(label).slice(0, 40)}"` : ''}`)
  }
  console.log('')
}

/*
  The point of the summary: whether any page is already an example to copy.
  "You can do this" is less useful than "this page already does it".
*/
const built = pages.filter((p) => (p.sections ?? []).length > 0)
if (built.length) {
  console.log(`  Already built with sections: ${built.map((p) => '/' + p.slug).join(', ')}`)
} else {
  console.log('  No page uses sections yet - Video would be the first.')
}

const types = new Set()
for (const p of pages) for (const s of p.sections ?? []) types.add(s._type)
if (types.size) console.log(`  Section types in use across all pages: ${[...types].sort().join(', ')}`)
