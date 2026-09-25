/*
  What is actually in a case study's Page Builder - published vs draft.

  WHY THIS EXISTS

  Chateau Seven renders two videos and its Page Builder lists one. Every
  explanation that could be checked from the code has been eliminated: it is
  not `filmEmbed` (embedUrl returns null for a non-YouTube/Vimeo link, and the
  block is gated on the result, so an R2 URL there renders nothing), not the
  hero (a hero video replaces the hero image, and that page has a photo), not
  a duplicate document (diagnose-duplicate-slugs: no slug is held twice), and
  not a stale build (a fresh deploy re-rendered it unchanged).

  What is left is the one thing the site and the Studio see differently. The
  site reads with no `perspective` set, which means PUBLISHED. Studio shows
  the DRAFT whenever one exists. So a draft with a block removed and never
  published looks exactly like this: a page carrying something the form does
  not list, and no amount of rebuilding changes it.

  Nothing in the repo compares the two, so nothing could ever have said so.

  READ-ONLY. Reports; changes nothing.

  Usage: SANITY_API_TOKEN=... [SLUG=chateau-seven] node scripts/diagnose-sections.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const SLUG = process.env.SLUG || 'chateau-seven'

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
  Every field that can put a video on the page, so a block can be reported as
  carrying one regardless of which of the four sources it came from - the
  distinction that hid this in the Studio list in the first place.
*/
const videoOf = (s) =>
  [
    s.url && `url:${s.url}`,
    s.videoUrl && `videoUrl:${s.videoUrl}`,
    s.videoSrc && `videoSrc:${s.videoSrc}`,
    s.videoFile && 'videoFile:(sanity upload)',
    s.videoWebm && 'videoWebm:(sanity upload)',
  ].filter(Boolean)

/*
  Sanity encodes an asset's pixel size in its _ref: image-<hash>-<W>x<H>-<ext>.
  Printing it is how a rendered box can be checked against the shape the file
  actually is - the difference between "matted" and "stretched".
*/
const dims = (img) => {
  const ref = img?.asset?._ref
  const m = typeof ref === 'string' ? ref.match(/-(\d+)x(\d+)-/) : null
  if (!m) return ''
  const [w, h] = [Number(m[1]), Number(m[2])]
  // The whole reference too: it is what a style-guide fixture has to name in
  // order to demonstrate a layout against real content rather than a stand-in.
  return `  ${w}x${h} (aspect ${(w / h).toFixed(3)})  ${ref}`
}

const describe = (doc, label) => {
  console.log(`\n=== ${label} ===`)
  if (!doc) {
    console.log('  (does not exist)')
    return 0
  }
  console.log(`  _id         ${doc._id}`)
  console.log(`  _updatedAt  ${doc._updatedAt}`)
  console.log(`  filmEmbed   ${doc.filmEmbed ? JSON.stringify(doc.filmEmbed) : '(empty)'}`)
  console.log(`  heroVideo   ${doc.heroVideo ? JSON.stringify(doc.heroVideo) : '(empty)'}`)
  const sections = doc.sections ?? []
  console.log(`  sections    ${sections.length} block(s)`)
  sections.forEach((s, i) => {
    const vids = videoOf(s)
    // A Media Row holds its own items, each of which can independently be one.
    const items = (s.items ?? []).map((it, j) => {
      const iv = videoOf(it)
      /*
        The POSTER's shape, for a video item.

        A file asset carries no dimensions, so a clip's shape is unknowable
        from the document - except through its poster, which is an ordinary
        image asset with its size in the reference. That is the one thing an
        equal slot can derive a video's shape from, so a row of clips with no
        posters and a row of clips with posters behave completely differently
        and look identical here without this.
      */
      const poster = it._type === 'mediaVideo' ? dims(it.videoPoster) : ''
      return (
        `      item ${j}: ${it._type}${dims(it.image)}${iv.length ? '  <-- VIDEO  ' + iv.join(' ') : ''}` +
        (poster ? `\n         poster:${poster}` : it._type === 'mediaVideo' ? '\n         poster: (none - shape unknowable)' : '')
      )
    })
    // The row's layout settings, which decide whether an image is sized by
    // its own shape, matted inside a slot, or cropped to fill one.
    const layout = s._type === 'mediaRowSection'
      ? `  [layout: ${s.rowLayout ?? 'shape (unset)'}${s.rowLayout && s.rowLayout !== 'shape' ? `, slots ${s.cellShape ?? '3 / 2 (unset)'}` : ''}]`
      : ''
    console.log(`    ${i}: ${s._type}${layout}${dims(s.image)}${vids.length ? '  <-- VIDEO  ' + vids.join(' ') : ''}`)
    items.forEach((l) => console.log(l))
  })
  return sections.length
}

const PROJECTION = `{_id, _updatedAt, filmEmbed, heroVideo, sections}`

const published = await groq(
  `*[_type=="caseStudy" && slug.current=="${SLUG}" && !(_id in path("drafts.**"))][0]${PROJECTION}`,
)
const draft = await groq(
  `*[_type=="caseStudy" && slug.current=="${SLUG}" && _id in path("drafts.**")][0]${PROJECTION}`,
)

console.log(`Case study: ${SLUG}`)
const pubN = describe(published, 'PUBLISHED - this is what the built site renders')
const draftN = describe(draft, 'DRAFT - this is what Studio shows you')

console.log('\n--- verdict ---')
if (!draft) {
  console.log('  No draft. The form and the page are reading the same document,')
  console.log('  so a difference between them is not explained by this.')
} else if (pubN !== draftN) {
  console.log(`  MISMATCH: published has ${pubN} blocks, the draft has ${draftN}.`)
  console.log('  Studio shows the draft; the site builds from published. Publishing')
  console.log('  the draft makes the page match the form; document History can')
  console.log('  recover anything the draft dropped.')
} else {
  console.log(`  Both have ${pubN} blocks. Same count - compare the types above.`)
}
