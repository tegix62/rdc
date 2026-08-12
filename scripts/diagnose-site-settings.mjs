/*
  What does the site ACTUALLY read from Site Settings?

  Chris pasted the Meta Pixel ID into Studio, confirmed the field holds it, and
  confirmed Publish is greyed out - which in Sanity means there are no
  unpublished changes. And the build still reports:

    [MetaPixel] off - no ID in Site Settings

  That came from the PREVIEW build, which queries with `useCdn: false`, so it
  read live uncached data. Caching is not the explanation.

  Which leaves the query itself. The site fetches:

    *[_type == "siteSettings"][0]

  `[0]` takes the FIRST match in an unspecified order. If more than one
  siteSettings document exists, the site silently reads one of them and Studio
  may well be showing the other - and every symptom is exactly this: a field
  that is filled in, published, and invisible to the site.

  So this prints every siteSettings document there is, with the values that
  matter, and says which one `[0]` picks.

  DRAFTS NEED THE TOKEN. Sanity's API hides `drafts.*` documents from
  unauthenticated reads, so without SANITY_API_TOKEN this can only see
  published content - and "an unpublished draft" is one of the two theories it
  exists to test. It says which mode it ran in rather than quietly answering
  half the question.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-site-settings.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

const q = (s) => encodeURIComponent(s)
const groq = async (query) => {
  const res = await fetch(
    // api, not apicdn: the cached endpoint is the one thing that must not be
    // between this and the truth.
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${q(query)}`,
    TOKEN ? {headers: {Authorization: `Bearer ${TOKEN}`}} : undefined,
  )
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

const all = await groq(`*[_type == "siteSettings"]{
  _id, _updatedAt, siteTitle, metaPixelId, legalName,
  "hasLogo": defined(logo.asset),
  "hasFavicon": defined(favicon.asset),
  "hasSocialImage": defined(socialImage.asset),
  "featuredCount": count(featuredWork)
} | order(_id asc)`)

/*
  What the SITE sees, which is not what this script sees.

  The site reads without a token, and an unauthenticated read cannot see drafts
  at all. This script reads WITH one, so plain `*[_type == "siteSettings"][0]`
  here can resolve to a draft the site will never load - and the first version
  of this file did exactly that, then printed "the pixel SHOULD be emitting"
  about a draft. It answered its own question wrong while looking straight at
  the evidence.

  The drafts filter is what an unauthenticated read gets, spelled out.
*/
const picked = await groq(
  `*[_type == "siteSettings" && !(_id in path("drafts.**"))][0]{_id, metaPixelId}`,
)

console.log(`# Site Settings documents\n`)
console.log(
  TOKEN
    ? `Authenticated, so drafts are visible.\n`
    : `NO TOKEN - drafts are invisible to this run. If nothing below explains\nthe symptom, an unpublished draft is still on the table.\n`,
)
console.log(`${all.length} document(s) of type siteSettings.\n`)

if (all.filter((d) => !d._id.startsWith('drafts.')).length > 1) {
  console.log(`*** MORE THAN ONE PUBLISHED. The site reads`)
  console.log(`*** *[_type == "siteSettings"][0], which picks ONE of these and`)
  console.log(`*** ignores the rest. A field edited on the wrong one is filled`)
  console.log(`*** in, published, and invisible.\n`)
}

for (const d of all) {
  const draft = d._id.startsWith('drafts.')
  console.log(`  ${d._id}${draft ? '   [DRAFT - the site never reads drafts]' : ''}`)
  console.log(`      updated       ${d._updatedAt}`)
  console.log(`      siteTitle     ${JSON.stringify(d.siteTitle ?? null)}`)
  console.log(`      metaPixelId   ${JSON.stringify(d.metaPixelId ?? null)}`)
  console.log(`      legalName     ${JSON.stringify(d.legalName ?? null)}`)
  console.log(
    `      logo ${d.hasLogo ? 'yes' : 'NO '}  favicon ${d.hasFavicon ? 'yes' : 'NO '}  ` +
      `socialImage ${d.hasSocialImage ? 'yes' : 'NO '}  featuredWork ${d.featuredCount ?? 0}`,
  )
  console.log()
}

console.log(`## The one the site actually uses (published only, as the site reads it)\n`)
console.log(`  ${picked?._id ?? '(none)'}`)
console.log(`  metaPixelId: ${JSON.stringify(picked?.metaPixelId ?? null)}`)
console.log()

const draftPixel = all.find((d) => d._id.startsWith('drafts.'))?.metaPixelId ?? null

/*
  Present is not the same as usable.

  MetaPixel.astro emits nothing unless the value matches /^\d{8,20}$/ - a
  pasted URL, a stray quote or a trailing space all turn the pixel off. So a
  report that stops at "the field has something in it" can still be describing
  a site with no tracking on it, which is the same gap that had us both reading
  build logs for an hour.
*/
const VALID = /^\d{8,20}$/
const live = picked?.metaPixelId

if (live && !VALID.test(String(live).trim())) {
  console.log(`  PRESENT BUT UNUSABLE. The site requires plain digits and this is`)
  console.log(`  ${JSON.stringify(live)}, so MetaPixel.astro will emit nothing.`)
} else if (live) {
  console.log(`  Valid, and published. Every production build from here carries the`)
  console.log(`  pixel. It is still absent from the live site until the next Deploy`)
  console.log(`  to production runs - publishing content does not rebuild the site.`)
} else if (draftPixel) {
  console.log(`  Empty HERE, but set to ${JSON.stringify(draftPixel)} on the draft.`)
  console.log(`  That is the whole answer: the ID is typed and saved, and saving in`)
  console.log(`  Sanity writes a DRAFT. The site only ever reads published content,`)
  console.log(`  so an unpublished field looks exactly like a field nobody filled in.`)
  console.log(`  Publish Site Settings and the next build picks it up.`)
} else {
  console.log(`  Empty, and no draft has it either, which is why the build says the`)
  console.log(`  pixel is off.`)
}
