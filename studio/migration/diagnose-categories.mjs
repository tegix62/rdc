/*
  Prints the raw `category` value on every Grid Item, straight from Sanity.

  Written because the Portfolio filters have now been "fixed" twice on the
  strength of inference and failed both times. The rendered page shows 66 tiles
  with no category class, which could mean the field is empty, or holds raw
  Webflow ids, or holds something else entirely - and each implies a different
  fix. This reads the actual values instead of deducing them.

  Read-only. Run: npm run diagnose:categories   (from studio/)
*/
import {createClient} from '@sanity/client'

const client = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const rows = await client.fetch(
  `*[_type == "caseStudy" && pageType == "Grid Item"]{_id, title, category, pageType}`,
)

console.log(`${rows.length} Grid Item documents\n`)

const counts = new Map()
for (const r of rows) {
  const key = r.category === undefined ? '(field absent)' : JSON.stringify(r.category)
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
console.log('distinct category values:')
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  x${String(v).padStart(3)}  ${k}`)
}

console.log('\nfirst 5 documents in full:')
for (const r of rows.slice(0, 5)) {
  console.log(`  ${r._id}`)
  console.log(`    title:    ${JSON.stringify(r.title)}`)
  console.log(`    category: ${JSON.stringify(r.category)}`)
  console.log(`    pageType: ${JSON.stringify(r.pageType)}`)
}

// What the whole document actually contains, so a renamed or differently-shaped
// field shows up rather than staying invisible behind a projection.
const one = await client.fetch(
  `*[_type == "caseStudy" && pageType == "Grid Item"][0]`,
)
console.log('\nevery field on one Grid Item document:')
for (const k of Object.keys(one ?? {}).sort()) {
  const v = one[k]
  const s = typeof v === 'object' ? JSON.stringify(v).slice(0, 70) : JSON.stringify(v)
  console.log(`  ${k.padEnd(20)} ${s}`)
}
