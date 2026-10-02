/*
  How many tiles the BUILT Portfolio page actually contains.

  WHY THIS EXISTS

  diagnose-new-tiles answers "is it in the dataset and does the page's
  query accept it", and for Chris's batch the answer was yes for all 30.
  That is not the same claim as "it is on the page he is looking at": the
  site is static, so a tile reaches a visitor only once a build has run
  AFTER the publish and the CDN has stopped serving the previous HTML.

  So this counts tiles in the served HTML and compares that with what the
  dataset says there should be. A difference is a stale build or a cached
  page; no difference means the tiles are there and something else - a
  filter, a hard refresh - explains what he is seeing.

  Counts `class="pf-item` occurrences rather than parsing: the markup is
  one such element per tile, and anything clever here would be a second
  thing that can be wrong.

  READ-ONLY.

  Usage: SANITY_API_TOKEN=... node scripts/check-portfolio-live.mjs [url]
*/
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const TOKEN = process.env.SANITY_API_TOKEN
const URL = process.argv[2] ?? 'https://rumeaudesign.co/portfolio'

const expected = TOKEN
  ? await (async () => {
      const res = await fetch(
        `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(
          `count(*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
             && (defined(thumbnail) || defined(mainImage))
             && !(_id in path("drafts.**"))])`,
        )}`,
        {headers: {Authorization: `Bearer ${TOKEN}`}},
      )
      return res.ok ? (await res.json()).result : null
    })()
  : null

const res = await fetch(URL, {headers: {'cache-control': 'no-cache'}})
if (!res.ok) {
  console.error(`${URL}: ${res.status} ${res.statusText}`)
  process.exit(2)
}
const html = await res.text()

const tiles = (html.match(/class="[^"]*\bpf-item\b/g) ?? []).length
const build = html.match(/name="build-commit" content="([^"]*)"/)?.[1] ?? '(none stated)'
const age = res.headers.get('age')
const cf = res.headers.get('cf-cache-status')

console.log(`${URL}`)
console.log(`  build-commit     ${build}`)
console.log(`  cf-cache-status  ${cf ?? '(none)'}${age ? `, age ${age}s` : ''}`)
console.log(`  tiles in HTML    ${tiles}`)
if (expected !== null) console.log(`  tiles in dataset ${expected}`)

if (expected !== null && tiles !== expected) {
  console.log(
    `\nThe page is ${expected - tiles} tile(s) behind the dataset. The build ran before the` +
      '\nlast publish, or the CDN is still serving the previous HTML.',
  )
  process.exit(1)
}
console.log('\nThe page contains every tile the dataset says it should.')
