/*
  Which fields a GRID ITEM actually uses.

  WHY THIS EXISTS

  Chris: "a lot of it's the old setup that Projects had". The Tile tab was
  written when every document was a project, so its field order is a
  project's priorities, and a tile is a different thing - it has no page,
  no summary, no credits, and it links to its parent rather than to
  itself.

  67 of the 72 published documents are tiles. Reordering their form around
  which fields they use is only worth doing from the data, because the
  guess and the measurement have disagreed every time this week - the
  hero-video fields looked essential and were used twice; the short blurb
  looked dead and was feeding search on three pages.

  Also reported: fields a tile uses that are HIDDEN from its form, and
  fields in its form that no tile has ever used. Both are costs of one
  schema serving two jobs, and neither shows up in the schema itself.

  READ-ONLY. Reports; changes nothing.

  Usage: SANITY_API_TOKEN=... node scripts/audit-grid-item-fields.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only use).')
  process.exit(1)
}

const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()).result
}

/*
  Every field on the Tile tab, in the order the form shows them, plus the
  page-only ones a tile is not supposed to need - because "not supposed to"
  is a claim worth checking against 67 documents.
*/
const TILE_FIELDS = [
  ['title', 'Title'],
  ['slug', 'Slug'],
  ['pageType', 'Page Type'],
  ['category', 'Category - Portfolio filters'],
  ['thumbnail', 'Grid Thumbnail'],
  ['archiveMark', 'Archive Mark (print mode)'],
  ['heroTile', 'Hero Tile - spans two columns'],
  ['assetType', 'Asset Type'],
  ['tileTreatment', 'Tile Layout override'],
  ['parentBrand', 'Parent Brand'],
  ['mainImage', 'Main Project Image (tile fallback)'],
]

const PAGE_ONLY = [
  ['summary', 'Project summary'],
  ['oneLineSummary', 'Search blurb'],
  ['seoDescription', 'Search description'],
  ['client', 'Client Name'],
  ['clientLogo', "Client's Logo"],
  ['sections', 'Page Builder'],
  ['credits', 'Credits'],
  ['principalType', 'Principal Type'],
  ['heroVideo', 'Hero video (embed)'],
  ['accessPassword', 'Password'],
  ['resultStat', 'Result Stat'],
  ['headline', 'Display Headline'],
  ['subtitle', 'Kicker'],
]

const ALL = [...TILE_FIELDS, ...PAGE_ONLY]

const tiles = await groq(
  `*[_type == "caseStudy" && pageType != "Case Study" && !(_id in path("drafts.**"))]{
    _id, title, "slug": slug.current,
    ${ALL.map(([f]) => f).join(', ')}
  } | order(title asc)`,
)

const filled = (v) => {
  if (v === undefined || v === null || v === false) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

const n = tiles.length
console.log(`${n} grid items (published)\n`)

const bar = (count) => {
  const width = 24
  const full = Math.round((count / Math.max(n, 1)) * width)
  return '#'.repeat(full).padEnd(width, '.')
}

console.log('--- the Tile tab, by how many tiles use each field ---')
const usage = TILE_FIELDS.map(([field, what]) => [field, what, tiles.filter((t) => filled(t[field])).length])
for (const [field, what, count] of usage) {
  console.log(`  ${bar(count)}  ${String(count).padStart(3)}/${n}  ${field.padEnd(15)} ${what}`)
}

console.log('\n--- in use order, which is what the form should probably follow ---')
for (const [field, , count] of [...usage].sort((a, b) => b[2] - a[2])) {
  console.log(`  ${String(count).padStart(3)}  ${field}`)
}

/*
  THE FIELDS A TILE IS NOT SHOWN. Anything with a count here is a field
  some tile depends on that its editor cannot see - the exact failure the
  `hidden` predicates risk, and the reason mainImage is deliberately left
  visible.
*/
console.log('\n--- page-only fields, which a tile should not need ---')
let surprises = 0
for (const [field, what] of PAGE_ONLY) {
  const users = tiles.filter((t) => filled(t[field]))
  if (!users.length) continue
  surprises += 1
  console.log(`  ${String(users.length).padStart(3)}/${n}  ${field.padEnd(15)} ${what}`)
  console.log(`         ${users.slice(0, 6).map((t) => t.slug ?? t._id).join(', ')}${users.length > 6 ? ' …' : ''}`)
}
if (!surprises) console.log('  none - every page-only field is empty on every tile.')

/*
  The two fields that decide how a tile LOOKS, which is the thing the grid
  is for. Reported as a cross-tab because tileTreatment is only consulted
  when assetType gets it wrong, so the interesting number is how often it
  is actually overriding something.
*/
console.log('\n--- how tiles are presented ---')
const byTreatment = {}
for (const t of tiles) {
  const key = `${t.assetType ?? '(no asset type)'}  ->  ${t.tileTreatment ?? '(inferred)'}`
  byTreatment[key] = (byTreatment[key] ?? 0) + 1
}
for (const [key, count] of Object.entries(byTreatment).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${key}`)
}

console.log('\n--- images: what a tile is actually showing ---')
const thumb = tiles.filter((t) => filled(t.thumbnail)).length
const fallback = tiles.filter((t) => !filled(t.thumbnail) && filled(t.mainImage)).length
const neither = tiles.filter((t) => !filled(t.thumbnail) && !filled(t.mainImage))
console.log(`  ${thumb} use Grid Thumbnail`)
console.log(`  ${fallback} fall back to Main Project Image`)
console.log(`  ${neither.length} have NO image at all${neither.length ? ':' : ''}`)
for (const t of neither) console.log(`      ${t.slug ?? t._id}`)

console.log('\n--- parent brand, which is how a tile is reached ---')
const orphans = tiles.filter((t) => !filled(t.parentBrand))
console.log(`  ${n - orphans.length}/${n} point at a project.`)
if (orphans.length) {
  console.log(`  ${orphans.length} do not, so clicking them goes nowhere:`)
  for (const t of orphans.slice(0, 20)) console.log(`      ${t.slug ?? t._id}`)
  if (orphans.length > 20) console.log(`      … and ${orphans.length - 20} more`)
}
