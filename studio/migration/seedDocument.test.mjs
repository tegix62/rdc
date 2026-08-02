// Tests for the fill-in-the-blanks rules that protect Studio edits from
// being overwritten by a migration re-run.
//
// Run from the studio/ directory: node migration/seedDocument.test.mjs
// No Sanity credentials or network needed - the client is faked.

process.env.SANITY_API_TOKEN ||= 'test-token-not-used'

const {seedDocument, isEmpty} = await import('./migrate.mjs')

let failures = 0

function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`)
  }
}

// Minimal stand-in for the Sanity client: records what was written so the
// test can assert on it.
function fakeDb(existing) {
  const calls = {replaced: null, patched: null}
  return {
    calls,
    fetch: async () => existing,
    createOrReplace: async (doc) => {
      calls.replaced = doc
    },
    patch: (id) => ({
      set: (fields) => ({
        commit: async () => {
          calls.patched = {id, fields}
        },
      }),
    }),
  }
}

console.log('isEmpty')
check('undefined is empty', isEmpty(undefined), true)
check('null is empty', isEmpty(null), true)
check('empty string is empty', isEmpty(''), true)
check('empty array is empty', isEmpty([]), true)
check('false is NOT empty', isEmpty(false), false)
check('zero is NOT empty', isEmpty(0), false)
check('text is NOT empty', isEmpty('hello'), false)
check('populated array is NOT empty', isEmpty(['a']), false)

console.log('\nseedDocument: document does not exist yet')
{
  const db = fakeDb(null)
  const doc = {_id: 'siteSettings', _type: 'siteSettings', bioText: 'seed copy'}
  const result = await seedDocument(doc, {db, force: false})
  check('reports created', result, 'created')
  check('writes the whole document', db.calls.replaced, doc)
  check('does not patch', db.calls.patched, null)
}

console.log('\nseedDocument: Studio edit must survive a re-run')
{
  const db = fakeDb({
    _id: 'siteSettings',
    _type: 'siteSettings',
    bioText: 'Chris rewrote this himself',
  })
  const result = await seedDocument(
    {_id: 'siteSettings', _type: 'siteSettings', bioText: 'original seed copy'},
    {db, force: false},
  )
  check('reports kept', result, 'kept Studio version')
  check('does not overwrite', db.calls.replaced, null)
  check('does not patch', db.calls.patched, null)
}

console.log('\nseedDocument: genuinely empty fields still get filled')
{
  const db = fakeDb({
    _id: 'caseStudy-1',
    _type: 'caseStudy',
    title: 'Edited Title',
    sections: [],
    summary: '',
  })
  const result = await seedDocument(
    {
      _id: 'caseStudy-1',
      _type: 'caseStudy',
      title: 'Seed Title',
      sections: [{_type: 'fullImageSection'}],
      summary: 'Seed summary',
    },
    {db, force: false},
  )
  check('reports which fields were filled', result, 'filled empty fields: sections, summary')
  check('patches only the empty fields', db.calls.patched, {
    id: 'caseStudy-1',
    fields: {sections: [{_type: 'fullImageSection'}], summary: 'Seed summary'},
  })
  check('leaves the edited title alone', db.calls.patched.fields.title, undefined)
}

console.log('\nseedDocument: never writes _id or _type as fields')
{
  const db = fakeDb({_id: 'page-about', _type: 'page', title: 'Kept'})
  await seedDocument({_id: 'page-about', _type: 'page', title: 'Seed', heading: 'New'}, {db, force: false})
  check('patch omits _id', db.calls.patched.fields._id, undefined)
  check('patch omits _type', db.calls.patched.fields._type, undefined)
}

console.log('\nseedDocument: a false value counts as a real choice')
{
  const db = fakeDb({_id: 'caseStudy-2', _type: 'caseStudy', featured: false})
  const result = await seedDocument(
    {_id: 'caseStudy-2', _type: 'caseStudy', featured: true},
    {db, force: false},
  )
  check('does not flip a deliberate false back to true', result, 'kept Studio version')
}

console.log('\nseedDocument: MIGRATE_FORCE restores overwrite behavior')
{
  const db = fakeDb({_id: 'siteSettings', _type: 'siteSettings', bioText: 'Chris rewrote this'})
  const doc = {_id: 'siteSettings', _type: 'siteSettings', bioText: 'snapshot wins'}
  const result = await seedDocument(doc, {db, force: true})
  check('reports forced replace', result, 'replaced (forced)')
  check('overwrites the whole document', db.calls.replaced, doc)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
