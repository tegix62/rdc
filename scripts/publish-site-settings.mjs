/*
  Publish the Site Settings draft.

  WHY THIS EXISTS

  Chris typed the Meta Pixel ID into Studio and reported the Publish button
  greyed out. The diagnostic showed why the site could not see it: the value is
  on `drafts.siteSettings`, and the published `siteSettings` has not changed
  since 6 August. Saving in Sanity writes a draft; the site reads published
  content; so a filled-in field that was never published is indistinguishable
  from an empty one.

  Whatever is wrong with that button in his browser, the content operation
  itself is one API call, and it can be done from here.

  DRY BY DEFAULT

  The draft may carry edits beyond the pixel ID - anything Chris touched in
  Site Settings and left unpublished rides along, because publishing is
  all-or-nothing for a document. So this prints the exact field-by-field diff
  and changes nothing unless PUBLISH=yes.

  I am spelling that out because I have already got this wrong once on this
  project: I reported a migration's DRY RUN as a completed run, and 85
  documents kept a field I had said was gone. A dry run that looks like a real
  one is worse than no output.

  Usage:
    SANITY_API_TOKEN=... node scripts/publish-site-settings.mjs            # diff only
    SANITY_API_TOKEN=... PUBLISH=yes node scripts/publish-site-settings.mjs # do it
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const API = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01`
const TOKEN = process.env.SANITY_API_TOKEN
const LIVE = process.env.PUBLISH === 'yes'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required - drafts are invisible without it.')
  process.exit(1)
}

const auth = {Authorization: `Bearer ${TOKEN}`}

const groq = async (query) => {
  const res = await fetch(`${API}/data/query/${DATASET}?query=${encodeURIComponent(query)}`, {
    headers: auth,
  })
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

const [draft, published] = await Promise.all([
  groq(`*[_id == "drafts.siteSettings"][0]`),
  groq(`*[_id == "siteSettings"][0]`),
])

console.log(LIVE ? '# Publishing Site Settings\n' : '# DRY RUN - nothing will be changed\n')

if (!draft) {
  console.log('There is no draft of Site Settings. Nothing to publish.')
  process.exit(0)
}

// System fields differ on every save and say nothing about the content.
const SYSTEM = new Set(['_id', '_rev', '_type', '_createdAt', '_updatedAt'])
const keys = [...new Set([...Object.keys(draft), ...Object.keys(published ?? {})])]
  .filter((k) => !SYSTEM.has(k))
  .sort()

const short = (v) => {
  const s = JSON.stringify(v ?? null)
  return s.length > 140 ? `${s.slice(0, 137)}...` : s
}

const changed = keys.filter((k) => JSON.stringify(draft[k] ?? null) !== JSON.stringify(published?.[k] ?? null))

console.log(`Draft last saved   ${draft._updatedAt}`)
console.log(`Published last set ${published?._updatedAt ?? '(no published document)'}\n`)

if (!changed.length) {
  console.log('The draft and the published document are identical. Nothing would change.')
  process.exit(0)
}

console.log(`${changed.length} field(s) would change when this is published:\n`)
for (const k of changed) {
  console.log(`  ${k}`)
  console.log(`      published  ${short(published?.[k])}`)
  console.log(`      draft      ${short(draft[k])}`)
  console.log()
}

if (!LIVE) {
  console.log('DRY RUN. Nothing was changed. Re-run with PUBLISH=yes to apply the above.')
  process.exit(0)
}

/*
  The Actions API rather than a createOrReplace + delete pair: publishing is
  one atomic operation there, so there is no window where the draft is gone and
  the published document has not caught up.
*/
const res = await fetch(`${API}/data/actions/${DATASET}`, {
  method: 'POST',
  headers: {...auth, 'Content-Type': 'application/json'},
  body: JSON.stringify({
    actions: [
      {
        actionType: 'sanity.action.document.publish',
        draftId: 'drafts.siteSettings',
        publishedId: 'siteSettings',
      },
    ],
  }),
})
if (!res.ok) throw new Error(`Publish failed: ${res.status} ${await res.text()}`)

/*
  Read it back. "The API returned 200" is not the same claim as "the value is
  live", and the difference between those two is exactly the mistake that let
  me report a migration as done while 85 documents still carried the field.
*/
const after = await groq(`*[_id == "siteSettings"][0]{_updatedAt, metaPixelId}`)
const stillDraft = await groq(`count(*[_id == "drafts.siteSettings"])`)

console.log('Published. Reading it back:\n')
console.log(`  siteSettings._updatedAt  ${after?._updatedAt}`)
console.log(`  siteSettings.metaPixelId ${JSON.stringify(after?.metaPixelId ?? null)}`)
console.log(`  drafts.siteSettings      ${stillDraft ? 'STILL PRESENT' : 'gone, as expected'}`)
console.log()

if (stillDraft) {
  console.error('The draft survived the publish. Something is wrong - check Studio.')
  process.exit(1)
}
console.log('The next production build will read these values.')
