/*
  Is the Studio Chris opens the Studio we last deployed?

  WHY THIS EXISTS

  deploy-studio ended with:

      code=$(curl -sSL -o /dev/null -w "%{http_code}" https://...sanity.studio)
      test "$code" = "200"

  which proves the address answers. It cannot tell a Studio built five
  minutes ago from one built in June, so the job reported green for
  "deployed" while only ever checking "reachable". The gap surfaced when a
  Slot shape option shipped, the deploy ran, the check passed, and the
  option was not in Chris's Studio - and nothing here could say whether
  the deploy had failed or his browser was holding an old copy.

  WHAT IT READS

    1. https://<studio>/static/create-manifest.json and the hashed schema
       it names. This is the Studio's OWN copy of the schema, uploaded
       with the rest of the build, so it says what this deployed Studio
       was built from. Carries a Last-Modified, which dates the deploy.

    2. The schema manifest `sanity deploy` writes into the DATASET - the
       "Deployed 1/1 schemas" line. Only a deploy writes it, so it says a
       deploy ran, which is a different claim from what is being served.

  Two modes:

    DIAGNOSTIC (no local build): looks for strings only the recent schema
    contains, each dated by the commit that added it, so a partial result
    reads as a timeline rather than a yes/no.

    VERIFICATION (run in the deploy job, where studio/dist still exists):
    compares the schema just built against the schema now being served. No
    strings to maintain, and it fails when they differ - which is the
    check the HTTP 200 was standing in for.

  WHAT IT DOES NOT DO ANY MORE: crawl the JavaScript. It did, matching
  only /static paths at first - found nothing, and reported a working
  deploy dead. Widened to follow any .js across origins, it read 93 chunks
  and 3.9MB and still found nothing, including three strings that have
  been in the schema for months. That control is what showed the walk was
  never reaching the schema, and the manifest above answers the same
  question without guessing which chunk holds it.

  READ-ONLY. Reports; changes nothing.

  Usage: [SANITY_API_TOKEN=...] node scripts/verify-studio-deploy.mjs
*/
import {readFile, readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'

const STUDIO = process.env.STUDIO_URL || 'https://rumeau-design-co.sanity.studio'
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const DIST = process.env.STUDIO_DIST || 'studio/dist/static'

/*
  Ordered oldest first, each naming the commit that put it in the schema.
  A string here has to be one no earlier build could contain, which is why
  they are option titles and field titles rather than field names: names
  get reused, the prose written beside them does not.
*/
const NEEDLES = [
  {text: 'Portrait-ish landscape (5:4)', since: '846a15e', what: 'the 5:4 slot shape'},
  {text: 'Label for the Page Builder list', since: '69c16b1', what: 'block labels'},
  {text: 'Panel behind the row', since: 'bd49ecc', what: 'the grey backdrop panel'},
  {text: 'Phone video (9:16)', since: '1fd6210', what: 'the 9:16 slot shape'},
]

/*
  CONTROLS: strings that have been in the schema for months. If these are
  missing, the file being read is not the schema and nothing above it
  means anything - the difference between "the deploy is stale" and "this
  script is looking in the wrong place", which two runs could not tell
  apart for want of exactly this.
*/
const CONTROLS = [
  {text: 'Slot shape', what: 'the Slot shape field title'},
  {text: 'Page Builder', what: 'the Page Builder field title'},
  {text: 'mediaRowSection', what: 'a section type name'},
]

const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12)

// --- 1. what the deployed Studio serves -------------------------------

const manifestUrl = new URL('/static/create-manifest.json', STUDIO).href
console.log(`Studio: ${STUDIO}`)

const fetchServed = async (quiet = false) => {
  const res = await fetch(`${manifestUrl}?t=${Date.now()}`)
  if (!res.ok) {
    console.error(`\n${manifestUrl}: ${res.status} ${res.statusText}`)
    console.error('Without this there is nothing to check against. Stopping.')
    process.exit(2)
  }
  const text = await res.text()
  if (!quiet) {
    const at = res.headers.get('last-modified') ?? '(not stated)'
    console.log(`create-manifest.json: ${text.length} bytes, last modified ${at}`)
  }
  for (const name of new Set([...text.matchAll(/"([A-Za-z0-9._-]+\.json)"/g)].map((m) => m[1]))) {
    if (!name.includes('create-schema')) continue
    const part = await fetch(new URL(`/static/${name}?t=${Date.now()}`, STUDIO).href)
    if (!part.ok) continue
    const body = await part.text()
    if (!quiet) console.log(`served schema: ${name}  ${body.length} bytes  sha ${digest(body)}`)
    return body
  }
  return null
}

