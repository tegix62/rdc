/*
  Which collages have a Full-resolution scan, and what the CDN makes of it.

  For the magnifier (see fullScan in studio/schemaTypes/caseStudy.ts). Lists
  every document with the field set - published and draft, so an upload
  that was never published still shows - with the asset's pixel size, file
  size and format. Then asks the image CDN for one full-resolution patch
  from the middle of each scan, which is exactly the request the loupe will
  make, and reports how long it took and how big it came back. A scan the
  CDN refuses to transform shows up here rather than as a broken loupe.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-full-scan.mjs
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN

const groq = async (query) => {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}&perspective=raw`,
    TOKEN ? {headers: {Authorization: `Bearer ${TOKEN}`}} : undefined,
  )
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
  return (await res.json()).result
}

const docs = await groq(`*[_type == "caseStudy" && defined(fullScan.asset)]{
  _id, title, "slug": slug.current, pageType,
  "web": coalesce(thumbnail.asset->{url, "w": metadata.dimensions.width, "h": metadata.dimensions.height},
                  mainImage.asset->{url, "w": metadata.dimensions.width, "h": metadata.dimensions.height}),
  "scan": fullScan.asset->{
    _id, url, size, mimeType, extension, originalFilename,
    "w": metadata.dimensions.width, "h": metadata.dimensions.height,
    "dpi": metadata.exif.XResolution, "space": metadata.exif.ColorSpace
  }
}`)

console.log(`${docs.length} document(s) with a Full-resolution scan\n`)

/*
  Every collage, scanned or not, in the order the series page would show
  them - and every case study's heading fields, for the "lead with the
  result" rewrite. Read once here rather than guessed at from the schema.
*/
const collages = await groq(`*[_type == "caseStudy" && (category == "Collage" || slug.current match "collage-*") && !(_id in path("drafts.**"))]
  | order(coalesce(date, publishedAt, _createdAt) asc) {
    title, "slug": slug.current, pageType, category, _createdAt, date, publishedAt, parentTitle,
    "hasThumb": defined(thumbnail.asset), "hasMain": defined(mainImage.asset), "hasScan": defined(fullScan.asset),
    "parent": parent->title
  }`)
console.log(`--- collages: ${collages.length}`)
for (const c of collages)
  console.log(
    `  ${c.title}  [${c.slug}] ${c.pageType}/${c.category ?? '-'} created ${String(c._createdAt).slice(0, 10)}` +
      `${c.date ? ` date ${c.date}` : ''}${c.parent ? ` parent "${c.parent}"` : ''} thumb=${c.hasThumb} main=${c.hasMain} scan=${c.hasScan}`,
  )

const studies = await groq(`*[_type == "caseStudy" && pageType == "Case Study" && !(_id in path("drafts.**"))] | order(title asc) {
  title, "slug": slug.current, headline, subtitle, client, resultStat, "summary": pt::text(summary), seoDescription,
  "hasClosing": defined(closingImage.asset)
}`)
console.log(`\n--- case studies: ${studies.length}`)
for (const s of studies) {
  console.log(`\n  ${s.title}  [/work/${s.slug}]`)
  console.log(`    headline:   ${s.headline ?? '(none)'}`)
  console.log(`    subtitle:   ${s.subtitle ?? '(none)'}`)
  console.log(`    resultStat: ${s.resultStat ?? '(none)'}   client: ${s.client ?? '(none)'}`)
  console.log(`    summary:    ${(s.summary ?? '(none)').slice(0, 300)}`)
  console.log(`    seo:        ${(s.seoDescription ?? '(none)').slice(0, 200)}`)
}
console.log()

for (const d of docs) {
  const s = d.scan ?? {}
  console.log(`${d.title}  (${d._id}${d._id.startsWith('drafts.') ? ', DRAFT' : ''}, slug ${d.slug}, ${d.pageType})`)
  console.log(`  scan   ${s.w} x ${s.h}px, ${(s.size / 1e6).toFixed(1)} MB, ${s.mimeType}, file "${s.originalFilename}"`)
  console.log(`  web    ${d.web?.w} x ${d.web?.h}px  (the copy the page shows now)`)
  if (d.web?.w && s.w) console.log(`  ratio  the scan is ${(s.w / d.web.w).toFixed(2)}x the web copy across`)

  // One loupe patch: 400x400 source pixels from the centre, at full size.
  if (s.url && s.w && s.h) {
    const size = 400
    const x = Math.round(s.w / 2 - size / 2)
    const y = Math.round(s.h / 2 - size / 2)
    for (const fmt of ['jpg', 'webp']) {
      const url = `${s.url}?rect=${x},${y},${size},${size}&w=${size}&fm=${fmt}&q=82`
      const t0 = performance.now()
      const res = await fetch(url)
      const body = await res.arrayBuffer()
      const ms = Math.round(performance.now() - t0)
      console.log(
        `  patch  ${fmt}: HTTP ${res.status}, ${(body.byteLength / 1024).toFixed(0)} KB, ${ms} ms` +
          ` (cache: ${res.headers.get('x-cache') ?? res.headers.get('cf-cache-status') ?? 'n/a'})`,
      )
      // A second time, to see the edge-cached cost the loupe pays after.
      const t1 = performance.now()
      const again = await fetch(url)
      await again.arrayBuffer()
      console.log(`         again: ${Math.round(performance.now() - t1)} ms`)
    }
  }
  console.log()
}
