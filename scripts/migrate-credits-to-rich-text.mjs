/*
  Fold a case study's credits into one rich text field.

  WHY

  Chris: "I really just need a rich text on the right side that I can
  hyperlink myself rather than the many different options in Sanity." The
  panel beside the title was three inputs - a list of collaborator objects
  (name, role, link), a Principal Type string and a Principal Type URL - and
  is now one field, `creditsText`. This writes each document's existing
  credits into it, line for line as the page shows them today:

    **Producer** - Henry Heissenbuttel
    **Audio Engineer** - [Adam Cichocki](url)
    (empty line: the gap the page drew between the two groups)
    **Principal Type** - [Forevs by OhNo Type Co](url)

  and then removes the three old fields from that document.

  WHY REMOVE THEM, rather than leave them hidden as a fallback: the page
  answers from creditsText when it has words and from the old fields
  otherwise (see src/lib/credits.ts). Leave the old fields in place and the
  day Chris clears the new one to start again, last year's collaborators
  reappear on the page from a field he can no longer see. Removing them in
  the same transaction that fills the new one means the two can never both
  be the truth.

  SAFE THE SAME WAYS AS THE OTHER MIGRATIONS

  Dry run unless APPLY=1, and the dry run prints each document's panel as
  text, before and after, so it can be compared with the page. Idempotent:
  a document that already has creditsText is never rewritten. Drafts too.
  One transaction. Read back after.

  ORDER: the site that renders creditsText must be LIVE before this runs,
  because it removes the fields the previous site reads. Then the schema.

  Usage:
    node scripts/migrate-credits-to-rich-text.mjs --selftest
    SANITY_API_TOKEN=... node scripts/migrate-credits-to-rich-text.mjs
    SANITY_API_TOKEN=... APPLY=1 node scripts/migrate-credits-to-rich-text.mjs
*/
import {pathToFileURL} from 'node:url'

const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const LEGACY = ['credits', 'principalType', 'principalTypeUrl']

let n = 0
const key = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/*
  One line: **role** - name, the name linked when there is a URL. The
  separator is the one the page printed (' - '), so the panel reads exactly
  as it did; Chris can retype any of it.
*/
function line(role, name, url) {
  const children = []
  const markDefs = []
  if (role) children.push({_type: 'span', _key: key(), text: role, marks: ['strong']})
  if (role && name) children.push({_type: 'span', _key: key(), text: ' - ', marks: []})
  if (name) {
    if (url) {
      const k = key()
      markDefs.push({_type: 'link', _key: k, href: url})
      children.push({_type: 'span', _key: key(), text: name, marks: [k]})
    } else {
      children.push({_type: 'span', _key: key(), text: name, marks: []})
    }
  }
  return {_type: 'block', _key: key(), style: 'normal', markDefs, children}
}

const gap = () => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  markDefs: [],
  children: [{_type: 'span', _key: key(), text: '', marks: []}],
})

export function toCreditsBlocks(doc) {
  const lines = (Array.isArray(doc.credits) ? doc.credits : [])
    // The page printed a credit with a role or a name; one with neither printed an empty <p>.
    .filter((c) => str(c?.role) || str(c?.name))
    .map((c) => line(str(c.role), str(c.name), str(c.url)))
  const type = str(doc.principalType)
  if (type) {
    if (lines.length) lines.push(gap())
    lines.push(line('Principal Type', type, str(doc.principalTypeUrl)))
  }
  return lines
}

// The panel as plain text, for a dry run a person can read.
const asText = (blocks) =>
  blocks
    .map((b) => {
      const links = new Map((b.markDefs ?? []).map((d) => [d._key, d.href]))
      return b.children
        .map((s) => {
          const href = s.marks.map((m) => links.get(m)).find(Boolean)
          const t = s.marks.includes('strong') ? `**${s.text}**` : s.text
          return href ? `[${t}](${href})` : t
        })
        .join('')
    })
    .map((t) => `      ${t || '(gap)'}`)
    .join('\n')

/* ------------------------------------------------------------------ */

