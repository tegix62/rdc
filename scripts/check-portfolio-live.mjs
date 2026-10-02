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

/*
  A matching TOTAL is not the same as a given tile being present - one
  could be missing while another arrived. NEEDLES names specific tiles to
  look for; each tile's alt text is its title, so the title is what to
  search the markup for.

  It also reports WHERE each one sits, because the grid groups projects
  first, then tiles that link to a project, then the rest - so a new tile
  with no parent is last by construction, and "I cannot see it" and "it is
  at the bottom of eighty tiles" look identical from a browser.
*/
const positions = [...html.matchAll(/class="[^"]*\bpf-item\b/g)].map((m) => m.index)

/*
  SLUGS, not guessed titles.

  The first version of this took titles typed from memory and matched them
  case-sensitively, which reported three tiles missing that were sitting
  right there under a different capitalisation. A slug is exact and the
  title comes from the dataset, so the only thing being tested is whether
  the page contains it.

  The title is compared against HTML-escaped markup, because a title with
  an ampersand or an apostrophe does not appear in the source as typed.
*/
const escapeHtml = (t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const slugs = (process.env.SLUGS ?? '').split(',').map((n) => n.trim()).filter(Boolean)
if (slugs.length && TOKEN) {
  const list = slugs.map((s) => `"${s}"`).join(', ')
  const res2 = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(
      `*[_type == "caseStudy" && slug.current in [${list}] && !(_id in path("drafts.**"))]{
         "path": slug.current, title, "hasThumb": defined(thumbnail), "hasMain": defined(mainImage), _updatedAt
       }`,
    )}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  const docs = res2.ok ? (await res2.json()).result : []
  console.log('\n  looking for, by slug:')
  for (const slug of slugs) {
    const doc = docs.find((d) => d.path === slug)
    if (!doc) {
      console.log(`    NOT PUBLISHED  ${slug}`)
      continue
    }
    const title = String(doc.title ?? '')
    const at = [title, escapeHtml(title)].map((t) => html.indexOf(t)).find((i) => i !== -1)
    const image = doc.hasThumb ? 'thumbnail' : doc.hasMain ? 'mainImage' : 'NO IMAGE'
    if (at === undefined) {
      console.log(`    MISSING        ${slug}  "${title}"  [${image}, published ${doc._updatedAt}]`)
      continue
    }
    const nth = positions.filter((p) => p < at).length
    console.log(`    present        ${slug}  tile ${nth} of ${tiles}  [${image}]`)
  }
}

const needles = (process.env.NEEDLES ?? '').split(',').map((n) => n.trim()).filter(Boolean)
for (const needle of needles) {
  const at = html.toLowerCase().indexOf(needle.toLowerCase())
  if (at === -1) {
    console.log(`    MISSING   ${needle}`)
    continue
  }
  const nth = positions.filter((p) => p < at).length
  console.log(`    present   ${needle.padEnd(40)} tile ${nth} of ${tiles}`)
}

/*
  THE TWO LISTS, SIDE BY SIDE.

  Counting tiles and searching for a few names kept producing results that
  contradicted each other - a matching total of 80, three names absent, and
  a fourth present at a position that might be a different document with a
  similar name. All of that is guesswork about a set, so this prints the
  set: every title the page renders, against every title the dataset says
  it should.

  Each tile's alt text is its title, so the alts inside the grid ARE the
  page's list.
*/
if (process.env.LIST === '1' && TOKEN) {
  const res3 = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(
      `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"]
         && (defined(thumbnail) || defined(mainImage))
         && !(_id in path("drafts.**"))].title`,
    )}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  const wanted = res3.ok ? (await res3.json()).result : []

  /*
    Numeric entities too, not just the five named ones.

    Astro writes `&` as `&#38;` and `"` as `&#34;`, so the named list alone
    reported "DumpStat, a D&D Podcast" and '"Isolate" by blxckfeather' as
    missing from a page that was rendering both - and listed them a few lines
    below as unexpected EXTRAS, in escaped form, which is the signature of a
    decoder gap rather than a missing tile. Three titles chased twice for that.

    Decimal and hex, and `&amp;` last: unescaping it first would turn
    `&amp;#38;` into a second round of decoding.
  */
  const unescape = (t) =>
    t
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  // Only the alts inside the grid: the page has other images (the logo row,
  // the footer) and counting those would inflate the comparison.
  const gridStart = html.indexOf('id="pf-grid"')
  const grid = gridStart === -1 ? html : html.slice(gridStart)
  const onPageTitles = [...grid.matchAll(/alt="([^"]*)"/g)].map((m) => unescape(m[1])).filter(Boolean)

  const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase()
  const have = new Set(onPageTitles.map(norm))
  const missing = wanted.filter((t) => !have.has(norm(String(t ?? ''))))
  const wantedSet = new Set(wanted.map((t) => norm(String(t ?? ''))))
  const extra = onPageTitles.filter((t) => !wantedSet.has(norm(t)))

  console.log(`\n  the page renders ${onPageTitles.length} tile alt(s); the dataset wants ${wanted.length}`)
  console.log(`\n  in the dataset, NOT on the page (${missing.length}):`)
  for (const t of missing) console.log(`    ${t}`)
  console.log(`\n  on the page, not in the dataset's list (${extra.length}):`)
  for (const t of extra) console.log(`    ${t}`)
}

if (expected !== null && tiles !== expected) {
  console.log(
    `\nThe page is ${expected - tiles} tile(s) behind the dataset. The build ran before the` +
      '\nlast publish, or the CDN is still serving the previous HTML.',
  )
  process.exit(1)
}
console.log('\nThe page contains every tile the dataset says it should.')
