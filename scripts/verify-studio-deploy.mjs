/*
  Is the Studio that Chris opens actually the Studio we last deployed?

  WHY THIS EXISTS

  deploy-studio ends with:

      code=$(curl -sSL -o /dev/null -w "%{http_code}" https://...sanity.studio)
      test "$code" = "200"

  which proves the address answers. It cannot tell a bundle built five
  minutes ago from one built in June, so the job has been reporting green
  for "deployed" while only ever checking "reachable". That gap surfaced
  when a Slot shape option shipped, the deploy ran, the check passed, and
  the option was not in the Studio - and nothing in the repo could say
  whether the fault was the deploy or a cached tab in the browser.

  WHAT IT DOES

  Looks for strings that only exist in the new schema, in the two places
  they would have to appear if the deploy worked:

    1. The JavaScript the Studio actually serves. Crawls the chunk graph
       from index.html - the schema is buried several imports deep, so a
       single fetch of the entry chunk finds nothing and proves nothing.

    2. The schema manifest `sanity deploy` writes into the dataset (the
       "Deployed 1/1 schemas" line in the deploy log). Needs a token;
       skipped without one, since the bundle is the answer that matters.

  Each needle is dated by the commit that introduced it, so a partial
  result reads as a timeline: if 5:4 is there and 9:16 is not, the deploy
  is stuck at a known commit. If none of them are there, the deploy never
  took. If all of them are there, the bundle is current and a browser is
  holding an old one.

  READ-ONLY. Reports; changes nothing.

  Usage: [SANITY_API_TOKEN=...] node scripts/verify-studio-deploy.mjs
*/
const STUDIO = process.env.STUDIO_URL || 'https://rumeau-design-co.sanity.studio'
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

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
  CONTROLS: strings that have been in the schema for months. If the crawl
  cannot find these either, it is not reaching the schema at all and the
  result above them means nothing - which is the difference between "the
  deploy is stale" and "this script is looking in the wrong place". The
  first two runs had no control and confidently reported the former.
*/
const CONTROLS = [
  {text: 'Slot shape', what: 'the Slot shape field title'},
  {text: 'Page Builder', what: 'the Page Builder field title'},
  {text: 'mediaRowSection', what: 'a section type name'},
]

const BUDGET_BYTES = 80 * 1024 * 1024
const MAX_FILES = 400

const get = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return await res.text()
}

/*
  Vite writes the chunk graph as ordinary string literals - `import"./x.js"`,
  `modulepreload href="/static/y.js"`, `import("./z.js")`. Reading them back
  out of the text is enough to walk it without a bundler.

  The first version of this matched only `/static/...`, found nothing, and
  reported the deploy dead - because an auto-updating Studio does not serve
  its code from its own origin at all: index.html points at sanity-cdn.com
  and the application is assembled from there. So the match has to be any
  quoted path ending in .js, resolved against whatever document named it,
  and the crawl has to be willing to leave the Studio's own host.
*/
const chunkRefs = (text, base) => {
  const out = new Set()
  for (const m of text.matchAll(/["'(]([^"'()\s<>]+\.js(?:\?[^"'()\s<>]*)?)["')]/g)) {
    try {
      const url = new URL(m[1], base)
      if (url.protocol === 'http:' || url.protocol === 'https:') out.add(url.href)
    } catch {
      // A .js inside a template literal or a regex is not a URL. Skip it.
    }
  }
  return [...out]
}

const found = new Map([...NEEDLES, ...CONTROLS].map((n) => [n.text, null]))
let bytes = 0
let files = 0

const index = await get(STUDIO)
const queue = [{url: new URL('/', STUDIO).href, text: index}]
const seen = new Set([new URL('/', STUDIO).href])

console.log(`Studio: ${STUDIO}`)
console.log(`index.html: ${index.length} bytes`)

while (queue.length && files < MAX_FILES && bytes < BUDGET_BYTES) {
  const {url, text} = queue.shift()
  for (const n of [...NEEDLES, ...CONTROLS]) {
    if (!found.get(n.text) && text.includes(n.text)) found.set(n.text, url)
  }
  for (const ref of chunkRefs(text, url)) {
    if (seen.has(ref)) continue
    seen.add(ref)
    let body
    try {
      body = await get(ref)
    } catch {
      continue // a hashed chunk that 404s is a dead reference, not a failure
    }
    files += 1
    bytes += body.length
    queue.push({url: ref, text: body})
    if (files >= MAX_FILES || bytes >= BUDGET_BYTES) break
  }
}

