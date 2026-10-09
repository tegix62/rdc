/*
  The collage prototype exists on preview and NOT on production.

  WHY THIS EXISTS

  Chris asked for everything to go live except the collage work. The page is
  gated by returning no paths from getStaticPaths when PUBLIC_IS_PREVIEW is
  unset, which should mean production never builds the route at all.

  "Should mean" is the problem. The flag is an environment variable set in
  one workflow and absent from another, and the only thing standing between
  "absent" and "accidentally set" is a YAML file nobody re-reads. So the
  claim is checked against both live sites instead: a 404 from production
  and a 200 from preview, which is the pair that actually matters.

  Checks both directions on purpose. A test that only asserts production
  404s would also pass if the page were broken everywhere, which is the
  failure that would waste the most time.

  READ-ONLY.

  Usage: node scripts/check-prototype-hidden.mjs [prod-url] [preview-url] [path]
*/
const PROD = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const PREVIEW = (process.argv[3] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PATH = process.argv[4] ?? '/collage/red-kettle'

/*
  Follows redirects, deliberately.

  The first version used redirect:'manual' and failed on preview with a 308
  - Cloudflare sending /collage/red-kettle to the trailing-slash form, which
  then serves the page perfectly well. That is a hop, not an absence, and
  reporting it as one sent me looking at a build that was already correct.

  The question is whether the URL ends up serving a page, so the answer is
  the status at the end of the chain. The hop is reported alongside it,
  because "200 after a redirect" and "200 directly" are different facts and
  conflating them is how the next person gets confused in the other
  direction.
*/
const status = async (base) => {
  try {
    const res = await fetch(`${base}${PATH}`, {headers: {'cache-control': 'no-cache'}})
    return {code: res.status, via: res.redirected ? ` (after a redirect to ${res.url})` : ''}
  } catch (e) {
    return {code: `error: ${e?.message ?? e}`, via: ''}
  }
}

const prod = await status(PROD)
const preview = await status(PREVIEW)

console.log(`${PATH}`)
console.log(`  production  ${PROD}  ->  ${prod.code}${prod.via}`)
console.log(`  preview     ${PREVIEW}  ->  ${preview.code}${preview.via}`)

let failed = false
if (prod.code !== 404) {
  console.log(`\n  Production answers ${prod.code}; the prototype should not exist there at all.`)
  failed = true
}
if (preview.code !== 200) {
  console.log(`\n  Preview answers ${preview.code}; the prototype should be there to work on.`)
  failed = true
}

if (failed) process.exit(1)
console.log('\nThe prototype is on preview and absent from production.')
