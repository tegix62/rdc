/*
  Where alt text is, where it is not, and how much writing it once per ASSET
  would save over writing it once per use.

  WHY THIS EXISTS

  Chris asked whether alt text could live on the image in the Sanity library
  instead of on every field that uses it. It can - `sanity.imageAsset`
  documents carry a built-in `altText` - and the site now reads it as a
  fallback. But "would that save me anything" is a question about HIS data,
  not about the feature, and the answer is the ratio between image USES and
  distinct image ASSETS. If every picture is used once, writing it on the
  asset saves nothing; if the average picture is used twice, it halves the
  work and removes the chance of the two descriptions disagreeing.

  Counts uses by walking every document for objects holding an image
  reference, at any depth, rather than by naming fields. Fields are what get
  forgotten - sections[].items[].videoPoster is four levels down - and a count
  that quietly misses some is worse than no count.

  READ-ONLY. Reports; changes nothing.

  Usage: SANITY_API_TOKEN=... node scripts/audit-alt-text.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    TOKEN ? {headers: {Authorization: `Bearer ${TOKEN}`}} : undefined,
  )
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()).result
}

/*
  Every image reference in a document, however deep, with whatever alt text
  the field carrying it holds.

  An image field is any object with `asset._ref` pointing at an image. The
  alt lives as a sibling `alt` on that same object, which is how imageSpec
  lays it out.
*/
const walk = (node, out, where = []) => {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, out, [...where, String(i)]))
    return
  }
  if (!node || typeof node !== 'object') return
  const ref = node.asset?._ref
  if (typeof ref === 'string' && ref.startsWith('image-')) {
    out.push({
      ref,
      alt: typeof node.alt === 'string' && node.alt.trim() ? node.alt.trim() : null,
      where: where.join('.'),
    })
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'asset') continue
    walk(value, out, [...where, key])
  }
}

const docs = await groq(`*[!(_id in path("drafts.**")) && _type != "sanity.imageAsset"]`)
const assets = await groq(`*[_type == "sanity.imageAsset"]{_id, altText, originalFilename}`)

const uses = []
for (const doc of docs ?? []) walk(doc, uses, [doc._type])

const assetAlt = new Map()
for (const a of assets ?? []) {
  const text = typeof a.altText === 'string' ? a.altText.trim() : ''
  if (text) assetAlt.set(a._id, text)
}
const filename = new Map((assets ?? []).map((a) => [a._id, a.originalFilename ?? a._id]))

const byAsset = new Map()
for (const use of uses) {
  if (!byAsset.has(use.ref)) byAsset.set(use.ref, [])
  byAsset.get(use.ref).push(use)
}

const withFieldAlt = uses.filter((u) => u.alt).length
const assetsWithAlt = [...byAsset.keys()].filter((ref) => assetAlt.has(ref)).length
const covered = uses.filter((u) => u.alt || assetAlt.has(u.ref)).length
const reused = [...byAsset.entries()].filter(([, list]) => list.length > 1)

console.log('ALT TEXT ACROSS THE DATASET\n')
console.log(`  image uses in documents        ${uses.length}`)
console.log(`  distinct assets behind them    ${byAsset.size}`)
console.log(`  average uses per asset         ${(uses.length / Math.max(1, byAsset.size)).toFixed(2)}`)
console.log('')
console.log(`  uses with alt on the field     ${withFieldAlt}  (${Math.round((withFieldAlt / Math.max(1, uses.length)) * 100)}%)`)
console.log(`  assets with alt in the library ${assetsWithAlt}  (${Math.round((assetsWithAlt / Math.max(1, byAsset.size)) * 100)}% of those in use)`)
console.log(`  uses described either way      ${covered}  (${Math.round((covered / Math.max(1, uses.length)) * 100)}%)`)

console.log('\nWHAT WRITING IT ONCE PER ASSET WOULD COST\n')
console.log(`  describing every asset in use  ${byAsset.size} edits, covering all ${uses.length} uses`)
console.log(`  describing every use instead   ${uses.length} edits`)
const saved = uses.length - byAsset.size
console.log(
  saved > 0
    ? `  saved                          ${saved} edits (${Math.round((saved / uses.length) * 100)}%), and ${reused.length} picture(s) that cannot disagree with themselves`
    : `  saved                          nothing - every picture is used exactly once`,
)

if (reused.length) {
  console.log('\nUSED MORE THAN ONCE - where a second description could contradict the first\n')
  for (const [ref, list] of reused.sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
    const alts = new Set(list.map((u) => u.alt).filter(Boolean))
    const flag = alts.size > 1 ? '  <-- DESCRIBED DIFFERENTLY' : ''
    console.log(`  ${String(list.length).padStart(2)}x  ${filename.get(ref) ?? ref}${flag}`)
    for (const use of list) console.log(`        ${use.where}${use.alt ? `  "${use.alt}"` : '  (no alt)'}`)
  }
}

const undescribed = [...byAsset.entries()].filter(
  ([ref, list]) => !assetAlt.has(ref) && !list.some((u) => u.alt),
)
console.log(`\n${undescribed.length} asset(s) in use with no alt text anywhere.`)
