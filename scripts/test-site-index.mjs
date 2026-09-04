/*
  The footer's site index - the one block on the site whose failure is silent.

  A project missing from an index does not look broken. The block is simply a
  line shorter, and nobody counts. That is the same class of thing test-meta
  exists for: output nobody ever looks at, shipping wrong for months.

  What it actually protects:

    - every project appears exactly once, including one with no category
    - the order does not depend on what Sanity happened to return
    - a category renamed in Studio still shows its work rather than dropping it
    - the blog category slugs keep the shape the category page's routes are
      built from, so a rename cannot silently move URLs a search engine has
      already indexed

  The footer listed those categories briefly and no longer does, but the slug
  assertions stay: lib/blogCategories.ts is still where the category page gets
  its routes, and pinning the shape is what makes a rename a visible change
  rather than a quiet 404.

  Pure logic, no network and no build, so it runs in the sandbox where a real
  build cannot reach Sanity.

  Usage: node scripts/test-site-index.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(name, a === b, a === b ? a : `got ${a}, wanted ${b}`)
}

const outdir = path.join(root, 'node_modules', '.cache', 'site-index-test')
await mkdir(outdir, {recursive: true})
const bundleOf = async (entry, name) => {
  const outfile = path.join(outdir, name)
  await build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'error',
  })
  return import(outfile)
}

const {groupWorkByCategory, UNCATEGORISED} = await bundleOf(
  'src/lib/siteIndex.ts',
  'siteIndex.mjs',
)
const {BLOG_CATEGORIES, categorySlug} = await bundleOf(
  'src/lib/blogCategories.ts',
  'blogCategories.mjs',
)

// --- grouping ----------------------------------------------------------------

const work = [
  {title: 'Chateau Seven', slug: 'chateau-seven', category: 'Brand Identity'},
  {title: 'Adelante Barbell Club', slug: 'adelante', category: 'Merch & Apparel'},
  {title: 'Hug a Mug', slug: 'hug-a-mug', category: 'Brand Identity'},
  {title: 'Two Point Oh', slug: 'two-point-oh', category: 'Typography'},
  {title: 'Unfiled Piece', slug: 'unfiled'},
]

const groups = groupWorkByCategory(work)

eq(
  'groups come back in Studio order, not Sanity order',
  groups.map((g) => g.name),
  ['Brand Identity', 'Merch & Apparel', 'Typography', UNCATEGORISED],
)

const listed = groups.flatMap((g) => g.items.map((i) => i.slug)).sort()
eq(
  'every project is listed exactly once',
  listed,
  ['adelante', 'chateau-seven', 'hug-a-mug', 'two-point-oh', 'unfiled'],
)

eq(
  'a project with no category is kept, not dropped',
  groups.find((g) => g.name === UNCATEGORISED)?.items.map((i) => i.slug),
  ['unfiled'],
)

check(
  'the fallback group sorts last',
  groups[groups.length - 1].name === UNCATEGORISED,
  groups[groups.length - 1].name,
)

// A category renamed in Studio is not in CATEGORY_ORDER. Its work must still
// appear - silently dropping a project is the exact failure this guards.
const renamed = groupWorkByCategory([
  {title: 'A', slug: 'a', category: 'Packaging & Print'},
  {title: 'B', slug: 'b', category: 'Brand Identity'},
])
eq(
  'an unknown category still appears, after the known ones',
  renamed.map((g) => g.name),
  ['Brand Identity', 'Packaging & Print'],
)

// --- junk in, nothing out ----------------------------------------------------

eq('a missing slug is skipped', groupWorkByCategory([{title: 'No slug'}]), [])
eq('a missing title is skipped', groupWorkByCategory([{slug: 'no-title'}]), [])
eq('an empty category string falls back', groupWorkByCategory([
  {title: 'T', slug: 's', category: '   '},
]).map((g) => g.name), [UNCATEGORISED])
eq('a non-array returns nothing', groupWorkByCategory(null), [])
eq('an empty list returns nothing', groupWorkByCategory([]), [])

// --- blog category slugs match the routes ------------------------------------

/*
  The category page builds its routes with the same categorySlug() this asserts
  against, so what is really being pinned here is the SHAPE of those URLs. A
  change to the rule moves every category URL at once, and this is what makes
  that a failing test rather than a quiet 404 on links already indexed.
*/
eq('slug: two words', categorySlug('Brand Identity'), 'brand-identity')
eq('slug: an ampersand collapses with its spaces', categorySlug('Merch & Apparel'), 'merch-apparel')
eq('slug: one word', categorySlug('Typography'), 'typography')

const slugs = Object.keys(BLOG_CATEGORIES).map(categorySlug)
eq(
  'every blog category has a distinct slug',
  slugs.length,
  new Set(slugs).size,
)
check(
  'no slug contains a run of hyphens or a stray one at an edge',
  slugs.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)),
  slugs.join(', '),
)

console.log(`\n${failures ? `${failures} FAILED` : 'all passed'}`)
process.exit(failures ? 1 : 0)
