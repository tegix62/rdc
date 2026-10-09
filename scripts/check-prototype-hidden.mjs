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

const status = async (base) => {
  try {
    const res = await fetch(`${base}${PATH}`, {redirect: 'manual', headers: {'cache-control': 'no-cache'}})
    return res.status
  } catch (e) {
    return `error: ${e?.message ?? e}`
  }
}

const prod = await status(PROD)
const preview = await status(PREVIEW)

console.log(`${PATH}`)
console.log(`  production  ${PROD}  ->  ${prod}`)
console.log(`  preview     ${PREVIEW}  ->  ${preview}`)

let failed = false
if (prod !== 404) {
  console.log(`\n  Production answers ${prod}; the prototype should not exist there at all.`)
  failed = true
}
if (preview !== 200) {
  console.log(`\n  Preview answers ${preview}; the prototype should be there to work on.`)
  failed = true
}

if (failed) process.exit(1)
console.log('\nThe prototype is on preview and absent from production.')