console.log(`crawled ${files} chunk(s), ${(bytes / 1024 / 1024).toFixed(1)} MB`)
console.log(`hosts: ${[...new Set([...seen].map((u) => new URL(u).host))].join(', ')}`)
/*
  A crawl that reaches nothing proves nothing, and silently reads as every
  needle being absent - which is exactly how the first run of this script
  declared a working deploy dead. Say so loudly instead.
*/
if (!files) {
  console.log('\n  NOTHING WAS CRAWLED. index.html named no JavaScript this could')
  console.log('  follow, so the bundle result below is meaningless. First 1200')
  console.log('  characters of index.html, to see what it actually names:\n')
  console.log(index.slice(0, 1200))
}
console.log('')
console.log('--- in the JavaScript the Studio serves ---')
for (const n of NEEDLES) {
  const hit = found.get(n.text)
  console.log(`  ${hit ? 'PRESENT' : 'ABSENT '}  ${n.what}  (added in ${n.since})`)
}
console.log('  --- controls, months old, must be present for any of the above to mean anything ---')
for (const c of CONTROLS) {
  const hit = found.get(c.text)
  console.log(`  ${hit ? 'PRESENT' : 'ABSENT '}  ${c.what}`)
}
const blind = CONTROLS.every((c) => !found.get(c.text))

let manifest = null
if (TOKEN) {
  // The whole document, not a projection: the needles are buried deep in
  // the serialised schema and there is nothing to project them out by.
  const query = '*[_id in path("_.schemas.**")]'
  try {
    const res = await fetch(
      `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
      {headers: {Authorization: `Bearer ${TOKEN}`}},
    )
    if (res.ok) {
      const result = (await res.json()).result ?? []
      manifest = JSON.stringify(result)
      for (const doc of result) console.log(`\nmanifest ${doc._id} updated ${doc._updatedAt}`)
    } else {
      console.log(`\n(schema manifest query: ${res.status} ${res.statusText})`)
    }
  } catch (err) {
    console.log(`\n(schema manifest query failed: ${err.message})`)
  }
} else {
  console.log('\n(no SANITY_API_TOKEN - skipped the schema manifest)')
}

if (manifest) {
  console.log('\n--- in the schema manifest stored in the dataset ---')
  for (const n of NEEDLES) {
    console.log(`  ${manifest.includes(n.text) ? 'PRESENT' : 'ABSENT '}  ${n.what}`)
  }
}

const missing = NEEDLES.filter((n) => !found.get(n.text))
const manifestMissing = manifest ? NEEDLES.filter((n) => !manifest.includes(n.text)) : null
console.log('\n--- verdict ---')
if (!files || blind) {
  console.log('  The bundle says nothing either way: the crawl never reached the')
  console.log('  schema, since even the controls are missing from what it read.')
  if (manifestMissing && !manifestMissing.length) {
    console.log('  The schema manifest in the dataset does carry every change, and')
    console.log('  only a deploy writes that - so the deploy ran and landed. What is')
    console.log('  unproven is which JavaScript the Studio hands a browser.')
  }
} else if (!missing.length) {
  console.log('  The deployed bundle carries every recent schema change. A Studio')
  console.log('  that is missing one of them is a stale copy in the browser, not a')
  console.log('  failed deploy: the service worker and the open tab both keep the')
  console.log('  old JavaScript alive across an ordinary reload.')
} else if (missing.length === NEEDLES.length) {
  console.log('  None of the recent changes are in the deployed bundle. The deploy')
  console.log('  is not landing at all, whatever the job reported.')
} else {
  console.log(`  The bundle stops at ${missing[0].since}: it has everything before`)
  console.log(`  that and none of ${missing.map((m) => m.what).join(', ')}.`)
  console.log('  That is a deploy that half-landed, and worth reading the deploy log for.')
}

// A crawl that read nothing is inconclusive, not a failure; a crawl that
// read the bundle and could not find the schema in it is the real red.
process.exit(files && !blind && missing.length ? 1 : 0)
