/*
  Two text fixes across every published document, in one pass:

    1. LITERAL HTML ENTITIES  &nbsp; &amp; and friends, left over from copying
       content out of Webflow. Found by audit-entity-artifacts.mjs, which
       reports and deliberately changes nothing.
    2. EM DASHES              — becomes -, at Chris's request. His house style
       is a hyphen; the em dashes arrived from Webflow's editor and from me.

  WHY ONE SCRIPT
  Both are the same operation - substitute characters inside Portable Text
  spans and plain string fields - and doing them together means one review, one
  set of patches, and one round of Studio history rather than two.

  WHY THIS ONE IS ALLOWED TO WRITE, WHEN THE AUDIT IS NOT

  audit-entity-artifacts.mjs ends by saying no script should rewrite prose
  automatically, and it is right about the general case: a global find-replace
  over someone's writing can quietly change meaning. The difference here is
  that every substitution below is MECHANICAL and requested:

    - `&amp;` -> `&` and `&nbsp;` -> a space restore what the text was always
      meant to say. There is no editorial judgement in either.
    - `—` -> `-` is a style decision Chris made about his own site.

  Anything NOT on the explicit table below is reported and left alone, so an
  entity nobody has thought about cannot be silently guessed at.

  SAFETY

  - Dry run by default. Writes only with APPLY=yes, and says which mode it is
    in on every run.
  - Patches SPECIFIC paths (body[_key==..].children[_key==..].text) rather than
    rewriting whole documents, so a field this script does not understand
    cannot be clobbered by a stale copy.
  - Published documents only. Drafts are excluded: a draft is someone's
    unfinished work, and patching underneath an open editor is how you make a
    person distrust their own CMS.
  - Sanity keeps document history, so every change here is revertable in
    Studio.

  Usage:
    SANITY_API_TOKEN=... node scripts/fix-text-in-sanity.mjs            # dry run
    SANITY_API_TOKEN=... APPLY=yes node scripts/fix-text-in-sanity.mjs  # write
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const APPLY = process.env.APPLY === 'yes'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}

const api = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01`

const groq = async (query) => {
  const res = await fetch(`${api}/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
    headers: {Authorization: `Bearer ${TOKEN}`},
  })
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

/*
  The explicit substitution table.

  Entities first, longest-first so `&amp;` cannot be half-eaten by a rule for
  `&am`. `&nbsp;` becomes a normal space rather than U+00A0: a non-breaking
  space is invisible in Studio and would leave the same class of confusion
  behind in a different disguise.

  Deliberately NOT included: &#8217; and other numeric entities. Decoding those
  needs a table that is easy to get subtly wrong (curly vs straight quote), and
  none turned up in the audit - so they are reported rather than guessed at.
*/
const RULES = [
  ['&nbsp;', ' ', 'non-breaking space entity'],
  ['&amp;', '&', 'ampersand entity'],
  ['&lt;', '<', 'less-than entity'],
  ['&gt;', '>', 'greater-than entity'],
  ['&quot;', '"', 'quote entity'],
  ['—', '-', 'em dash'],
]

