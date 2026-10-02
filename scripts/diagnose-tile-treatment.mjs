/*
  Who would be affected by giving explicit logomarks air in the normal grid.

  WHY THIS EXISTS

  Chris wants to pad a few wordmarks on the Portfolio grid. The `mark`
  treatment already exists and already reaches both grids as a class, but the
  only CSS consuming it is scoped to [data-ink], so today it does nothing
  outside print mode - and that was deliberate, because the treatment is
  INFERRED from Asset Type on dozens of tiles and switching it on for all of
  them would redesign the grid rather than pad a wordmark.

  So the proposal is to split the two: a treatment Chris set BY HAND gets air
  in the normal grid, an inferred one keeps affecting ink mode only. Before
  writing that, the thing to know is how many tiles sit on each side of the
  split - "2 explicit" came from a count taken before this week's uploads, and
  a rule is only safe if the number it changes is still small.

  Also prints image refs for the explicit and mark-ish tiles, so a side-by-side
  preview of inset values can be built from Chris's actual artwork rather than
  from a placeholder square that proves nothing about how a real wordmark sits.

  READ-ONLY.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-tile-treatment.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required (read-only is enough).')
  process.exit(2)
}

const MARK_ASSET_TYPES = ['Identity / Brand Sheet', 'Vinyl / Record']

const query = `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
   && (defined(thumbnail) || defined(mainImage))
   && !(_id in path("drafts.**"))]{
     title,
     "slug": slug.current,
     tileTreatment,
     assetType,
     heroTile,
     "ref": coalesce(thumbnail.asset._ref, mainImage.asset._ref)
   } | order(title asc)`

const res = await fetch(
  `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  {headers: {Authorization: `Bearer ${TOKEN}`}},
)
if (!res.ok) {
  console.error(`Sanity: ${res.status} ${res.statusText}`)
  process.exit(2)
}
const docs = (await res.json()).result ?? []

const explicitMark = docs.filter((d) => d.tileTreatment === 'mark')
const explicitBleed = docs.filter((d) => d.tileTreatment === 'bleed')
const inferredMark = docs.filter((d) => !d.tileTreatment && MARK_ASSET_TYPES.includes(d.assetType))

console.log(`${docs.length} tile document(s)\n`)
console.log(`  Tile Layout set to "mark" BY HAND   ${String(explicitMark.length).padStart(3)}  <- would gain air in the normal grid`)
console.log(`  Tile Layout set to "bleed" by hand  ${String(explicitBleed.length).padStart(3)}`)
console.log(`  mark INFERRED from Asset Type       ${String(inferredMark.length).padStart(3)}  <- unchanged, ink mode only`)
console.log(`  no treatment either way             ${String(docs.length - explicitMark.length - explicitBleed.length - inferredMark.length).padStart(3)}`)

const show = (label, list) => {
  if (!list.length) return
  console.log(`\n  ${label}:`)
  for (const d of list) {
    console.log(`    ${d.title}`)
    console.log(`      slug ${d.slug ?? '(none)'}   assetType ${d.assetType ?? '(none)'}`)
    if (d.ref) console.log(`      ref  ${d.ref}`)
  }
}

show('Set to mark by hand', explicitMark)
show('Set to bleed by hand', explicitBleed)

/*
  Candidates for the preview. A wordmark is the case Chris named, and the
  titles carry the word, so this is a search rather than a guess at which
  pieces are marks.
*/
const wordmarks = docs.filter((d) => /wordmark|logotype|logomark|monogram/i.test(String(d.title ?? '')))
show(`Titles that say wordmark/logotype/logomark/monogram (${wordmarks.length})`, wordmarks)

const byType = {}
for (const d of docs) byType[d.assetType ?? '(none)'] = (byType[d.assetType ?? '(none)'] ?? 0) + 1
console.log('\n  Asset Type spread:')
for (const [type, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  const marks = MARK_ASSET_TYPES.includes(type) ? '  (counts as a mark)' : ''
  console.log(`    ${String(n).padStart(3)}  ${type}${marks}`)
}
