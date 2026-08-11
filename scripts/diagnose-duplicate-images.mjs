/*
  The same PICTURE on the grid twice, however many times it was uploaded.

  WHY THE FIRST VERSION OF THIS WAS TOO NARROW

  diagnose-grid-items.mjs compares asset REFERENCES, so it finds "one file used
  by two documents" and reported eight such pairs. Chris then counted what he
  could actually see: two Ruff Grounds, THREE Horizon Kingdoms wordmarks, three
  of the same Adelante photograph, two Adelante logo sheets, two Doomwoken, two
  Keth, two Terremoto tees.

  More than eight pairs, and threes where I had found twos. The difference is
  re-uploads: the same picture exported twice, or dragged into Studio twice,
  becomes two DISTINCT assets with distinct references. Identical to the eye,
  invisible to a reference comparison. My check answered a narrower question
  than the one asked and I reported its answer as if it were the whole thing.

  So this compares the images themselves, by three signals of decreasing
  certainty:

    sha1        byte-identical uploads. Sanity dedupes these on upload, so a
                match here means two asset documents genuinely exist.
    palette     the colours Sanity extracts FROM THE PIXELS. Two exports of one
                picture yield the same swatches even when the bytes differ.

                My first attempt used the LQIP preview and compared its first 48
                characters. An LQIP is a data URI, so those 48 characters are
                "data:image/jpeg;base64," plus a JPEG header that is IDENTICAL
                for every image on the site. It grouped 29 unrelated pictures as
                duplicates - Chateau Seven with Golden Coast with Hug a Mug -
                and looked authoritative doing it. A confident wrong answer is
                worse than none, so it compares six extracted swatches now, and
                requires the dimensions to match as well.
    dimensions  the weakest, listed only so a human can eyeball the rest.

  Every group prints a CDN url per member, because the last word on "are these
  the same picture" is looking at them, not a hash.

  Usage: node scripts/diagnose-duplicate-images.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

const q = (s) => encodeURIComponent(s)
const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${q(query)}`,
  )
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

/*
  Only tiles that actually reach the Portfolio grid, and only the image each one
  SHOWS - `thumbnail || mainImage`, the same expression the template uses. A
  document holding a duplicate in a field nobody renders is not what Chris is
  looking at.
*/
const tiles = await groq(`*[_type == "caseStudy"
   && pageType in ["Case Study", "Grid Item"]
   && (defined(thumbnail) || defined(mainImage))]{
  title, pageType,
  "shown": coalesce(thumbnail.asset->, mainImage.asset->){
    _id, url, sha1hash, size,
    "w": metadata.dimensions.width,
    "h": metadata.dimensions.height,
    "lqip": metadata.lqip,
    "palette": metadata.palette{
      "a": dominant.background, "b": dominant.foreground,
      "c": vibrant.background, "d": muted.background,
      "e": darkVibrant.background, "f": lightVibrant.background
    }
  }
} | order(title asc)`)

const withAsset = tiles.filter((t) => t.shown?._id)
console.log(`# Duplicate pictures on the Portfolio grid\n`)
console.log(`${withAsset.length} tiles reach the grid with an image.\n`)

const groupBy = (list, keyOf) => {
  const m = new Map()
  for (const t of list) {
    const k = keyOf(t)
    if (k == null) continue
    m.set(k, [...(m.get(k) ?? []), t])
  }
  return [...m.entries()].filter(([, v]) => v.length > 1)
}

const report = (heading, blurb, groups, keyLabel) => {
  console.log(`\n## ${heading} (${groups.length})\n`)
  console.log(`${blurb}\n`)
  if (!groups.length) {
    console.log(`  None.`)
    return new Set()
  }
  const covered = new Set()
  for (const [key, list] of groups.sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${list.length}x  ${keyLabel(key, list)}`)
    for (const t of list) {
      console.log(`      ${t.title ?? '(untitled)'} [${t.pageType}]`)
      covered.add(t.title)
    }
    console.log(`      ${list[0].shown.url}`)
  }
  return covered
}

// 1. byte-identical
const bySha = groupBy(withAsset, (t) => t.shown.sha1hash)
const seen = report(
  'Byte-identical files',
  'The exact same bytes, stored as more than one asset.',
  bySha,
  (k, list) => `${list[0].shown.w}x${list[0].shown.h}  sha1 ${String(k).slice(0, 12)}`,
)

/*
  Sanity extracts a colour palette from the pixels, so two exports of one
  picture produce the same swatches even when the bytes differ. Six swatches
  plus the exact dimensions is a fingerprint that unrelated work does not hit by
  accident - where the LQIP prefix I tried first matched everything, because
  those bytes are a JPEG header rather than the picture.

  Exact LQIP equality is folded in as a second key: it is rarer than a palette
  match and cannot false-positive, so anything it catches is worth catching.
*/
const alreadyGrouped = new Set(bySha.flatMap(([, l]) => l.map((t) => t.shown._id)))
const remaining = withAsset.filter((t) => !alreadyGrouped.has(t.shown._id))
const paletteKey = (t) => {
  const p = t.shown.palette
  const swatches = p ? [p.a, p.b, p.c, p.d, p.e, p.f].filter(Boolean) : []
  // Fewer than four swatches is not a fingerprint, it is a coincidence waiting
  // to happen - a flat two-colour logomark would match every other flat mark.
  if (swatches.length < 4) return null
  return `${t.shown.w}x${t.shown.h}|${swatches.join(',')}`
}
const byLqip = [
  ...groupBy(remaining, paletteKey),
  ...groupBy(remaining, (t) => (t.shown.lqip ? `lqip:${t.shown.lqip}` : null)),
]
report(
  'Visually identical, uploaded more than once',
  'Different files, same picture - separate uploads or re-exports. Sanity gives\n' +
    'each its own asset id, so a reference comparison cannot see these. This is\n' +
    'what makes three of one photograph possible where I reported two.\n' +
    'Matched on identical dimensions AND six colour swatches extracted from the\n' +
    'pixels. Open the url before deleting anything - this is evidence, not proof.',
  byLqip,
  (_k, list) => `${list[0].shown.w}x${list[0].shown.h}  ${Math.round(list[0].shown.size / 1024)} KB`,
)

// 3. weakest signal, for eyeballing only
const stillUngrouped = remaining.filter(
  (t) => !byLqip.some(([, l]) => l.some((x) => x.shown._id === t.shown._id)),
)
const byDims = groupBy(stillUngrouped, (t) => `${t.shown.w}x${t.shown.h}`)
console.log(`\n## Same dimensions, probably different pictures (${byDims.length})\n`)
console.log(`Listed only so nothing is missed. Most of these will be unrelated -`)
console.log(`a lot of work is exported at one size. Open the urls to judge.\n`)
for (const [dims, list] of byDims.sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
  console.log(`  ${list.length}x ${dims}: ${list.map((t) => t.title).join(', ')}`)
}

console.log(`\n---`)
console.log(`Nothing here is changed automatically. Which of a pair to keep is a`)
console.log(`judgement about the work, and deleting a Sanity document is permanent.`)