/*
  Anything matching this but not handled above gets reported, never changed.
  An entity nobody has considered is a question, not a find-replace.
*/
const UNHANDLED_RE = /&(apos|hellip|mdash|ndash|rsquo|lsquo|rdquo|ldquo|#\d+|#x[0-9a-f]+);/gi

// En dashes are NOT in RULES. Chris asked about em dashes specifically, and a
// numeric range ("2020–2024") is the one place an en dash is conventionally
// correct - so these are counted and reported for him to decide on rather than
// folded in silently.
const EN_DASH = '–'

const applyRules = (text) => {
  let out = text
  const applied = []
  for (const [from, to, label] of RULES) {
    if (!out.includes(from)) continue
    const count = out.split(from).length - 1
    out = out.split(from).join(to)
    applied.push(`${count}x ${label}`)
  }
  return {out, applied, changed: out !== text}
}

// Plain string fields worth checking, matching audit-entity-artifacts.mjs so
// the two scripts cannot disagree about what counts as content.
const STRING_FIELDS = [
  'title', 'subtitle', 'headline', 'tagline',
  'oneLineSummary', 'summary', 'seoDescription', 'metaDescription', 'excerpt',
]

const docs = await groq(`*[_type in ["caseStudy", "blogPost", "page"] && !(_id in path("drafts.**"))]{
  _type, _id, title, "slug": slug.current,
  ${STRING_FIELDS.join(', ')},
  body[]{_key, _type, children[]{_key, _type, text}}
}`)

console.log(`${APPLY ? 'APPLYING CHANGES' : 'DRY RUN - nothing will be written'}`)
console.log(`${docs.length} published documents\n`)

const patches = []
let fieldsChanged = 0
let enDashDocs = 0
const unhandled = []

for (const doc of docs) {
  const route =
    doc._type === 'caseStudy' ? `/work/${doc.slug}` : doc._type === 'blogPost' ? `/blog/${doc.slug}` : `/${doc.slug}`
  const set = {}
  const notes = []

  for (const field of STRING_FIELDS) {
    const value = doc[field]
    if (typeof value !== 'string') continue
    const {out, applied, changed} = applyRules(value)
    if (changed) {
      set[field] = out
      notes.push(`  ${field}: ${applied.join(', ')}`)
      fieldsChanged += 1
    }
  }

  /*
    Portable Text: patch each SPAN by key, not the whole body array. Rewriting
    body wholesale would mean sending back every block exactly as read, and any
    field of a block this query did not select (marks, listItem, style on a
    nested type) would be dropped on the floor.
  */
  for (const block of doc.body ?? []) {
    for (const child of block.children ?? []) {
      if (typeof child.text !== 'string') continue
      const {out, applied, changed} = applyRules(child.text)
      if (changed) {
        set[`body[_key=="${block._key}"].children[_key=="${child._key}"].text`] = out
        notes.push(`  body span: ${applied.join(', ')}`)
        fieldsChanged += 1
      }
    }
  }

  // Reported, not changed.
  const allText = [
    ...STRING_FIELDS.map((f) => doc[f]),
    ...(doc.body ?? []).flatMap((b) => (b.children ?? []).map((c) => c.text)),
  ]
    .filter((v) => typeof v === 'string')
    .join(' ')

  if (allText.includes(EN_DASH)) {
    enDashDocs += 1
    notes.push(`  (also ${allText.split(EN_DASH).length - 1}x EN dash – left alone - see the note at the end)`)
  }
  const leftover = [...allText.matchAll(UNHANDLED_RE)]
  if (leftover.length) {
    unhandled.push(`${route}: ${[...new Set(leftover.map((m) => m[0]))].join(', ')}`)
  }

  if (Object.keys(set).length) {
    console.log(`${route}`)
    console.log(notes.join('\n'))
    console.log()
    patches.push({patch: {id: doc._id, set}})
  } else if (notes.length) {
    console.log(`${route}`)
    console.log(notes.join('\n'))
    console.log()
  }
}

if (!patches.length) {
  console.log('Nothing to change.')
} else if (!APPLY) {
  console.log(`${fieldsChanged} field(s) across ${patches.length} document(s) WOULD change.`)
  console.log('Re-run with APPLY=yes to write them. Sanity keeps history, so this is revertable in Studio.')
} else {
  const res = await fetch(`${api}/data/mutate/${DATASET}`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({mutations: patches}),
  })
  if (!res.ok) {
    console.error(`\nWrite FAILED: ${res.status}`)
    console.error(await res.text())
    console.error('\nA 403 here means SANITY_API_TOKEN is read-only. It needs Editor')
    console.error('permissions to apply these, or the changes have to be made in Studio.')
    process.exit(1)
  }
  console.log(`Wrote ${fieldsChanged} field(s) across ${patches.length} document(s).`)
  console.log('A production deploy is needed for these to appear on the live site.')
}

if (enDashDocs) {
  console.log(`\n${enDashDocs} document(s) also contain EN dashes (–), left untouched.`)
  console.log('Not the same character as an em dash, and conventionally correct in a')
  console.log('numeric range. Say the word and they can join the same rule.')
}
if (unhandled.length) {
  console.log('\nEntities found that this script deliberately does NOT decode:')
  for (const line of unhandled) console.log(`  ${line}`)
  console.log('Decoding these needs judgement (curly vs straight quote), so they are')
  console.log('reported rather than guessed at. Fix in Studio, or say which mapping you want.')
}
