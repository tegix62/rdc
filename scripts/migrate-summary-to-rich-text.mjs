/*
  Convert every case study's `summary` from a plain string to rich text.

  WHY

  Chris asked for the summary to carry hyperlinks. That means portable
  text, and portable text means the five summaries already written have to
  become blocks. The field is the paragraph under the project title, so
  getting this wrong is visible on the five most important pages on the
  site.

  HOW IT IS MADE SAFE

  DRY RUN BY DEFAULT. Nothing is written unless APPLY=1 is set. The dry run
  prints, for each document, the string it found and the blocks it would
  write, so the conversion can be read before it happens rather than
  inspected afterwards.

  IDEMPOTENT. A summary that is already an array is skipped, so running
  this twice does nothing the second time - which matters because the
  honest response to a half-finished migration is to run it again.

  DRAFTS TOO. A document with unpublished changes holds its summary in the
  draft as well, and converting only the published copy would leave the
  Studio showing an invalid value for the draft the moment the schema
  changes.

  PARAGRAPHS SURVIVE. A blank line in the original becomes a new block
  rather than a literal "\n\n" inside one, because that is what it meant.

  Usage:
    SANITY_API_TOKEN=... node scripts/migrate-summary-to-rich-text.mjs
    SANITY_API_TOKEN=... APPLY=1 node scripts/migrate-summary-to-rich-text.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const APPLY = process.env.APPLY === '1'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}

const api = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01`

const groq = async (query) => {
  const res = await fetch(`${api}/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
    headers: {Authorization: `Bearer ${TOKEN}`},
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()).result
}

/*
  A key per block and per span, because Sanity requires them and generates
  them itself in the Studio. Written data has to bring its own: an array
  member with no _key is the "Missing keys" error, and the field becomes
  uneditable until someone fixes it by hand.
*/
const key = () => Math.random().toString(36).slice(2, 12)

const toBlocks = (text) =>
  String(text)
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => ({
      _type: 'block',
      _key: key(),
      style: 'normal',
      markDefs: [],
      // Single newlines inside a paragraph are soft wraps in a textarea, not
      // structure. They become spaces rather than separate blocks.
      children: [{_type: 'span', _key: key(), text: para.replace(/\s*\n\s*/g, ' '), marks: []}],
    }))

const docs = await groq(
  `*[_type == "caseStudy" && defined(summary)]{_id, "slug": slug.current, summary}`,
)

console.log(`${docs.length} document(s) with a summary (published and drafts)\n`)

const patches = []
for (const doc of docs) {
  const label = `${doc._id}${doc.slug ? `  (${doc.slug})` : ''}`
  if (Array.isArray(doc.summary)) {
    console.log(`SKIP  ${label} - already rich text`)
    continue
  }
  if (typeof doc.summary !== 'string' || !doc.summary.trim()) {
    console.log(`SKIP  ${label} - empty`)
    continue
  }
  const blocks = toBlocks(doc.summary)
  console.log(`\nCONVERT  ${label}`)
  console.log(`  from: ${JSON.stringify(doc.summary.slice(0, 120))}${doc.summary.length > 120 ? '…' : ''}`)
  console.log(`  to:   ${blocks.length} block(s)`)
  for (const b of blocks) console.log(`          "${b.children[0].text.slice(0, 90)}${b.children[0].text.length > 90 ? '…' : ''}"`)
  patches.push({patch: {id: doc._id, set: {summary: blocks}}})
}

console.log(`\n${patches.length} document(s) to convert.`)

if (!patches.length) {
  console.log('Nothing to do.')
  process.exit(0)
}

if (!APPLY) {
  console.log('\nDRY RUN - nothing was written. Set APPLY=1 to write these.')
  process.exit(0)
}

/*
  One transaction. Either every summary is rich text or none is - a partial
  conversion is the state the schema change cannot cope with, so it is the
  one state worth ruling out entirely.
*/
const res = await fetch(`${api}/data/mutate/${DATASET}?returnIds=true`, {
  method: 'POST',
  headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations: patches}),
})
const body = await res.text()
if (!res.ok) {
  console.error(`\nFAILED ${res.status} ${res.statusText}\n${body}`)
  process.exit(1)
}
console.log(`\nWritten. ${body}`)
