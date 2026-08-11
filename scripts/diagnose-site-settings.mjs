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

// Exactly what the site does.
const picked = await groq(`*[_type == "siteSettings"][0]{_id, metaPixelId}`)

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

console.log(`## The one the site actually uses\n`)
console.log(`  ${picked?._id ?? '(none)'}`)
console.log(`  metaPixelId: ${JSON.stringify(picked?.metaPixelId ?? null)}`)
console.log()
if (picked?.metaPixelId) {
  console.log(`  So the pixel SHOULD be emitting. If a build still says "off", the`)
  console.log(`  build ran before this value was saved - rebuild and check again.`)
} else {
  console.log(`  Empty, which is why the build says the pixel is off. If Studio shows`)
  console.log(`  a value, Studio is showing a DIFFERENT document from this one.`)
}
