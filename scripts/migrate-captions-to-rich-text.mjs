/*
  Convert every caption in the Page Builder from a plain string to rich text.

  WHY

  Chris wants to link a photographer's website from the caption under a
  picture. A string cannot hold a link, so the captions that already exist
  have to become blocks. This is the same move scripts/migrate-summary-to-
  rich-text.mjs made for the project summary, and it inherits that script's
  rules: dry run by default, idempotent, drafts included, one transaction.

  WHAT IS DIFFERENT FROM THE SUMMARY

  A summary is one field on one document type. A caption lives inside the
  Page Builder: sections[] on a case study or a page, and inside a Media
  Row it sits one level deeper, items[]. So this walks every document and
  patches by _key path rather than by field name, e.g.

    sections[_key=="a1"].items[_key=="b2"].caption

  Enumerating where a caption "should" be is the mistake check-video-cors
  made three times in a row (it listed paths, and missed the one that
  mattered), so nothing here lists paths. It finds every string `caption`
  anywhere, and then SAYS which ones it is not converting. A caption on a
  type this script does not know about is reported rather than ignored,
  because a dry run that is silent about what it skipped is a dry run that
  cannot be trusted.

  HOW IT IS MADE SAFE

  DRY RUN BY DEFAULT. Nothing is written unless APPLY=1.

  IDEMPOTENT. A caption that is already an array is skipped.

  DRAFTS TOO. A document with unpublished changes holds its captions in the
  draft as well; converting only the published copy would leave the Studio
  showing an invalid value for the draft the moment the schema changes.

  ONE TRANSACTION. Either every caption is rich text or none is.

  VERIFIED AFTER. Once written, it queries again and fails loudly if any
  string caption of a converted type remains.

  ORDER (not enforceable from here)

  1. The SITE must already render both shapes. It does: lib/caption.ts.
     That must be LIVE in production first - this changes what the live
     dataset returns, and the previous site would print an array of blocks
     as "[object Object]" under every converted picture.
  2. Run this.
  3. Only then change the schema, because the moment a string sits in an
     array-typed field Studio marks it invalid.

  Usage:
    node scripts/migrate-captions-to-rich-text.mjs --selftest
    SANITY_API_TOKEN=... node scripts/migrate-captions-to-rich-text.mjs
    SANITY_API_TOKEN=... APPLY=1 node scripts/migrate-captions-to-rich-text.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

/*
  The three block types whose caption field becomes rich text. Everything
  else with a `caption` is reported, not touched.
*/
const CONVERT = new Set(['mediaImage', 'mediaVideo', 'videoSection'])

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
      children: [{_type: 'span', _key: key(), text: para.replace(/\s*\n\s*/g, ' '), marks: []}],
    }))

/*
  Walk a document and say what to do about every string caption in it.

  Returns {ops, other, unaddressable}:
    ops            {path, from, op: 'set'|'unset', value?} - to convert
    other          {path, type} - a string caption on a type not converted
    unaddressable  {path} - a caption on a member with no _key, which a
                   patch cannot point at

  A path is built the way Sanity's patch API reads one: dotted properties,
  array members by [_key=="..."].
*/
export function findCaptions(doc) {
  const ops = []
  const other = []
  const unaddressable = []

  const join = (base, prop) => (base ? `${base}.${prop}` : prop)

  const visit = (node, path, addressable) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === 'object' && typeof item._key === 'string') {
          visit(item, `${path}[_key==${JSON.stringify(item._key)}]`, addressable)
        } else {
          // No key: anything inside is unreachable by a patch.
          visit(item, `${path}[?]`, false)
        }
      }
      return
    }
    if (!node || typeof node !== 'object') return

    if (typeof node.caption === 'string') {
      const where = join(path, 'caption')
      if (!addressable) {
        unaddressable.push({path: where})
      } else if (CONVERT.has(node._type)) {
        if (node.caption.trim()) {
          ops.push({path: where, op: 'set', from: node.caption, value: toBlocks(node.caption)})
        } else {
          // An empty string in an array-typed field is invalid; the right
          // value for "no caption" is no value.
          ops.push({path: where, op: 'unset', from: node.caption})
        }
      } else {
        other.push({path: where, type: node._type ?? '(no _type)'})
      }
    }
    for (const [prop, child] of Object.entries(node)) {
      if (prop === 'caption' || prop.startsWith('_')) continue
      if (child && typeof child === 'object') visit(child, join(path, prop), addressable)
    }
  }

  visit(doc, '', true)
  return {ops, other, unaddressable}
}

/* ------------------------------------------------------------------ */

