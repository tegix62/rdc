/*
  Where do the site's Contact buttons actually point?

  WHY THIS EXISTS

  audit-a11y-seo.mjs found /contact has ZERO inbound links - nothing on the
  site links to it. That is only possible one way. Layout.astro, index.astro and
  404.astro all resolve the button target as:

      settings?.contactUrl || '/contact'

  so an empty field sends every button to /contact and gives it inbound links.
  Zero inbound links therefore means `contactUrl` is SET in Sanity, and the
  buttons are going wherever it points - almost certainly still the Tally form
  that the native /contact page was built to replace.

  That is the worst shape of bug available here: the form works end to end -
  Turnstile, D1, the notification email, all verified live - and no visitor can
  reach it. Nothing looks broken. The Contact button works. It just goes
  somewhere else.

  The override field is not a mistake and should stay: pointing Contact
  somewhere else needs to be a Studio edit rather than a code change. What was
  missing is anything that NOTICES when the override quietly disagrees with the
  form the site now ships.

  Reports by default. APPLY=yes clears the field, which is the one action that
  makes the native form reachable.

  WHY CLEARING IT IS FINISHING THE JOB RATHER THAN A UNILATERAL DECISION
  Chris asked for the native form specifically to replace Tally, cancelled his
  Webflow subscription, sent a real enquiry through the new form, and confirmed
  it worked. Leaving this field pointing at Tally means none of that reaches a
  visitor. The field itself stays in the schema - pointing Contact elsewhere
  should remain a Studio edit rather than a code change - it just has to be
  empty for the form the site now ships to be the one people use.

  Reversible: Sanity keeps document history, and re-typing the Tally URL into
  the field restores the old behaviour with no deploy.

  Usage:
    SANITY_API_TOKEN=... node scripts/check-contact-url.mjs            # report
    SANITY_API_TOKEN=... APPLY=yes node scripts/check-contact-url.mjs  # clear it
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const APPLY = process.env.APPLY === 'yes'

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only use).')
  process.exit(1)
}

const query = `*[_type == "siteSettings" && !(_id in path("drafts.**"))][0]{contactUrl}`
const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Query failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const contactUrl = (await res.json()).result?.contactUrl

console.log('\nSite Settings -> "Contact form link - every button on the site"\n')

if (!contactUrl || !String(contactUrl).trim()) {
  console.log('  EMPTY, so every Contact button resolves to /contact.')
  console.log('  The native form is what visitors reach. This is the intended state.\n')
  process.exit(0)
}

console.log(`  SET to: ${contactUrl}\n`)

const isTally = /tally\.so/i.test(String(contactUrl))
const isOwnContact = /^\/contact\/?$/.test(String(contactUrl).trim())

if (isOwnContact) {
  console.log('  Points at the native form anyway, so nothing is bypassed. The field')
  console.log('  could be cleared to rely on the fallback, but nothing is wrong.\n')
  process.exit(0)
}

console.log('  PROBLEM: every "Get in Touch" and "Contact" button on the site goes here,')
console.log('  NOT to the native /contact form.')
if (isTally) {
  console.log('\n  This is the Tally form the native one was built to replace. The native')
  console.log('  form is live and verified working - Turnstile, the D1 write, and the')
  console.log('  notification email were all confirmed with a real submission - but no')
  console.log('  visitor can reach it, because no button points at it.')
}
if (!APPLY) {
  console.log('\n  FIX: clear the field. Empty means every button falls back to /contact.')
  console.log('  Re-run with APPLY=yes to clear it, or do it in Studio -> Site Settings ->')
  console.log('  "Contact form link - every button on the site".\n')
  // Exit 1 so this reads as a finding rather than a note. It is a live defect:
  // the form Chris built is unreachable, and nothing about the site looks wrong.
  process.exit(1)
}

/*
  unset, not set-to-empty-string. `settings?.contactUrl || '/contact'` treats ''
  and undefined identically, so either would work today - but an empty string
  left in the document shows in Studio as a field someone touched and cleared,
  which invites the question "was that deliberate?". Unsetting removes it.
*/
const mutate = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${DATASET}`,
  {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      mutations: [{patch: {query: `*[_type == "siteSettings" && !(_id in path("drafts.**"))]`, unset: ['contactUrl']}}],
    }),
  },
)
if (!mutate.ok) {
  console.error(`\n  Clearing it FAILED: ${mutate.status}`)
  console.error(await mutate.text())
  process.exit(1)
}

console.log('  CLEARED. Every Contact button now resolves to /contact.')
console.log('  A production deploy is needed for this to reach the live site.')
console.log('  To undo: re-type the URL into that field in Studio. No deploy needed to')
console.log('  change it back, and Sanity keeps the history either way.\n')
