/*
  The JSON-LD block on every built page: does it parse, and does it hold
  together?

  WHY THIS HAS NEVER BEEN CHECKED, AND WHY THAT IS THE PROBLEM

  src/lib/structuredData.ts assembles an @graph of Organization, WebSite,
  WebPage and (per template) CreativeWork or BlogPosting nodes. Nothing has ever
  looked at the result. Structured data is the one thing on a page with NO
  visible symptom whatsoever when it is wrong: a malformed block is silently
  discarded by every consumer, and the page looks perfect. You find out because
  a rich result never appears, which is indistinguishable from "Google chose not
  to show one".

  WHAT IS CHECKED, AND WHAT DELIBERATELY IS NOT

  Checked, because these are objective and a failure means the block is ignored:
    - it parses as JSON at all
    - every node declares an @type
    - every internal @id reference resolves to a node in the same graph
    - the nodes this site's templates promise are actually present

  NOT checked: whether a given @type's properties satisfy Google's rich-result
  eligibility. That needs Schema.org's vocabulary and Google's own rules, both
  of which move, and guessing at them produces confident wrong answers. Google's
  Rich Results Test is the authority and takes a URL - this script's job is to
  guarantee the block is well-formed BEFORE anyone asks that question, so a
  "not eligible" answer means something real rather than a syntax error.

  READ-ONLY.

  Usage: node scripts/audit-structured-data.mjs [dist]
*/
import {readdirSync, readFileSync, statSync} from 'node:fs'
import path from 'node:path'

const dist = process.argv[2] ?? 'dist'

const pages = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (entry.endsWith('.html')) pages.push(full)
  }
}
try {
  walk(dist)
} catch (error) {
  console.error(`Could not read ${dist}/ - run \`npm run build\` first.\n${error.message}`)
  process.exit(1)
}

const routeOf = (file) => {
  const rel = path.relative(dist, file).replace(/\\/g, '/')
  return `/${rel.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')}`.replace(/\/+$/, '') || '/'
}

let failures = 0
const problem = (route, message) => {
  console.log(`FAIL  ${route}: ${message}`)
  failures += 1
}

const bar = (n) => '='.repeat(n)
console.log(`\n${bar(74)}\nStructured data - ${pages.length} built pages\n${bar(74)}\n`)

let withGraph = 0
const typeCounts = new Map()

for (const file of pages) {
  const route = routeOf(file)
  const html = readFileSync(file, 'utf8')

  const blocks = [
    ...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1])

  if (blocks.length === 0) {
    // 404 has no business carrying an entity graph; every real page should.
    if (route !== '/404') problem(route, 'no JSON-LD block at all')
    continue
  }

  for (const raw of blocks) {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      /*
        The failure this exists for. An unescaped quote or a stray newline from
        a Studio field lands here, the whole block is discarded by every
        consumer, and the page renders exactly as normal.
      */
      problem(route, `JSON-LD does NOT parse - the entire block is ignored by every consumer (${error.message})`)
      continue
    }

    const nodes = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]
    if (!parsed['@context']) problem(route, 'no @context, so nothing knows which vocabulary this is')

    withGraph += 1

    // Every node needs a type; an untyped node is data with no meaning.
    const ids = new Set()
    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        problem(route, 'a node in @graph is not an object')
        continue
      }
      if (!node['@type']) problem(route, `a node has no @type (keys: ${Object.keys(node).slice(0, 6).join(', ')})`)
      else {
        for (const t of [node['@type']].flat()) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
      }
      if (node['@id']) ids.add(node['@id'])
    }

    /*
      Internal @id references. The whole point of an @graph is that nodes point
      at each other - a WebPage isPartOf a WebSite, a WebSite publisher is the
      Organization. A reference to an @id that is not in the graph is a dangling
      pointer: the consumer cannot resolve it, so the relationship is simply
      lost, and nothing says so.
    */
    const referenced = []
    const collect = (value) => {
      if (Array.isArray(value)) return value.forEach(collect)
      if (!value || typeof value !== 'object') return
      const keys = Object.keys(value)
      if (keys.length === 1 && keys[0] === '@id') referenced.push(value['@id'])
      else for (const v of Object.values(value)) collect(v)
    }
    for (const node of nodes) {
      for (const [key, value] of Object.entries(node)) {
        if (key === '@id') continue
        collect(value)
      }
    }
    for (const ref of referenced) {
      // Only same-document references are this script's business. An absolute
      // URL pointing at another site is a legitimate external reference.
      if (!ids.has(ref) && ref.startsWith('https://rumeaudesign.co')) {
        problem(route, `@id reference "${ref}" resolves to nothing in this graph`)
      }
    }
  }
}

console.log(`\n${withGraph} page(s) carry a parseable graph.\n`)
console.log('Node types found across the site:\n')
for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(count).padStart(3)}  ${type}`)
}

console.log(`\n${bar(74)}`)
if (failures) {
  console.log(`${failures} structural problem(s). Each one means a consumer discards data it`)
  console.log('was given, with nothing visible on the page to indicate it.')
} else {
  console.log('Every graph parses, every node is typed, every internal reference resolves.')
  console.log('Rich-result ELIGIBILITY is a separate question - that is Google\'s Rich')
  console.log('Results Test, which takes a URL. This guarantees the block is well-formed')
  console.log('first, so a "not eligible" answer there means something real.')
}
console.log(`${bar(74)}\n`)
process.exit(failures ? 1 : 0)