function selftest() {
  let failures = 0
  const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) failures++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
  }
  const twoPointOh = {
    credits: [
      {name: 'Henry Heissenbuttel', role: 'Producer'},
      {name: 'Adam Cichocki', role: 'Audio Engineer', url: 'https://adam.example'},
      {name: 'Frank Maddocks', role: 'Single Artwork', url: 'https://frank.example'},
    ],
    principalType: 'Forevs by OhNo Type Co',
    principalTypeUrl: 'https://ohno.example',
  }
  const blocks = toCreditsBlocks(twoPointOh)
  eq('three credits, a gap and the typeface line', blocks.length, 5)
  eq('reads as the page does', asText(blocks).split('\n').map((s) => s.trim()), [
    '**Producer** - Henry Heissenbuttel',
    '**Audio Engineer** - [Adam Cichocki](https://adam.example)',
    '**Single Artwork** - [Frank Maddocks](https://frank.example)',
    '(gap)',
    '**Principal Type** - [Forevs by OhNo Type Co](https://ohno.example)',
  ])
  eq('every block and span has a key', blocks.every((b) => b._key && b.children.every((s) => s._key)), true)
  eq('keys are unique', new Set(blocks.flatMap((b) => [b._key, ...b.children.map((s) => s._key)])).size, blocks.reduce((n, b) => n + 1 + b.children.length, 0))
  eq('no gap when there is only a typeface', toCreditsBlocks({principalType: 'Caslon'}).length, 1)
  eq('no gap when there is no typeface', toCreditsBlocks({credits: [{name: 'A', role: 'B'}]}).length, 1)
  eq('a credit with neither role nor name is dropped', toCreditsBlocks({credits: [{url: 'https://x.example'}]}).length, 0)
  eq('a name with no role is still a line', asText(toCreditsBlocks({credits: [{name: 'Sam'}]})).trim(), 'Sam')
  eq('nothing at all gives nothing', toCreditsBlocks({}).length, 0)
  console.log('')
  if (failures) {
    console.log(`${failures} self-test(s) failed.`)
    process.exit(1)
  }
  console.log('Self-tests pass.')
}

/*
  Only when run, not when imported: scripts/test-credits.mjs imports
  toCreditsBlocks to prove that what this writes is what the site parses
  back, and an import must not go looking for a token.
*/
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.argv.includes('--selftest')) {
    selftest()
    process.exit(0)
  }

  const TOKEN = process.env.SANITY_API_TOKEN
  const APPLY = process.env.APPLY === '1'
  if (!TOKEN) {
    console.error('SANITY_API_TOKEN is required.')
    process.exit(1)
  }
  selftest()
  console.log('')

  const api = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01`
  const groq = async (query) => {
    const res = await fetch(`${api}/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
      headers: {Authorization: `Bearer ${TOKEN}`},
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
    return (await res.json()).result
  }

  // Every document carrying any of the old fields, any type, drafts included -
  // not just case studies, so a stray value elsewhere is reported, not missed.
  const QUERY = `*[defined(credits) || defined(principalType) || defined(principalTypeUrl)]{
    _id, _type, "slug": slug.current, pageType, credits, principalType, principalTypeUrl, creditsText
  }`
  const docs = await groq(QUERY)
  console.log(`${docs.length} document(s) hold an old credits field (published and drafts)\n`)

  const mutations = []
  for (const doc of docs) {
    const label = `${doc._id}${doc.slug ? `  (${doc.slug})` : ''}${doc.pageType ? `  [${doc.pageType}]` : ''}`
    if (doc._type !== 'caseStudy') {
      console.log(`REPORT  ${label} - a ${doc._type}, not a case study; left alone`)
      continue
    }
    if (Array.isArray(doc.creditsText) && doc.creditsText.length) {
      console.log(`SKIP    ${label} - already has the rich field; old fields left for a person to look at`)
      continue
    }
    const blocks = toCreditsBlocks(doc)
    if (!blocks.length) {
      // Only empty shells: nothing to carry over, but still remove them.
      console.log(`CLEAR   ${label} - old fields hold nothing printable; removing them`)
      mutations.push({patch: {id: doc._id, unset: LEGACY}})
      continue
    }
    console.log(`CONVERT ${label}`)
    console.log(asText(blocks))
    mutations.push({patch: {id: doc._id, set: {creditsText: blocks}, unset: LEGACY}})
  }

  console.log(`\n${mutations.length} document(s) to change.`)
  if (!mutations.length) {
    console.log('Nothing to do.')
    process.exit(0)
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing was written. Set APPLY=1 to write these.')
    process.exit(0)
  }

  const res = await fetch(`${api}/data/mutate/${DATASET}?returnIds=true`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({mutations}),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`\nFAILED ${res.status} ${res.statusText}\n${body}`)
    process.exit(1)
  }
  console.log(`\nWritten. ${mutations.length} document(s).`)

  const left = (await groq(QUERY)).filter(
    (d) => d._type === 'caseStudy' && !(Array.isArray(d.creditsText) && d.creditsText.length),
  )
  if (left.length) {
    console.error(`VERIFY FAILED: ${left.length} case study(s) still hold old credits with no rich field.`)
    process.exit(1)
  }
  console.log('Verified: every case study with credits now has them in the one rich field.')
}
