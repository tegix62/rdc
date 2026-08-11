/*
  Why isn't the hero tile making anything wider?

  Chris set "Hero tile" on Chateau Seven and others and saw no change on the
  Portfolio grid. The CSS is fine - `.pf-item--hero` doubles the width and sits
  after the rule it overrides - so the suspicion is that the flag is being set
  on documents the grid never renders.

  That turned out to be right, and the grid now carries case studies too. What
  this still answers is the follow-on: a hero tile marked "serve exactly as
  uploaded" cannot be cropped at all, because cropping needs a transform and
  pass-through sends none - so it keeps its own shape however landscape the crop
  asked for.

  Reports where the flag is, and which of those tiles can actually honour it.

  Usage: node scripts/diagnose-hero-tiles.mjs
*/
import {createClient} from '@sanity/client'

const sanity = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
})

const docs = await sanity.fetch(`
  *[_type == "caseStudy"]{
    _id, title, pageType, heroTile,
    "slug": slug.current,
    "hasThumb": defined(thumbnail) || defined(mainImage),
    "noRecompress": thumbnail.noRecompress == true || mainImage.noRecompress == true,
    "thumbRef": thumbnail.asset._ref,
    "mainRef": mainImage.asset._ref,
    "parentTitle": parentBrand->title
  } | order(title asc)
`)

const settings = await sanity.fetch(`
  *[_type == "siteSettings"][0]{
    "featured": featuredWork[]->{title, pageType, heroTile}
  }
`)

const marked = docs.filter((d) => d.heroTile)
const gridItems = docs.filter((d) => d.pageType === 'Grid Item')
const studies = docs.filter((d) => d.pageType === 'Case Study')

console.log(`${docs.length} caseStudy documents: ` +
  `${gridItems.length} Grid Item, ${studies.length} Case Study, ` +
  `${docs.length - gridItems.length - studies.length} other/unset\n`)

console.log(`"Hero tile" is ticked on ${marked.length} document(s):\n`)
for (const d of marked) {
  const onGrid = d.pageType === 'Grid Item'
  const usable = onGrid && d.hasThumb
  console.log(
    `  ${usable ? 'WORKS  ' : 'NO-OP  '} ${String(d.title).slice(0, 42).padEnd(44)} ` +
      `${String(d.pageType ?? '(unset)').padEnd(12)}${d.hasThumb ? '' : ' [no image]'}`,
  )
  if (!onGrid) {
    console.log(
      `           ^ the Portfolio grid renders only Grid Items, so this does nothing there`,
    )
  }
}

if (!marked.length) {
  console.log('  (none - the flag is not set on any document)')
}

/*
  The homepage grid is the other place the flag is read, and it works
  differently: it renders whatever is picked in Site Settings, of either type.
  So a Case Study with the flag DOES widen there - which would make the
  behaviour look inconsistent rather than broken.
*/
const featured = settings?.featured ?? []
console.log(`\nHomepage grid: ${featured.length} tile(s) picked in Site Settings`)
if (featured.length) {
  for (const f of featured) {
    console.log(
      `  ${f.heroTile ? 'wide ' : '     '} ${String(f.title).slice(0, 42).padEnd(44)} ${f.pageType}`,
    )
  }
} else {
  console.log('  (empty - falling back to the case studies)')
}

/*
  A cropped pass-through image cannot actually be cropped - cropping needs a
  transform and pass-through sends none - so a hero tile marked "serve exactly
  as uploaded" keeps its own shape however landscape the crop asked for.
*/
const dims = (ref) => {
  const m = typeof ref === 'string' ? ref.match(/-(\d+)x(\d+)-/) : null
  return m ? {w: +m[1], h: +m[2]} : null
}
console.log('\nHero tiles that cannot be cropped (served exactly as uploaded):')
let uncroppable = 0
for (const d of marked) {
  if (!d.noRecompress) continue
  uncroppable += 1
  const dim = dims(d.thumbRef) ?? dims(d.mainRef)
  const shape = dim ? `${dim.w}x${dim.h} = ${(dim.w / dim.h).toFixed(2)}:1` : 'unknown'
  console.log(`  ${String(d.title).slice(0, 42).padEnd(44)} renders at ${shape}, not the crop`)
}
if (!uncroppable) console.log('  (none - every hero tile can be cropped)')

console.log('\n' + '='.repeat(70))
/*
  The original verdict here said a Case Study could not be widened because the
  Portfolio grid did not render one. That was true when written and is not any
  more - the grid now carries both types - so it is replaced rather than left to
  mislead the next person who runs this.
*/
if (!marked.length) {
  console.log('The flag is not set anywhere, so there is nothing to render wide.')
} else if (uncroppable) {
  console.log(`${uncroppable} hero tile(s) are served exactly as uploaded, so the`)
  console.log('landscape crop is skipped and they keep their own shape. Turn off')
  console.log('"serve exactly as uploaded" on those images to let them crop.')
} else {
  console.log('Every hero tile is somewhere it renders and can be cropped.')
}
console.log('='.repeat(70))
