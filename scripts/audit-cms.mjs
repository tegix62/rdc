/*
  Answers "do all of the CMS fields actually work?" for every field in the
  Studio, not one at a time.

  Chris's example was Asset Type, which he called unusable. Reading the code
  says why: it's a dropdown whose description promises it "controls grid tile
  shape", and no template in src/ reads it. Changing it does nothing. That
  class of bug is invisible from inside Studio - the field looks fine, saves
  fine, and has no effect - so this looks for all of them at once.

  Three things get checked, and they catch different failures:

    DEAD      the field is in the schema but no file under src/ ever reads it.
              Editing it changes nothing on the site.

    UNUSED    every document leaves it empty. Either it's redundant, or its
              purpose was never explained well enough to fill in.

    INVALID   a string field declares options.list, but documents hold values
              that aren't in that list. Studio renders those as an unselectable
              value, so the dropdown appears broken. This is exactly what raw
              Webflow reference hashes look like when a migration forgets to
              map one.

  The schema is loaded by bundling studio/schemaTypes with esbuild and stubbing
  the `sanity` module - defineType and defineField are identity functions, so
  the stub returns real schema objects without pulling Studio's whole runtime
  into Node.

  Live document data comes from the public read API, so no token is needed.
  Pass --offline to skip that half and run the static checks only (the sandbox
  has no outbound network; CI does).

  Usage: node scripts/audit-cms.mjs [--offline] [--json out.json]
*/
import {build} from 'esbuild'
import {readdir, readFile, writeFile, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OFFLINE = process.argv.includes('--offline')
const jsonAt = process.argv.indexOf('--json')
const JSON_OUT = jsonAt > -1 ? process.argv[jsonAt + 1] : null

const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

// Machine-written bookkeeping, never opened by an editor. The question this
// audit asks - "if I change this in Studio, does anything happen?" - doesn't
// apply, so flagging its fields as dead is just noise.
// animatedVideoMap is machine-written bookkeeping - but note its sourceBytes
// and mp4Bytes fields were flagged dead by an earlier run of this audit and
// are now read by src/lib/animatedVideo.ts to decide whether a converted
// video is actually smaller than the animation it replaces. A dead field is
// sometimes a missing feature, not a redundant one.
const INTERNAL_TYPES = new Set(['animatedVideoMap'])

// ---------------------------------------------------------------------------
// 1. The schema

const stubSanity = {
  name: 'stub-sanity',
  setup(b) {
    b.onResolve({filter: /^sanity$/}, () => ({path: 'sanity', namespace: 'stub'}))
    b.onResolve({filter: /^sanity\//}, (a) => ({path: a.path, namespace: 'stub'}))
    b.onResolve({filter: /^@sanity\//}, (a) => ({path: a.path, namespace: 'stub'}))
    // defineType/defineField exist purely for editor types - at runtime they
    // hand back exactly what they were given, so identity is faithful.
    b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({
      contents: `
        const identity = (x) => x
        export const defineType = identity
        export const defineField = identity
        export const defineArrayMember = identity
        export const definePlugin = identity
        export default new Proxy({}, {get: () => identity})
      `,
      loader: 'js',
    }))
  },
}

const outdir = await mkdtemp(path.join(tmpdir(), 'schema-'))
const outfile = path.join(outdir, 'schema.mjs')
await build({
  entryPoints: [path.join(root, 'studio/schemaTypes/index.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [stubSanity],
  logLevel: 'warning',
})
const {schemaTypes} = await import(outfile)

// Flatten to (documentType, fieldPath, field) triples, walking into objects and
// arrays so fields nested in a section block are audited too.
const fields = []
const walk = (typeName, prefix, list) => {
  for (const f of list ?? []) {
    if (!f?.name) continue
    const fieldPath = prefix ? `${prefix}.${f.name}` : f.name
    fields.push({typeName, path: fieldPath, name: f.name, field: f})
    if (f.fields) walk(typeName, fieldPath, f.fields)
    for (const member of f.of ?? []) if (member?.fields) walk(typeName, `${fieldPath}[]`, member.fields)
  }
}
const documentTypes = []
for (const t of schemaTypes) {
  if (INTERNAL_TYPES.has(t.name)) continue
  if (t.type === 'document') documentTypes.push(t.name)
  walk(t.name, '', t.fields)
}

// ---------------------------------------------------------------------------
// 2. Is anything reading it?

const srcFiles = []
const collect = async (dir) => {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await collect(full)
    else if (/\.(astro|ts|tsx|js|mjs)$/.test(entry.name)) srcFiles.push(full)
  }
}
await collect(path.join(root, 'src'))
let srcText = (await Promise.all(srcFiles.map((f) => readFile(f, 'utf8')))).join('\n')

// src/lib/sanity.ts carries NON_TEXT_FIELDS - a list of field names that must
// NOT get stega markers because something machine-reads them. Every name in it
// is a mention, not a use, and leaving it in the corpus hides exactly the
// fields most likely to be dead: assetType was in that list and so escaped the
// first run of this audit.
srcText = srcText.replace(/const NON_TEXT_FIELDS[\s\S]*?\]\)/, '')

// A field counts as read if its name appears anywhere in src/ as a property
// access, a GROQ projection, or a quoted key. Deliberately generous: a false
// "it's used" is a missed finding, but a false "it's dead" would send someone
// deleting a field that works.
const isRead = (name) => new RegExp(`\\b${name}\\b`).test(srcText)

// ---------------------------------------------------------------------------
// 3. What's actually in the documents

let docs = null
if (!OFFLINE) {
  const query = encodeURIComponent(`*[_type in ${JSON.stringify(documentTypes)}]`)
  const url = `https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${query}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
  docs = (await res.json()).result
  console.log(`fetched ${docs.length} documents\n`)
}

const valuesAt = (doc, dotted) => {
  // Resolves "sections[].heading" style paths across arrays.
  let nodes = [doc]
  for (const segment of dotted.split('.')) {
    const key = segment.replace('[]', '')
    const next = []
    for (const n of nodes) {
      const v = n?.[key]
      if (v === undefined || v === null) continue
      if (Array.isArray(v)) next.push(...v)
      else next.push(v)
    }
    nodes = next
  }
  return nodes
}

const isEmpty = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

// ---------------------------------------------------------------------------
const findings = []
const rows = []
// Section block types no document uses at all. Reported once each, not once
// per field.
const unusedBlocks = new Set()

for (const {typeName, path: fieldPath, name, field} of fields) {
  const dead = !isRead(name)

  let filled = 0
  let total = 0
  const bad = new Set()
  const list = field.options?.list
  const allowed = list?.map((o) => (typeof o === 'string' ? o : o.value))

  if (docs) {
    // Fields on a section block only exist in documents that actually use
    // that block. Counting them against all 96 documents reported 83 fields
    // as "empty in every document" when they were simply fields of a block
    // nobody had added yet - so the pool is narrowed to documents where the
    // block is present, and a block used nowhere is reported as the one
    // finding it really is rather than as one per field.
    const usesType = (doc) => JSON.stringify(doc).includes(`"_type":"${typeName}"`)
    const pool = documentTypes.includes(typeName)
      ? docs.filter((d) => d._type === typeName)
      : docs.filter(usesType)

    for (const doc of pool) {
      total += 1
      const found = valuesAt(doc, fieldPath)
      const nonEmpty = found.filter((v) => !isEmpty(v))
      if (nonEmpty.length) filled += 1
      if (allowed) for (const v of nonEmpty) if (typeof v === 'string' && !allowed.includes(v)) bad.add(v)
    }
  }

  rows.push({typeName, fieldPath, dead, filled, total, invalid: [...bad]})

  if (dead) findings.push({level: 'DEAD', typeName, fieldPath, detail: `nothing in src/ reads "${name}"`})
  if (bad.size)
    findings.push({
      level: 'INVALID',
      typeName,
      fieldPath,
      detail: `value(s) not in the dropdown: ${[...bad].map((v) => JSON.stringify(v)).join(', ')}`,
    })
  if (docs && total > 0 && filled === 0 && !dead)
    findings.push({level: 'UNUSED', typeName, fieldPath, detail: `empty in all ${total} document(s)`})
  if (docs && total === 0 && !documentTypes.includes(typeName)) unusedBlocks.add(typeName)
}

// ---------------------------------------------------------------------------
const order = {INVALID: 0, DEAD: 1, UNUSED: 2}
findings.sort((a, b) => order[a.level] - order[b.level] || a.typeName.localeCompare(b.typeName))

console.log(`# CMS field audit\n`)
console.log(`${fields.length} fields across ${documentTypes.length} document types`)
console.log(`${findings.length} finding(s)\n`)

for (const level of ['INVALID', 'DEAD', 'UNUSED']) {
  const group = findings.filter((f) => f.level === level)
  if (!group.length) continue
  const blurb = {
    INVALID: 'Dropdown holds a value that is not one of its options - Studio shows it as unselectable.',
    DEAD: 'In the schema, but no template reads it. Editing it changes nothing on the site.',
    UNUSED: 'Read by the site, but empty in every document.',
  }[level]
  console.log(`## ${level} (${group.length})`)
  console.log(`${blurb}\n`)
  for (const f of group) console.log(`  ${f.typeName}.${f.fieldPath}\n      ${f.detail}`)
  console.log()
}

if (unusedBlocks.size) {
  console.log(`## Blocks nobody has used yet (${unusedBlocks.size})`)
  console.log(`Available in the Sections editor, not present in any document.\n`)
  for (const t of [...unusedBlocks].sort()) console.log(`  ${t}`)
  console.log()
}

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify({fields: rows, findings}, null, 2))
  console.log(`wrote ${JSON_OUT}`)
}
