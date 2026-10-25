/*
  Which Studio fields hold anything. For every case study and grid item
  (published), how many have each top-level field filled in, split by
  page type; and which Site Settings fields are set. Chris: "if it's a
  field that's really only serving one function on the site, I want to
  avoid it" - a field nobody has filled is the first to question.

  READ-ONLY. Usage: SANITY_API_TOKEN=... node scripts/diagnose-field-use.mjs
*/
import {readFileSync} from 'node:fs'
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const ask = async (q) => {
  const url = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(q)}&perspective=published`
  const res = await fetch(url, {headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {}})
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()).result
}
// The field names as the schema declares them, top level only.
const names = (file, type) => {
  const s = readFileSync(file, 'utf8')
  return [...new Set([...s.matchAll(/defineField\(\{\s*name:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))]
}
const filled = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).filter((k) => !k.startsWith('_')).length === 0)

const fields = names('studio/schemaTypes/caseStudy.ts')
const docs = await ask(`*[_type == "caseStudy"]`)
const types = [...new Set(docs.map((d) => d.pageType ?? '(none)'))]
console.log(`case studies and grid items: ${docs.length} (${types.map((t) => `${docs.filter((d) => (d.pageType ?? '(none)') === t).length} ${t}`).join(', ')})\n`)
console.log(`${'field'.padEnd(22)} ${types.map((t) => t.slice(0, 12).padStart(12)).join(' ')}`)
for (const f of fields) {
  const row = types.map((t) => {
    const of = docs.filter((d) => (d.pageType ?? '(none)') === t)
    return `${of.filter((d) => filled(d[f])).length}/${of.length}`.padStart(12)
  })
  console.log(`${f.padEnd(22)} ${row.join(' ')}`)
}
const settings = (await ask(`*[_type == "siteSettings"][0]`)) ?? {}
const sfields = names('studio/schemaTypes/siteSettings.ts')
console.log(`\nSite Settings: set - ${sfields.filter((f) => filled(settings[f])).join(', ')}`)
console.log(`Site Settings: empty - ${sfields.filter((f) => !filled(settings[f])).join(', ')}`)
