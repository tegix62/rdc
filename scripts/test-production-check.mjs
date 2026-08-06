/*
  Proves scripts/check-production-build.mjs actually catches things.

  This project has already shipped a check that could never fail - the audit's
  "did the deploy land" wait, which measured the previous build three times
  while I chased a bug that had already been fixed. A launch gate is exactly
  the wrong place to repeat that, because the only run where it matters is the
  one nobody watches.

  So: build a dist that is genuinely correct, confirm the checker passes it,
  then break it one specific way at a time and confirm the checker fails with
  the check name it should. If a check is ever weakened into a no-op, the case
  for it here goes red.

  No network and no Sanity - the fixtures are written by hand, which also means
  this runs in the sandbox where a real build cannot.

  Usage: node scripts/test-production-check.mjs
*/
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {tmpdir} from 'node:os'
import {promisify} from 'node:util'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const run = promisify(execFile)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CHECKER = path.join(root, 'scripts', 'check-production-build.mjs')

const ORIGIN = 'https://rumeaudesign.co'
const SHA = 'abc123def456'

const STATIC = [
  '/',
  '/portfolio',
  '/about',
  '/video',
  '/collage',
  '/merchfolio',
  '/blog',
  '/privacy-policy',
]
const WORK = ['/work/dumpstat', '/work/hug-a-mug']

/*
  A run of characters from the stega alphabet. Not a decodable payload - the
  detector matches on the character class and a length of four or more, which
  is the thing being tested. Written as escapes so the fixture stays legible;
  the file would otherwise contain invisible text.
*/
const STEGA_RUN = '​​​​‌‍⁢﻿'

/* The @graph Layout.astro emits, in miniature. */
function graphFor(route) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type': 'Organization', '@id': `${ORIGIN}/#organization`, name: 'Rumeau Design Co'},
      {'@type': 'WebSite', '@id': `${ORIGIN}/#website`, url: `${ORIGIN}/`},
      {'@type': 'WebPage', '@id': `${ORIGIN}${route}#webpage`, url: `${ORIGIN}${route}`},
    ],
  }
}

function page(
  route,
  {stamp = SHA, canonical, noindex = false, extraHead = '', body = '', jsonLd} = {},
) {
  const href = canonical ?? `${ORIGIN}${route}`
  const ld = jsonLd === false ? '' : (jsonLd ?? JSON.stringify(graphFor(route)))
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="build-commit" content="${stamp}">
${href === false ? '' : `<link rel="canonical" href="${href}">`}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
${ld ? `<script type="application/ld+json">${ld}</script>` : ''}
${extraHead}
<title>${route}</title>
</head><body><h1>${route}</h1>${body}</body></html>
`
}

function fileFor(dist, route) {
  return route === '/'
    ? path.join(dist, 'index.html')
    : path.join(dist, ...route.slice(1).split('/'), 'index.html')
}

/* A dist that should pass everything. Every mutation starts from this. */
async function writeCleanDist(dist, mutate = {}) {
  const routes = [...STATIC, ...WORK]
  for (const route of routes) {
    const file = fileFor(dist, route)
    await mkdir(path.dirname(file), {recursive: true})
    await writeFile(file, page(route, mutate[route] ?? {}))
  }
  // 404 is a real built page with a canonical, and deliberately absent from
  // the sitemap.
  await writeFile(path.join(dist, '404.html'), page('/404', mutate['/404'] ?? {}))

  await writeFile(
    path.join(dist, 'robots.txt'),
    mutate.robots ?? `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
  )

  const locs = mutate.sitemapRoutes ?? routes
  await writeFile(
    path.join(dist, 'sitemap.xml'),
    mutate.sitemap ??
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((r) => `  <url><loc>${ORIGIN}${r === '/' ? '/' : r}</loc></url>`).join('\n')}
</urlset>
`,
  )
}

async function check(dist, {sha = SHA} = {}) {
  const args = [CHECKER, '--dist', dist, '--origin', ORIGIN]
  if (sha) args.push('--sha', sha)
  try {
    const {stdout} = await run(process.execPath, args, {cwd: root})
    return {code: 0, out: stdout}
  } catch (err) {
    return {code: err.code ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}`}
  }
}

const cases = []
let failed = 0