let servedSchema = await fetchServed()

if (!servedSchema) {
  console.error('\ncreate-manifest.json named no schema file. Stopping.')
  process.exit(2)
}

console.log('\n--- in the schema the deployed Studio serves ---')
for (const n of NEEDLES) {
  console.log(`  ${servedSchema.includes(n.text) ? 'PRESENT' : 'ABSENT '}  ${n.what}  (added in ${n.since})`)
}
for (const c of CONTROLS) {
  console.log(`  ${servedSchema.includes(c.text) ? 'PRESENT' : 'ABSENT '}  ${c.what}  [control]`)
}
const blind = CONTROLS.every((c) => !servedSchema.includes(c.text))
const missing = NEEDLES.filter((n) => !servedSchema.includes(n.text))

// --- 2. the schema this checkout just built, if it is here ------------

let built = null
try {
  const names = (await readdir(DIST)).filter((f) => f.includes('create-schema') && f.endsWith('.json'))
  if (names.length) built = await readFile(path.join(DIST, names[0]), 'utf8')
  if (built) console.log(`\nlocal build: ${names[0]}  ${built.length} bytes  sha ${digest(built)}`)
} catch {
  // No dist folder. That is the ordinary case outside the deploy job.
}

// --- 3. a deploy ran at all -------------------------------------------

if (TOKEN) {
  // The whole document, not a projection: the needles are buried deep in
  // the serialised schema and there is nothing to project them out by.
  const query = '*[_id in path("_.schemas.**")]'
  try {
    const r = await fetch(
      `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
      {headers: {Authorization: `Bearer ${TOKEN}`}},
    )
    if (r.ok) {
      for (const doc of (await r.json()).result ?? []) {
        console.log(`\ndataset manifest ${doc._id} updated ${doc._updatedAt}`)
      }
    } else {
      console.log(`\n(dataset manifest query: ${r.status} ${r.statusText})`)
    }
  } catch (err) {
    console.log(`\n(dataset manifest query failed: ${err.message})`)
  }
}

// --- verdict ----------------------------------------------------------

console.log('\n--- verdict ---')
let bad = false
if (blind) {
  console.log('  The file read is not the schema - even the controls are missing.')
  console.log('  This says nothing either way; fix the reading before believing it.')
  bad = true
} else if (built) {
  /*
    A CDN does not finish serving the new file the instant the upload
    returns, and a check that fails on that would be a check the next
    person learns to re-run rather than read. Give it a minute, saying so,
    before calling a difference a difference.
  */
  let same = built === servedSchema
  for (let attempt = 1; !same && attempt <= 6; attempt += 1) {
    console.log(`  still serving the older schema, waiting 10s (${attempt}/6)`)
    await new Promise((r) => setTimeout(r, 10_000))
    servedSchema = (await fetchServed(true)) ?? servedSchema
    same = built === servedSchema
  }
  console.log(`  Built and served schemas are ${same ? 'IDENTICAL' : 'DIFFERENT'}.`)
  if (!same) {
    console.log('  The Studio is serving something other than what was just built.')
    console.log('  That is a deploy that did not land, whatever it reported.')
    bad = true
  }
} else if (!missing.length) {
  console.log('  The deployed Studio serves every recent schema change. A Studio')
  console.log('  missing one of them in the browser is a cached copy, not a failed')
  console.log('  deploy: an open tab keeps running the JavaScript it loaded earlier,')
  console.log('  and an ordinary reload can be served the same index.html again.')
} else {
  console.log(`  The served schema is missing: ${missing.map((m) => m.what).join(', ')}.`)
  console.log(`  It predates ${missing[0].since}, so the deploy is genuinely behind.`)
  bad = true
}

process.exit(bad ? 1 : 0)
