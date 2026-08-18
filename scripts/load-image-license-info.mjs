/*
  Load content/image-license-info.md into the Sanity page it renders from.

  /image-license-info currently shows the "content coming soon" placeholder -
  page.body has been empty since migration, and nothing on the site actually
  links to it, which is also why it shows up as an orphan page in
  scripts/audit-a11y-seo.mjs. Layout.astro's img-protection CSS says outright
  that this page is "the real protection" behind that CSS - a deterrent with
  no actual statement backing it up is not much of one.

  UNLIKE load-privacy-policy.mjs, this writes to a DRAFT, not the published
  document, and stays that way regardless of LOAD=yes. That script's own
  comment records the standard this repo already set for legal-adjacent
  copy: "Chris read and approved the text, so this writes to the PUBLISHED
  document." He has not read this one yet, so it goes to Studio as a draft
  for him to read, edit, and publish himself - not live the moment this runs.

  DRY BY DEFAULT. Prints the block structure and changes nothing unless
  LOAD=yes.

  Usage:
    SANITY_API_TOKEN=... node scripts/load-image-license-info.mjs
    SANITY_API_TOKEN=... LOAD=yes node scripts/load-image-license-info.mjs
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

console.log(LIVE ? '# Loading the image license draft into Studio\n' : '# DRY RUN - nothing will be changed\n')

const md = readFileSync(new URL('../content/image-license-info.md', import.meta.url), 'utf8')
const body = markdownToPortableText(md)

const page = await groq(`*[_type == "page" && slug.current == "image-license-info" && !(_id in path("drafts.**"))][0]{
  _id, title, heading, "blocks": count(body),
  "existing": body[]{"style": style, "listItem": listItem, "text": array::join(children[].text, "")}
}`)

if (!page) {
  console.error('No published page with slug "image-license-info". Nothing to write to.')
  process.exit(1)
}

console.log(`Target: drafts.${page._id}`)
console.log(`  title    ${JSON.stringify(page.title ?? null)}`)
console.log(`  heading  ${JSON.stringify(page.heading ?? null)}`)
console.log(`  body     ${page.blocks ?? 0} block(s) currently on the published page\n`)

if ((page.blocks ?? 0) > 0) {
  console.log(`WHAT IS ALREADY ON THE PUBLISHED PAGE - ${page.blocks} block(s)\n`)
  for (const b of page.existing ?? []) {
    const kind = b.listItem ? 'bullet' : (b.style ?? 'normal')
    const t = (b.text ?? '').trim()
    console.log(`  [${kind}] ${t || '(empty block)'}`)
  }
  console.log()
}

const kinds = {}
for (const b of body) {
  const kind = b.listItem ? 'bullet' : b.style
  kinds[kind] = (kinds[kind] ?? 0) + 1
}
console.log(`Would write ${body.length} block(s) to a DRAFT (not the published page):`)
for (const [kind, n] of Object.entries(kinds)) console.log(`  ${kind.padEnd(8)} ${n}`)
console.log()

console.log('Full text, as it will render:\n')
for (const b of body) {
  const t = b.children.map((c) => c.text).join('')
  console.log(`  [${b.listItem ?? b.style}] ${t}`)
}
console.log()

if (!LIVE) {
  console.log('DRY RUN. Nothing was changed. Re-run with LOAD=yes to write the draft.')
  process.exit(0)
}

/*
  createIfNotExists + patch, not a straight write to the published id: this
  must land as drafts.<id>, sitting alongside the live page without changing
  what a visitor sees, until Chris reads it and publishes it himself.
*/
const draftId = `drafts.${page._id}`
const res = await fetch(`${API}/v2024-01-01/data/mutate/${DATASET}`, {
  method: 'POST',
  headers: {...auth, 'Content-Type': 'application/json'},
  body: JSON.stringify({
    mutations: [
      {createIfNotExists: {_id: draftId, _type: 'page', slug: {_type: 'slug', current: 'image-license-info'}}},
      {patch: {id: draftId, set: {body}}},
    ],
  }),
})
if (!res.ok) throw new Error(`Patch failed: ${res.status} ${await res.text()}`)

const after = await groq(`*[_id == "${draftId}"][0]{"blocks": count(body), "text": array::join(body[].children[].text, " ")}`)
console.log('Written as a draft. Reading it back:\n')
console.log(`  ${after?.blocks ?? 0} block(s) on the draft`)

if ((after?.blocks ?? 0) !== body.length) {
  console.error('The draft did not come back as written. Check Studio.')
  process.exit(1)
}
console.log('\nThe draft is in Studio -> Pages -> Image License Info, with a "Draft" badge.')
console.log('It changes nothing on the live site until Chris reads it and clicks Publish.')
