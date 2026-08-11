/*
  Is every piece of work actually on the Portfolio grid, and is anything on it
  twice?

  Two separate questions that both look the same from the page - "I count fewer
  tiles than I have documents" and "I keep seeing that shirt" - and neither is
  answerable by scrolling, because 68 tiles is more than anyone can hold in
  their head.

  WHAT CAN MAKE A DOCUMENT VANISH FROM THE GRID

  getAllGridItems filters on `defined(thumbnail) || defined(mainImage)`, so a
  document with neither is silently absent. Worse, `defined()` is TRUE for an
  image field saved as an object shell - crop and hotspot stored, no file
  attached - which Studio creates just by opening a field's options. Such a
  document passes the filter, reaches the template, and renders an empty tile:
  present in the markup, nothing to see. That exact shape took all 21 pages down
  twice before imageUrl() started guarding it, and it is still the reason a tile
  can be blank rather than missing.

  WHAT COUNTS AS A DUPLICATE

  Two documents whose DISPLAYED image is the same asset. The grid shows
  `thumbnail || mainImage`, so that is what gets compared - a document reusing
  its own main image as its thumbnail is not a duplicate, but two different
  documents pointing at one file appear twice on the page.

  The site's own model says this should not happen: a Case Study is the project
  and a Grid Item is a detail from it, so the same image should not be both.

  Usage: node scripts/diagnose-grid-items.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

const q = (s) => encodeURIComponent(s)
const res = await fetch(
  `https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${q(`
*[_type == "caseStudy"]{
  _id, title, pageType, category,
  "slug": slug.current,
  "thumbRef": thumbnail.asset._ref,
  "mainRef": mainImage.asset._ref,
  "hasThumbField": defined(thumbnail),
  "hasMainField": defined(mainImage),
  "archiveRef": archiveMark.asset._ref,
  "hasArchiveField": defined(archiveMark),
  "parentId": parentBrand._ref,
  "parentTitle": parentBrand->title,
  "parentType": parentBrand->pageType
} | order(pageType asc, title asc)`)}`,
)
if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
const docs = await res.json().then((r) => r.result)

const pad = (s, n) => String(s).padEnd(n)
const label = (d) => `${d.title ?? '(untitled)'} [${d.pageType ?? 'no pageType'}]`

const byType = docs.reduce((acc, d) => ((acc[d.pageType ?? 'none'] = (acc[d.pageType ?? 'none'] ?? 0) + 1), acc), {})
console.log(`# Portfolio grid check\n`)
console.log(`${docs.length} caseStudy documents: ` + Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(', '))

// --- 1. what the grid query lets through ------------------------------------
const inGrid = docs.filter((d) => (d.hasThumbField || d.hasMainField) && ['Case Study', 'Grid Item'].includes(d.pageType))
const wrongType = docs.filter((d) => !['Case Study', 'Grid Item'].includes(d.pageType))
const noImageField = docs.filter((d) => !d.hasThumbField && !d.hasMainField)

console.log(`${inGrid.length} pass the grid's filter and reach the template\n`)

console.log(`## Absent from the grid (${noImageField.length + wrongType.length})\n`)
if (!noImageField.length && !wrongType.length) console.log(`  Nothing. Every document reaches the grid.`)
for (const d of noImageField) console.log(`  ${pad(label(d), 52)} no Tile Image and no Main Image`)
for (const d of wrongType) console.log(`  ${pad(label(d), 52)} pageType is not Case Study or Grid Item`)

// --- 2. reaches the grid but renders nothing ---------------------------------
/*
  The one that actually looks broken. `defined(thumbnail)` is true for a shell,
  so these pass the filter, occupy a slot, and draw nothing.
*/
const blank = inGrid.filter((d) => !d.thumbRef && !d.mainRef)
console.log(`\n## Reaches the grid but has NO FILE attached (${blank.length})\n`)
if (!blank.length) console.log(`  None. Every tile that reaches the grid has an image to draw.`)
for (const d of blank) {
  const which = [d.hasThumbField && 'Tile Image', d.hasMainField && 'Main Image'].filter(Boolean).join(' + ')
  console.log(`  ${pad(label(d), 52)} ${which} saved with no file - renders blank`)
}

