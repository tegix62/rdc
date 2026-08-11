/*
  Get back the client logo links.

  Chris could not publish Site Settings tonight: Studio reported validation
  errors, and a single failing field disables Publish for the entire document.
  The failing fields were the client logo links, holding values like
  "/work/dumpstat". He emptied them, publishing worked, and the links are gone.

  The values were correct and the rule was wrong. clientLogos[].href was typed
  `url`, and Sanity's url type rejects anything without a scheme, so an internal
  path could never validate - even though pointing a client's logo at that
  client's case study is the better link. The schema now allows relative paths
  (siteSettings.ts), so these values can go back.

  Sanity keeps document history, so they are recoverable rather than lost. This
  reads siteSettings as it was before the publish, pairs each logo with what its
  link used to be, and restores them.

  DRY BY DEFAULT. Prints what it would write and changes nothing unless
  RESTORE=yes.

  Usage:
    SANITY_API_TOKEN=... node scripts/recover-client-logo-links.mjs
    SANITY_API_TOKEN=... RESTORE=yes node scripts/recover-client-logo-links.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const API = `https://${PROJECT_ID}.api.sanity.io`
const TOKEN = process.env.SANITY_API_TOKEN
const LIVE = process.env.RESTORE === 'yes'

// Before tonight's publish, after which the hrefs were gone. The published
// document had not otherwise changed since 6 August, so anything in this
// window is the pre-deletion state.
const BEFORE = process.env.AT ?? '2026-08-11T23:30:00Z'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}
const auth = {Authorization: `Bearer ${TOKEN}`}

const groq = async (query) => {
  const res = await fetch(`${API}/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
    headers: auth,
  })
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

const historical = async (id, time) => {
  const res = await fetch(
    `${API}/v2022-03-07/data/history/${DATASET}/documents/${id}?time=${encodeURIComponent(time)}`,
    {headers: auth},
  )
  if (!res.ok) throw new Error(`History failed: ${res.status} ${await res.text()}`)
  return (await res.json()).documents?.[0] ?? null
}

console.log(LIVE ? '# Restoring client logo links\n' : '# DRY RUN - nothing will be changed\n')

const [now, then] = await Promise.all([
  groq(`*[_id == "siteSettings"][0]{clientLogos}`),
  historical('siteSettings', BEFORE),
])

if (!then) {
  console.log(`No history for siteSettings at ${BEFORE}.`)
  console.log('History retention is limited by plan, so this may simply have aged out.')
  process.exit(1)
}

const oldLogos = then.clientLogos ?? []
const newLogos = now?.clientLogos ?? []

console.log(`As of ${BEFORE}: ${oldLogos.length} logo(s)`)
console.log(`Now:              ${newLogos.length} logo(s)\n`)

/*
  Matched on _key, not on position. Sanity gives every array entry a stable
  _key, and reordering the strip would make an index-based match quietly write
  one client's link onto another client's logo.
*/
const oldByKey = new Map(oldLogos.map((l) => [l._key, l]))
const restore = []

for (const logo of newLogos) {
  const was = oldByKey.get(logo._key)
  const lost = was?.href && !logo.href
  console.log(`  ${logo.alt ?? '(no client name)'}   [${logo._key}]`)
  console.log(`      href was  ${JSON.stringify(was?.href ?? null)}`)
  console.log(`      href now  ${JSON.stringify(logo.href ?? null)}`)
  if (lost) {
    console.log(`      -> would restore`)
    restore.push([logo._key, was.href])
  }
  console.log()
}

const orphans = oldLogos.filter((l) => !newLogos.some((n) => n._key === l._key))
if (orphans.length) {
  console.log(`${orphans.length} logo(s) present before and absent now - not restored, since`)
  console.log(`this only puts links back on logos that still exist:\n`)
  for (const o of orphans) console.log(`  ${o.alt ?? '(no name)'}  ${JSON.stringify(o.href ?? null)}`)
  console.log()
}

if (!restore.length) {
  console.log('Nothing to restore.')
  process.exit(0)
}

console.log(`${restore.length} link(s) to restore.\n`)

if (!LIVE) {
  console.log('DRY RUN. Nothing was changed. Re-run with RESTORE=yes to apply.')
  process.exit(0)
}

/*
  One patch, keyed per entry, writing only href. Nothing else in the document
  is touched - not the logos, not the pixel ID Chris just published.

  This writes to the published document directly. That is deliberate: creating
  a draft would leave the site still showing dead logos until someone publishes,
  and the whole problem started with a document that could not be published.
*/
const set = Object.fromEntries(restore.map(([key, href]) => [`clientLogos[_key=="${key}"].href`, href]))

const res = await fetch(`${API}/v2024-01-01/data/mutate/${DATASET}`, {
  method: 'POST',
  headers: {...auth, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations: [{patch: {id: 'siteSettings', set}}]}),
})
if (!res.ok) throw new Error(`Patch failed: ${res.status} ${await res.text()}`)

// Read back. A 200 is the API accepting the request, not the values being there.
const after = await groq(`*[_id == "siteSettings"][0].clientLogos[]{_key, alt, href}`)
console.log('Restored. Reading it back:\n')
let missing = 0
for (const [key, href] of restore) {
  const got = (after ?? []).find((l) => l._key === key)
  const ok = got?.href === href
  if (!ok) missing++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${got?.alt ?? key}  ${JSON.stringify(got?.href ?? null)}`)
}
console.log()
if (missing) {
  console.error(`${missing} link(s) did not take. Check Studio.`)
  process.exit(1)
}
console.log('All links are back on the published document.')
console.log('They appear on the site at the next production deploy.')
