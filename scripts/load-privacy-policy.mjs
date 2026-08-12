/*
  Load content/privacy-policy.md into the Sanity page it renders from.

  The /privacy-policy page renders `page.body`, which has been empty since the
  migration - so the page currently shows the "this wasn't migrated
  automatically" placeholder. That was untidy before the Meta pixel and is a
  real gap now: the site sends every visitor's IP and page to Meta and sets a
  cookie, with nothing on the site saying so.

  Chris read and approved the text, so this writes to the PUBLISHED document
  rather than creating a draft. A draft would need publishing, and publishing is
  the thing that was broken all evening - leaving the policy one manual step
  away from existing, in a Studio whose Publish button had already failed once,
  is not where this should end.

  DRY BY DEFAULT. Prints the block structure and changes nothing unless
  LOAD=yes.

  Usage:
    SANITY_API_TOKEN=... node scripts/load-privacy-policy.mjs
    SANITY_API_TOKEN=... LOAD=yes node scripts/load-privacy-policy.mjs
*/
import {readFileSync} from 'node:fs'
import {markdownToPortableText} from './lib/markdown-to-portable-text.mjs'

const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const API = `https://${PROJECT_ID}.api.sanity.io`
const TOKEN = process.env.SANITY_API_TOKEN
const LIVE = process.env.LOAD === 'yes'

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

console.log(LIVE ? '# Loading the privacy policy\n' : '# DRY RUN - nothing will be changed\n')

const md = readFileSync(new URL('../content/privacy-policy.md', import.meta.url), 'utf8')
const body = markdownToPortableText(md)

const page = await groq(`*[_type == "page" && slug.current == "privacy-policy" && !(_id in path("drafts.**"))][0]{
  _id, title, heading, "blocks": count(body),
  "existing": body[]{"style": style, "listItem": listItem, "text": array::join(children[].text, "")}
}`)

if (!page) {
  console.error('No published page with slug "privacy-policy". Nothing to write to.')
  process.exit(1)
}

console.log(`Target: ${page._id}`)
console.log(`  title    ${JSON.stringify(page.title ?? null)}`)
console.log(`  heading  ${JSON.stringify(page.heading ?? null)}`)
console.log(`  body     ${page.blocks ?? 0} block(s) currently\n`)

/*
  Print what is already there before saying a word about replacing it.

  I wrote the replacement policy believing this page was empty, on the strength
  of a to-do item rather than a look at the data. It is not empty - it carries
  29 blocks, migrated from Webflow - and the only reason the first run did not
  overwrite a page of existing legal text was the guard below. So the existing
  content is now shown in full: nobody should be asked to approve a replacement
  without reading what it replaces.
*/
if ((page.blocks ?? 0) > 0) {
  console.log(`WHAT IS ALREADY ON THIS PAGE - ${page.blocks} block(s)\n`)
  for (const b of page.existing ?? []) {
    const kind = b.listItem ? 'bullet' : (b.style ?? 'normal')
    const t = (b.text ?? '').trim()
    console.log(`  [${kind}] ${t || '(empty block)'}`)
  }
  console.log()
}

/*
  Overwriting is the intent, but it must not be silent.
*/
if ((page.blocks ?? 0) > 0 && process.env.OVERWRITE !== 'yes') {
  console.error(
    `This page already has ${page.blocks} block(s) of body content, printed ` +
      `above. Loading would replace ALL of it.\nRead it first. Re-run with ` +
      `OVERWRITE=yes only if the replacement is genuinely better.`,
  )
  process.exit(1)
}

const kinds = {}
for (const b of body) {
  const kind = b.listItem ? 'bullet' : b.style
  kinds[kind] = (kinds[kind] ?? 0) + 1
}
console.log(`Would write ${body.length} block(s):`)
for (const [kind, n] of Object.entries(kinds)) console.log(`  ${kind.padEnd(8)} ${n}`)
console.log()

const words = body.flatMap((b) => b.children.map((c) => c.text)).join(' ').split(/\s+/).filter(Boolean).length
console.log(`${words} words, ${body.flatMap((b) => b.markDefs).length} link(s).\n`)

console.log('First three blocks, as they will render:\n')
for (const b of body.slice(0, 3)) {
  const t = b.children.map((c) => c.text).join('')
  console.log(`  [${b.listItem ?? b.style}] ${t.slice(0, 90)}${t.length > 90 ? '...' : ''}`)
}
console.log()

if (!LIVE) {
  console.log('DRY RUN. Nothing was changed. Re-run with LOAD=yes to write it.')
  process.exit(0)
}

const res = await fetch(`${API}/v2024-01-01/data/mutate/${DATASET}`, {
  method: 'POST',
  headers: {...auth, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations: [{patch: {id: page._id, set: {body}}}]}),
})
if (!res.ok) throw new Error(`Patch failed: ${res.status} ${await res.text()}`)

/*
  Read it back and check the content, not the block count. "27 blocks arrived"
  would be equally true of 27 blocks of the wrong document.
*/
const after = await groq(`*[_id == "${page._id}"][0]{"blocks": count(body), "text": array::join(body[].children[].text, " ")}`)
console.log('Written. Reading it back:\n')
console.log(`  ${after?.blocks ?? 0} block(s) on the published page`)

const required = ['chris@rumeaudesign.co', '_fbp', 'rdc-ink', 'two years']
const missing = required.filter((p) => !(after?.text ?? '').includes(p))
for (const p of required) {
  console.log(`  ${missing.includes(p) ? 'MISSING' : 'present'}  ${p}`)
}
console.log()

if (missing.length || (after?.blocks ?? 0) !== body.length) {
  console.error('The page did not come back as written. Check Studio.')
  process.exit(1)
}
console.log('The policy is on the published page.')
console.log('It appears on the site at the next production deploy.')
