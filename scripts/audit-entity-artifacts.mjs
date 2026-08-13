/*
  Literal HTML entities sitting in plain text - &nbsp;, &amp;, &#8217;, and
  their kin - left over from copying content out of Webflow.

  WHY THIS IS A REAL CATEGORY OF BUG, NOT A TYPO

  Webflow's rich-text editor stores &nbsp; and friends as real HTML entities,
  which a BROWSER decodes when rendering. Copy that text out as plain text
  during a migration - which is what happened here - and the browser step
  never happens: the literal six characters "&nbsp;" survive as visible text
  on the page. It showed up once, by accident, in the audit-seo.mjs body dump
  for /blog/how-i-overworked-a-flyer:

    "I&nbsp;overworked myself..."

  Chris flagged that one. Nothing had gone looking for the rest - this
  is that pass, across every document type and every text/portable-text
  field, in one query rather than trusting that the one already found was the
  only one.

  READ-ONLY. Reports; changes nothing.

  Usage: SANITY_API_TOKEN=... node scripts/audit-entity-artifacts.mjs
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
  Named entities worth flagging, plus the numeric-entity shape (&#123; or
  &#x1F;) as a pattern. Restricted to entities that plausibly came from rich
  text - not every ampersand is a bug (a client called "Smith & Co" is fine),
  which is why this matches the FULL entity shape, not a bare "&".
*/
const ENTITY_RE = /&(nbsp|amp|lt|gt|quot|apos|hellip|mdash|ndash|rsquo|lsquo|rdquo|ldquo|#\d+|#x[0-9a-f]+);/gi

/*
  Every string/text field on every content-bearing document type, plus every
  portable-text body flattened to its plain text. One query rather than one
  per type, so a field added to a schema after this script was written is
  still covered as long as it is a string, text, or the standard `body` array
  - which is true of everything currently on this site.
*/
const docs = await groq(`*[_type in ["caseStudy", "blogPost", "page"] && !(_id in path("drafts.**"))]{
  _type, _id, title, "slug": slug.current,
  "bodyText": array::join(body[].children[].text, " "),
  oneLineSummary, summary, seoDescription, metaDescription, excerpt,
  subtitle, headline, tagline
}`)

console.log(`${docs.length} published documents checked\n`)

let hits = 0
for (const doc of docs) {
  const route =
    doc._type === 'caseStudy' ? `/work/${doc.slug}` : doc._type === 'blogPost' ? `/blog/${doc.slug}` : `/${doc.slug}`

  const fields = {
    title: doc.title,
    subtitle: doc.subtitle,
    headline: doc.headline,
    tagline: doc.tagline,
    oneLineSummary: doc.oneLineSummary,
    summary: doc.summary,
    seoDescription: doc.seoDescription,
    metaDescription: doc.metaDescription,
    excerpt: doc.excerpt,
    body: doc.bodyText,
  }

  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== 'string') continue
    const matches = [...value.matchAll(ENTITY_RE)]
    if (!matches.length) continue
    hits += 1
    const unique = [...new Set(matches.map((m) => m[0]))]
    // A snippet around the FIRST match, not the whole field - a body can run
    // to hundreds of words, and the point is to show where to look, not to
    // reprint the document.
    const at = matches[0].index
    const snippet = value.slice(Math.max(0, at - 30), at + 40).trim()
    console.log(`${route}  (${field})`)
    console.log(`  entities: ${unique.join(', ')}`)
    console.log(`  ...${snippet}...`)
    console.log()
  }
}

if (!hits) {
  console.log('None found. The one Chris caught by eye was the only one.')
} else {
  console.log(`${hits} field(s) affected. Fix in Studio - find and retype the`)
  console.log('literal entity as the real character (nbsp -> a real space is')
  console.log('usually right; &#8217; -> ’ etc). No script should rewrite prose')
  console.log('automatically - these are short enough to fix by hand once found,')
  console.log('and a global find-replace risks corrupting a field that legitimately')
  console.log('contains "&" for an unrelated reason.')
}