function selftest() {
  let failures = 0
  const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) failures++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
  }

  const doc = {
    _id: 'x',
    sections: [
      {_type: 'mediaRowSection', _key: 'row1', items: [
        {_type: 'mediaImage', _key: 'i1', caption: 'Photo: Jane Doe'},
        {_type: 'mediaVideo', _key: 'i2', caption: '   '},
        {_type: 'mediaImage', _key: 'i3', caption: [{_type: 'block'}]}, // already rich
        {_type: 'mediaImage', _key: 'i4'}, // no caption at all
      ]},
      {_type: 'videoSection', _key: 'v1', caption: 'Line one\n\nLine two'},
      {_type: 'someFutureBlock', _key: 'f1', caption: 'not ours'},
    ],
  }
  const r = findCaptions(doc)
  eq('finds a Media Row item caption, by key path', r.ops[0].path, 'sections[_key=="row1"].items[_key=="i1"].caption')
  eq('finds the standalone video caption', r.ops.find((o) => o.op === 'set' && o.path.includes('v1')).path, 'sections[_key=="v1"].caption')
  eq('a blank caption is unset, not converted', r.ops.find((o) => o.path.includes('i2')).op, 'unset')
  eq('an already-converted caption is left alone', r.ops.some((o) => o.path.includes('i3')), false)
  eq('an item with no caption is left alone', r.ops.some((o) => o.path.includes('i4')), false)
  eq('two operations plus the unset', r.ops.length, 3)
  eq('a blank line becomes a second block', r.ops.find((o) => o.path.includes('v1')).value.length, 2)
  eq('text survives intact', r.ops[0].value[0].children[0].text, 'Photo: Jane Doe')
  eq('a caption on an unknown type is REPORTED, not converted', r.other, [
    {path: 'sections[_key=="f1"].caption', type: 'someFutureBlock'},
  ])

  const keyless = findCaptions({_id: 'y', sections: [{_type: 'mediaRowSection', items: [{_type: 'mediaImage', caption: 'x'}]}]})
  eq('a caption under a keyless member is flagged unaddressable', keyless.unaddressable.length, 1)
  eq('and is not offered as an operation', keyless.ops.length, 0)

  // A key with a character that would break a naive string template.
  const odd = findCaptions({_id: 'z', sections: [{_type: 'videoSection', _key: 'a"b', caption: 'q'}]})
  eq('a quote in a _key is escaped in the path', odd.ops[0].path, 'sections[_key=="a\\"b"].caption')

  console.log('')
  if (failures) {
    console.log(`${failures} self-test(s) failed.`)
    process.exit(1)
  }
  console.log('Self-tests pass.')
}

/* ------------------------------------------------------------------ */

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

// The walker is only trusted if it can still find what it should.
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

// Every document, drafts included, system documents excluded.
const docs = await groq(`*[!(_type match "system.*") && !(_type match "sanity.*")]`)
console.log(`${docs.length} document(s) scanned (published and drafts)\n`)

const patches = []
const otherByType = new Map()
let skippedRich = 0
let unaddressable = 0

for (const doc of docs) {
  const {ops, other, unaddressable: bad} = findCaptions(doc)
  for (const o of other) otherByType.set(o.type, (otherByType.get(o.type) ?? 0) + 1)
  for (const b of bad) {
    unaddressable++
    console.log(`CANNOT ADDRESS  ${doc._id}  ${b.path}  (a member with no _key)`)
  }
  if (!ops.length) continue

  const label = `${doc._id}${doc.slug?.current ? `  (${doc.slug.current})` : ''}`
  console.log(`\nCONVERT  ${label}`)
  const set = {}
  const unset = []
  for (const o of ops) {
    if (o.op === 'set') {
      set[o.path] = o.value
      console.log(`  ${o.path}`)
      console.log(`    "${o.from.slice(0, 100)}${o.from.length > 100 ? '…' : ''}"  ->  ${o.value.length} block(s)`)
    } else {
      unset.push(o.path)
      console.log(`  ${o.path}\n    (blank)  ->  removed`)
    }
  }
  const patch = {id: doc._id}
  if (Object.keys(set).length) patch.set = set
  if (unset.length) patch.unset = unset
  patches.push({patch})
}

const total = patches.reduce((n, p) => n + Object.keys(p.patch.set ?? {}).length + (p.patch.unset?.length ?? 0), 0)
console.log(`\n${total} caption(s) across ${patches.length} document(s) to convert.`)

if (otherByType.size) {
  console.log('\nString captions on types this script does NOT convert (left as they are):')
  for (const [type, n] of otherByType) console.log(`  ${type}: ${n}`)
  console.log('If any of these should carry a link, they need adding to CONVERT and to the schema.')
} else {
  console.log('No string captions exist on any other type, so nothing is being skipped.')
}
if (unaddressable) console.log(`\n${unaddressable} caption(s) could not be addressed. See CANNOT ADDRESS above.`)

if (!patches.length) {
  console.log('\nNothing to do.')
  process.exit(unaddressable ? 1 : 0)
}

if (!APPLY) {
  console.log('\nDRY RUN - nothing was written. Set APPLY=1 to write these.')
  process.exit(0)
}

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
console.log(`\nWritten. ${patches.length} document(s).`)

// Trust the write only after reading it back.
let left = 0
for (const doc of await groq(`*[!(_type match "system.*") && !(_type match "sanity.*")]`)) {
  const {ops} = findCaptions(doc)
  left += ops.length
}
if (left) {
  console.error(`\nVERIFY FAILED: ${left} string caption(s) of a converted type remain.`)
  process.exit(1)
}
console.log('Verified: no string captions of a converted type remain.')