// Same shape on the archive mark: it degrades to the CSS threshold rather than
// breaking, but it is a half-finished edit either way.
const blankArchive = docs.filter((d) => d.hasArchiveField && !d.archiveRef)
console.log(`\n## Archive Mark saved with no file (${blankArchive.length})\n`)
if (!blankArchive.length) console.log(`  None.`)
for (const d of blankArchive) console.log(`  ${pad(label(d), 52)} falls back to the CSS threshold`)

// --- 3. duplicates -----------------------------------------------------------
const displayed = new Map()
for (const d of inGrid) {
  const ref = d.thumbRef ?? d.mainRef
  if (!ref) continue
  displayed.set(ref, [...(displayed.get(ref) ?? []), d])
}
const dupes = [...displayed.entries()].filter(([, list]) => list.length > 1)

console.log(`\n## The same image on the grid more than once (${dupes.length})\n`)
if (!dupes.length) {
  console.log(`  None. All ${displayed.size} tiles show a distinct asset.`)
} else {
  console.log(`  Compared on the image the grid actually SHOWS (thumbnail, else main).\n`)
  for (const [ref, list] of dupes) {
    const dims = ref.match(/-(\d+x\d+)-/)?.[1] ?? '?'
    console.log(`  ${ref.slice(6, 22)} (${dims}) appears ${list.length}x:`)
    for (const d of list) console.log(`    - ${label(d)}`)
  }
}

// A weaker signal, but worth seeing: the same file used as a tile somewhere and
// as a main image elsewhere shows up on a project page and a grid tile both.
const anyUse = new Map()
for (const d of docs) {
  for (const ref of [d.thumbRef, d.mainRef]) {
    if (ref) anyUse.set(ref, new Set([...(anyUse.get(ref) ?? []), d._id]))
  }
}
const sharedAcrossDocs = [...anyUse.entries()].filter(([, ids]) => ids.size > 1)
console.log(`\n## Assets shared between documents, in any image field (${sharedAcrossDocs.length})\n`)
if (!sharedAcrossDocs.length) console.log(`  None.`)
for (const [ref, ids] of sharedAcrossDocs) {
  const who = docs.filter((d) => ids.has(d._id)).map(label)
  console.log(`  ${ref.slice(6, 22)}: ${who.join('  |  ')}`)
}

// --- 4. tiles that go nowhere ------------------------------------------------
/*
  A Grid Item has no page of its own, so it links to its parent - and only when
  that parent is a Case Study, because linking to a Grid Item's slug is a 404.
  Anything here is a tile a visitor can click and get nothing from.
*/
const deadEnd = inGrid.filter(
  (d) => d.pageType === 'Grid Item' && d.parentType !== 'Case Study',
)
console.log(`\n## Grid Items that link nowhere (${deadEnd.length})\n`)
if (!deadEnd.length) console.log(`  None. Every Grid Item points at a real project page.`)
for (const d of deadEnd) {
  const why = !d.parentId ? 'no parent set' : `parent "${d.parentTitle ?? '?'}" is a ${d.parentType ?? 'missing document'}`
  console.log(`  ${pad(d.title ?? '(untitled)', 52)} ${why}`)
}

// --- 5. the filters ----------------------------------------------------------
const noCategory = inGrid.filter((d) => !d.category)
console.log(`\n## On the grid with no category (${noCategory.length})\n`)
console.log(`  These show under "All" but under no filter button.\n`)
if (!noCategory.length) console.log(`  None.`)
for (const d of noCategory) console.log(`  ${label(d)}`)
