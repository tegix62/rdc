/*
  Which fields on a case study are actually used.

  WHY THIS EXISTS

  Chris walked through the Project page tab field by field and said, of
  several of them, some version of "I never touch this" or "I think this
  does nothing on the page". Both are testable, and guessing at either is
  how a form gets reorganised around the wrong things: a field he has not
  used yet may still be the only thing holding up three older pages.

  So before anything moves, this counts. For every case study it reports
  which fields carry a value, and it pays particular attention to the two
  questions his walkthrough raised that the schema cannot answer:

    - THE SHORT BLURB. It is a fallback in two chains - the page shows
      `summary ?? oneLineSummary`, and the meta description tries
      seoDescription, then the blurb, then the summary. So it is invisible
      wherever a summary exists and load-bearing wherever one does not.
      Counted both ways.

    - THE FOUR HERO VIDEO FIELDS. One is an embed URL, one is R2, two are
      Sanity uploads he says he will never use. Whether they can be folded
      away depends on whether anything is in them.

  READ-ONLY. Reports; changes nothing.

  Usage: SANITY_API_TOKEN=... node scripts/audit-case-study-fields.mjs
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
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()).result
}

/*
  The Project page tab, in the order the form shows it. Each entry is the
  field and what it does, so the count reads as an argument rather than as
  a table nobody can act on.
*/
const FIELDS = [
  ['accessPassword', 'Password Protection'],
  ['heroVideo', 'hero: YouTube/Vimeo link'],
  ['heroVideoSrc', 'hero: self-hosted (R2)'],
  ['heroVideoFile', 'hero: Sanity upload (MP4)'],
  ['heroVideoWebm', 'hero: Sanity upload (WebM)'],
  ['heroVideoPlayback', 'hero playback'],
  ['heroFit', 'hero image fit'],
  ['headline', 'Display Headline'],
  ['subtitle', 'Kicker'],
  ['oneLineSummary', 'Short blurb'],
  ['seoDescription', 'Search description'],
  ['summary', 'Full Summary'],
  ['resultStat', 'Result Stat'],
  ['client', 'Client Name'],
  ['clientLogo', "Client's Logo"],
  ['sections', 'Page Builder'],
]

const studies = await groq(
  `*[_type == "caseStudy" && pageType == "Case Study" && !(_id in path("drafts.**"))]{
    _id, title, "slug": slug.current,
    ${FIELDS.map(([f]) => f).join(', ')}
  } | order(title asc)`,
)

const filled = (v) => {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

console.log(`${studies.length} case studies (published)\n`)

console.log('--- how many use each field ---')
for (const [field, what] of FIELDS) {
  const users = studies.filter((s) => filled(s[field]))
  const bar = '#'.repeat(users.length).padEnd(studies.length, '.')
  console.log(
    `  ${bar}  ${String(users.length).padStart(2)}/${studies.length}  ${field.padEnd(18)} ${what}`,
  )
}

/*
  THE BLURB, both ways round. "Never appears on the page" and "is the only
  thing on the page" are the same field in different documents.
*/
console.log('\n--- the short blurb, which is a fallback in two chains ---')
const blurbOnPage = studies.filter((s) => filled(s.oneLineSummary) && !filled(s.summary))
const blurbHidden = studies.filter((s) => filled(s.oneLineSummary) && filled(s.summary))
const noIntro = studies.filter((s) => !filled(s.oneLineSummary) && !filled(s.summary))
console.log(`  ${blurbOnPage.length} page(s) show the blurb as their intro paragraph (no summary):`)
for (const s of blurbOnPage) console.log(`      ${s.slug}`)
console.log(`  ${blurbHidden.length} page(s) have both, so the blurb only feeds search:`)
for (const s of blurbHidden) console.log(`      ${s.slug}`)
console.log(`  ${noIntro.length} page(s) have neither.`)

console.log('\n--- the search description, which appears nowhere on the page ---')
const seo = studies.filter((s) => filled(s.seoDescription))
console.log(`  ${seo.length}/${studies.length} use it. Everything else falls back to blurb, then summary.`)

console.log('\n--- the four hero video fields ---')
for (const f of ['heroVideo', 'heroVideoSrc', 'heroVideoFile', 'heroVideoWebm']) {
  const users = studies.filter((s) => filled(s[f]))
  console.log(`  ${f.padEnd(14)} ${users.length}: ${users.map((s) => s.slug).join(', ') || '(none)'}`)
}

/*
  How long the summaries actually run, since Chris asked for a character
  target to aim at. A target invented from nothing is a target that fights
  what is already written.
*/
const lengths = studies
  .filter((s) => filled(s.summary))
  .map((s) => ({slug: s.slug, n: String(s.summary).trim().length}))
  .sort((a, b) => a.n - b.n)
if (lengths.length) {
  const median = lengths[Math.floor(lengths.length / 2)].n
  console.log('\n--- how long the summaries Chris has written actually are ---')
  for (const l of lengths) console.log(`  ${String(l.n).padStart(4)}  ${l.slug}`)
  console.log(`  median ${median}, shortest ${lengths[0].n}, longest ${lengths[lengths.length - 1].n}`)
}

console.log('\n--- per page ---')
for (const s of studies) {
  const has = FIELDS.filter(([f]) => filled(s[f])).map(([f]) => f)
  console.log(`  ${(s.slug ?? s._id).padEnd(28)} ${has.length}/${FIELDS.length}  ${has.join(' ')}`)
}