/*
  `expect` is the check name that must appear in the output, or null for the
  clean case. Asserting the name rather than just the exit code is the point:
  a checker that failed everything for one reason would still exit 1 on all of
  these and look healthy.
*/
async function scenario(name, expect, mutate, opts = {}) {
  const dist = await mkdtemp(path.join(tmpdir(), 'prodcheck-'))
  try {
    await writeCleanDist(dist, mutate)
    if (opts.after) await opts.after(dist)
    const {code, out} = await check(dist, opts)

    let ok
    let why
    if (expect === null) {
      ok = code === 0
      why = ok ? 'passed' : `expected a pass, got:\n${indent(out)}`
    } else {
      const named = out.includes(`[${expect}]`)
      ok = code === 1 && named
      why = ok
        ? `caught [${expect}]`
        : code !== 1
          ? `expected exit 1, got ${code}`
          : `exit 1 but never reported [${expect}]:\n${indent(out)}`
    }

    cases.push({name, ok, why})
    if (!ok) failed += 1
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name} - ${ok ? why : why.split('\n')[0]}`)
    if (!ok && why.includes('\n')) console.log(indent(why.split('\n').slice(1).join('\n')))
  } finally {
    await rm(dist, {recursive: true, force: true})
  }
}

const indent = (s) =>
  s
    .split('\n')
    .map((l) => `        ${l}`)
    .join('\n')

// The control. If this ever fails, every case below is meaningless.
await scenario('a correct build passes', null, {})

await scenario('catches the editing overlay being shipped', 'overlay-file', {}, {
  after: (dist) => writeFile(path.join(dist, 'sanity-visual-editing.js'), '/* 640 KB */'),
})

await scenario('catches a page loading the editing overlay', 'overlay-reference', {
  '/about': {extraHead: '<script type="module" src="/sanity-visual-editing.js"></script>'},
})

await scenario('catches stega markers in the copy', 'stega', {
  '/': {body: `<p>Rumeau Design Co${STEGA_RUN}</p>`},
})

await scenario('catches noindex on a real page', 'noindex', {'/portfolio': {noindex: true}})

await scenario('catches a canonical pointing at the preview host', 'canonical', {
  '/about': {canonical: 'https://preview.rumeau-design-co.pages.dev/about'},
})

await scenario('catches a missing canonical', 'canonical', {'/video': {canonical: false}})

await scenario('catches a canonical naming the wrong page', 'canonical', {
  '/video': {canonical: `${ORIGIN}/about`},
})

await scenario('catches a page from a different build', 'build-stamp', {
  '/blog': {stamp: 'staleaf00'},
})

await scenario(
  'catches an unstamped build when no sha is pinned',
  'build-stamp',
  Object.fromEntries([...STATIC, ...WORK, '/404'].map((r) => [r, {stamp: 'dev'}])),
  {sha: ''},
)

await scenario('catches a link to the preview host', 'stray-host', {
  '/': {body: '<a href="https://preview.rumeau-design-co.pages.dev/portfolio">work</a>'},
})

await scenario('catches robots.txt still disallowing everything', 'robots', {
  robots: 'User-agent: *\nDisallow: /\n',
})

await scenario('catches robots.txt naming no sitemap', 'robots', {
  robots: 'User-agent: *\nAllow: /\n',
})

await scenario('catches robots.txt pointing at the wrong sitemap', 'robots', {
  robots: `User-agent: *\nAllow: /\n\nSitemap: https://preview.rumeau-design-co.pages.dev/sitemap.xml\n`,
})

// The quiet one: a preview-flagged build emits a perfectly valid sitemap that
// silently omits every case study.
await scenario('catches a sitemap with no case studies in it', 'sitemap', {
  sitemapRoutes: STATIC,
})

await scenario('catches a sitemap missing a static page', 'sitemap', {
  sitemapRoutes: [...STATIC.filter((r) => r !== '/about'), ...WORK],
})

await scenario('catches a sitemap URL with no page behind it', 'sitemap', {
  sitemapRoutes: [...STATIC, ...WORK, '/work/never-built'],
})

await scenario('catches a page with no structured data', 'json-ld', {'/about': {jsonLd: false}})

await scenario('catches structured data that does not parse', 'json-ld', {
  '/about': {jsonLd: '{"@context": "https://schema.org", "@graph": [ '},
})

await scenario('catches structured data missing the Organization', 'json-ld', {
  '/about': {
    jsonLd: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {'@type': 'WebSite', '@id': `${ORIGIN}/#website`},
        {'@type': 'WebPage', url: `${ORIGIN}/about`},
      ],
    }),
  },
})

await scenario('catches structured data describing a different page', 'json-ld', {
  '/about': {
    jsonLd: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {'@type': 'Organization', '@id': `${ORIGIN}/#organization`},
        {'@type': 'WebSite', '@id': `${ORIGIN}/#website`},
        {'@type': 'WebPage', url: `${ORIGIN}/video`},
      ],
    }),
  },
})

await scenario('catches structured data stating an empty value', 'json-ld', {
  '/about': {
    jsonLd: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {'@type': 'Organization', '@id': `${ORIGIN}/#organization`, name: ''},
        {'@type': 'WebSite', '@id': `${ORIGIN}/#website`},
        {'@type': 'WebPage', url: `${ORIGIN}/about`},
      ],
    }),
  },
})

await scenario('catches a sitemap on the wrong origin', 'sitemap', {
  sitemap: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...STATIC, ...WORK]
  .map((r) => `  <url><loc>https://preview.rumeau-design-co.pages.dev${r}</loc></url>`)
  .join('\n')}
</urlset>
`,
})

console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed ? 1 : 0)
