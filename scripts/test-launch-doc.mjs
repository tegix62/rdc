/*
  Every rumeaudesign.co URL in docs/launch.md must be something the site
  actually serves.

  WHY THIS EXISTS

  The runbook told Chris to check `https://rumeaudesign.co/sitemap-index.xml` and
  then to submit that URL to Google Search Console. Nothing has ever served it -
  `sitemap-index.xml` is the filename @astrojs/sitemap produces, and this project
  deliberately does not use that plugin. It was wrong in both places from the day
  it was written.

  That is a worse class of bug than it looks. The runbook is the one document
  followed under time pressure, on the day when the site is half-moved and
  nothing can be assumed to work. A wrong URL in it does not read as a typo in a
  document; it reads as "the deploy is broken", at the exact moment there is no
  spare attention to tell the difference. And the second occurrence had no
  symptom at all: a sitemap submitted to Search Console that 404s is simply never
  read, and nothing tells you.

  So the doc is checked against the build, the same way everything else here is
  checked against the artefact rather than trusted.

  Runs after `npm run build`. No network.

  Usage: node scripts/test-launch-doc.mjs [dir]     (default: dist)
*/
import {readdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.resolve(root, process.argv[2] ?? 'dist')
const DOC = path.join(root, 'docs/launch.md')

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
}

let doc
try {
  doc = await readFile(DOC, 'utf8')
} catch {
  console.log('FAIL  docs/launch.md is missing - the cutover runbook is the one document launch day depends on')
  process.exit(1)
}

/*
  Which paths the build serves. Both shapes matter: a page is a directory with an
  index.html (so /about is dist/about/index.html), while sitemap.xml and
  robots.txt are files at the top level.
*/
const served = new Set()
const walk = async (d, prefix = '') => {
  for (const entry of await readdir(d, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      served.add(`${prefix}/${entry.name}`)
      await walk(path.join(d, entry.name), `${prefix}/${entry.name}`)
    } else if (entry.name === 'index.html') {
      served.add(prefix || '/')
    } else {
      served.add(`${prefix}/${entry.name}`)
    }
  }
}
try {
  await stat(dir)
  await walk(dir)
} catch {
  console.log(`FAIL  no built output at ${path.relative(root, dir) || dir} - run \`npm run build\` first`)
  process.exit(1)
}

/*
  Every rumeaudesign.co URL the doc mentions, from inline code spans and prose
  alike. The trailing-punctuation strip is needed because these appear at the end
  of sentences, and "sitemap.xml." is not a path.
*/
const urls = [...doc.matchAll(/https?:\/\/(?:www\.)?rumeaudesign\.co([^\s`)"'>,]*)/g)].map((m) =>
  m[1].replace(/[.,;:]+$/, ''),
)

const paths = [...new Set(urls.map((u) => u.split(/[?#]/)[0]).map((p) => p.replace(/(.)\/$/, '$1')))]

console.log(`${paths.length} distinct rumeaudesign.co path(s) referenced in docs/launch.md\n`)

const missing = paths.filter((p) => {
  if (p === '' || p === '/') return false
  return !served.has(p)
})

check(
  'every URL the runbook tells you to open is served by the build',
  missing.length === 0,
  missing.length ? missing.join(', ') : paths.filter((p) => p && p !== '/').join(', '),
)

/*
  The sitemap specifically, named rather than left to the general check.

  A generic "some path is missing" failure is exactly the thing that gets skimmed
  past at 1am. This one says which file the site really serves, so the fix is in
  the failure message rather than in whoever reads it.
*/
const sitemapRefs = paths.filter((p) => p.includes('sitemap'))
const realSitemap = [...served].find((p) => /^\/sitemap.*\.xml$/.test(p))
check(
  'the runbook names the sitemap this site actually builds',
  sitemapRefs.length > 0 && sitemapRefs.every((p) => p === realSitemap),
  sitemapRefs.length === 0
    ? 'the runbook mentions no sitemap at all - Search Console submission is a launch step'
    : `runbook says ${sitemapRefs.join(', ')}; build serves ${realSitemap ?? 'no sitemap'}`,
)

// robots.txt is the other launch-day check with no visible symptom when wrong.
check(
  'the runbook checks robots.txt, and the build serves one',
  doc.includes('robots.txt') && served.has('/robots.txt'),
  served.has('/robots.txt') ? 'both present' : 'no robots.txt in the build',
)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nThe runbook points at real URLs.')
process.exit(failures ? 1 : 0)
