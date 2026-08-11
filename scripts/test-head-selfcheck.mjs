/*
  Proves scripts/test-head.mjs actually catches things.

  A test for a test, which needs justifying. The justification is that this one
  found two real bugs in the checker within minutes of existing, and both were
  the kind that make a gate worse than no gate:

    1. It reported EVERY og:image as not forced to JPEG. Astro escapes `&` in an
       attribute, so a Sanity URL renders as `w=1200&#38;fm=jpg` and the test for
       `[?&]fm=jpg` matched nothing. A checker that fails on correct output gets
       switched off, and then it is guarding nothing.

    2. It failed /collage, /merchfolio and /video for having a pipe in og:title,
       when the actual defect is restating the SITE NAME. "Video | Motion Work"
       is fine. Testing for a symptom of the thing you have in mind rather than
       the thing itself is the same mistake as the animated-WebP diagnosis that
       burned two wrong theories before anyone printed the actual bytes.

  An unverified checker either passes vacuously or fails spuriously, and from CI
  you cannot tell which. So it is pointed at a hand-built correct site and
  required to be SILENT, then at one deliberate defect at a time and required to
  NAME each. The silent cases matter as much as the loud ones - they are what
  catches a false positive before it wastes a morning.

  Pure Node, no network, about a second. Runs before the build, since it needs no
  dist of its own.

  Usage: node scripts/test-head-selfcheck.mjs
*/
import {mkdir, writeFile, rm} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CHECKER = path.join(repo, 'scripts/test-head.mjs')
// Fixtures go under node_modules/.cache, which is already gitignored, so a run
// leaves nothing behind in the working tree.
const here = path.join(repo, 'node_modules', '.cache', 'head-selfcheck')

const page = ({
  title = 'About | Rumeau Design Co',
  description = 'About the studio.',
  canonical = 'https://rumeaudesign.co/about',
  ogTitle = 'About',
  siteName = 'Rumeau Design Co',
  ogImage = 'https://cdn.sanity.io/images/x/production/a-1200x630.jpg?w=1200&amp;h=630&amp;fm=jpg&amp;fit=crop',
  robots = null,
  h1 = '<h1>Hello</h1>',
  skip = '<a class="skip-link" href="#main-content">Skip to content</a>',
  main = '<main id="main-content" tabindex="-1">',
} = {}) =>
  `<!doctype html><html lang="en"><head>
<meta name="description" content="${description}" />
<title>${title}</title>
${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}
${ogTitle ? `<meta property="og:title" content="${ogTitle}" />` : ''}
${siteName ? `<meta property="og:site_name" content="${siteName}" />` : ''}
${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ''}
${robots ? `<meta name="robots" content="${robots}" />` : ''}
</head><body>${skip}
${main}${h1}</main></body></html>`

const run = (dir, env = {}) =>
  new Promise((resolve) => {
    execFile('node', [CHECKER, dir], {cwd: repo, env: {...process.env, ...env}}, (err, stdout) =>
      resolve({code: err?.code ?? 0, out: stdout}),
    )
  })

// A correct three-page site.
const build = async (name, overrides = {}) => {
  const dir = path.join(here, name)
  await rm(dir, {recursive: true, force: true})
  await mkdir(path.join(dir, 'about'), {recursive: true})
  await mkdir(path.join(dir, 'style-guide'), {recursive: true})
  const pages = {
    'index.html': {title: 'Rumeau Design Co', description: 'The homepage.', canonical: 'https://rumeaudesign.co/', ogTitle: 'Rumeau Design Co'},
    'about/index.html': {},
    'style-guide/index.html': {title: 'Style Guide | Rumeau Design Co', description: 'Design tokens.', canonical: 'https://rumeaudesign.co/style-guide', ogTitle: 'Style Guide', robots: 'noindex, nofollow'},
    ...overrides,
  }
  for (const [file, props] of Object.entries(pages)) {
    if (props === null) continue
    await writeFile(path.join(dir, file), page(props))
  }
  return dir
}

let bad = 0
const expectSilent = async (label, dir, env) => {
  const {code, out} = await run(dir, env)
  const ok = code === 0 && !out.includes('FAIL')
  console.log(`${ok ? 'PASS' : 'BROKEN'}  ${label}`)
  if (!ok) {
    bad += 1
    console.log(out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => `        ${l}`).join('\n'))
  }
}
const expectCaught = async (label, dir, needle, env) => {
  const {code, out} = await run(dir, env)
  const failing = out.split('\n').filter((l) => l.startsWith('FAIL'))
  const ok = code !== 0 && failing.some((l) => l.includes(needle))
  console.log(`${ok ? 'PASS' : 'BROKEN'}  ${label}`)
  if (!ok) {
    bad += 1
    console.log(`        wanted a FAIL mentioning "${needle}"; got:\n${failing.map((l) => `        ${l}`).join('\n') || '        (nothing failed)'}`)
  }
}

console.log('--- a correct build must be silent ---')
// Ampersands as &amp; - the form hand-written markup uses.
await expectSilent('clean build, &amp;-escaped image URLs', await build('fx-good'))
/*
  And as &#38;, which is what Astro actually emits. This is the form that broke
  the checker: it reported every og:image as not forced to JPEG because the
  character before `fm=jpg` was `;`, not `&`.
*/
await expectSilent(
  'clean build, &#38;-escaped image URLs (what Astro emits)',
  await build('fx-good-numeric', {
    'about/index.html': {ogImage: 'https://cdn.sanity.io/images/x/production/a-1200x630.jpg?w=1200&#38;h=630&#38;fm=jpg&#38;fit=crop'},
  }),
)
// And unescaped, so the decode cannot have broken the plain case.
await expectSilent(
  'clean build, unescaped image URLs',
  await build('fx-good-raw', {
    'about/index.html': {ogImage: 'https://cdn.sanity.io/images/x/production/a-1200x630.jpg?w=1200&h=630&fm=jpg&fit=crop'},
  }),
)

console.log('\n--- each defect must be named ---')
await expectCaught('a bare title (no site name)', await build('fx-bare', {'about/index.html': {title: 'About'}}), 'names the studio')
await expectCaught('the site name printed twice', await build('fx-double', {'about/index.html': {title: 'Rumeau Design Co | Rumeau Design Co'}}), 'twice')
await expectCaught('a missing title', await build('fx-notitle', {'about/index.html': {title: ''}}), 'has a <title>')
await expectCaught('zero-width characters in a title', await build('fx-stega', {'about/index.html': {title: 'About​​‌‍ | Rumeau Design Co'}}), 'zero-width')
await expectCaught('a missing description', await build('fx-nodesc', {'about/index.html': {description: ''}}), 'meta description')
await expectCaught('two pages sharing a description', await build('fx-dupdesc', {'about/index.html': {description: 'The homepage.'}}), 'share a meta description')
await expectCaught('a missing og:image', await build('fx-noog', {'about/index.html': {ogImage: ''}}), 'og:image')
await expectCaught('a relative og:image', await build('fx-relog', {'about/index.html': {ogImage: '/card.jpg'}}), 'absolute https')
await expectCaught('an og:image not forced to jpeg', await build('fx-webp', {'about/index.html': {ogImage: 'https://cdn.sanity.io/images/x/production/a-1200x630.webp?w=1200'}}), 'forced to jpeg')
await expectCaught('an og:title restating the site name', await build('fx-ogsuffix', {'about/index.html': {ogTitle: 'About | Rumeau Design Co'}}), 'og:title')
await expectCaught('an og:title restating it with an em dash', await build('fx-ogdash', {'about/index.html': {ogTitle: 'About — Rumeau Design Co'}}), 'og:title')
/*
  The false positive the first version produced. "Video | Motion Work" contains a
  pipe and is perfectly fine; the defect is restating the SITE NAME, not having a
  separator. Requiring silence here is what keeps the check honest.
*/
await expectSilent('an og:title with a pipe that is not the site name', await build('fx-ogpipe', {'about/index.html': {ogTitle: 'Video | Motion Work'}}))
/*
  A near-miss - "Rumeau Design" where site_name is "Rumeau Design Co". Must NOT
  fail: the code strips the full site name, so flagging this would be a red gate
  with no fix available.
*/
await expectSilent('an og:title ending in a near-miss of the site name', await build('fx-ognear', {'about/index.html': {ogTitle: 'About | Rumeau Design'}}))
// The offending value has to be printed, not just the route.
{
  const {out} = await run(await build('fx-ogshow', {'about/index.html': {ogTitle: 'About | Rumeau Design Co'}}))
  const line = out.split('\n').find((l) => l.startsWith('FAIL') && l.includes('og:title')) ?? ''
  const ok = line.includes('"About | Rumeau Design Co"')
  console.log(`${ok ? 'PASS' : 'BROKEN'}  the failure names the offending value, not just the page`)
  if (!ok) { bad += 1; console.log(`        got: ${line}`) }
}
await expectCaught('a missing canonical', await build('fx-nocanon', {'about/index.html': {canonical: ''}}), 'has a canonical')
await expectCaught('a canonical on the preview host', await build('fx-prevhost', {'about/index.html': {canonical: 'https://preview.rumeau-design-co.pages.dev/about'}}), 'real domain')
await expectCaught('a canonical with a trailing slash', await build('fx-slash', {'about/index.html': {canonical: 'https://rumeaudesign.co/about/'}}), 'trailing slash')
await expectCaught('a page with no <h1>', await build('fx-noh1', {'about/index.html': {h1: ''}}), 'has an <h1>')
await expectCaught('a page with two <h1>s', await build('fx-twoh1', {'about/index.html': {h1: '<h1>A</h1><h1>B</h1>'}}), 'more than one')
await expectCaught('a missing skip link', await build('fx-noskip', {'about/index.html': {skip: ''}}), 'skip link')
await expectCaught('a missing skip target', await build('fx-notarget', {'about/index.html': {main: '<main>'}}), 'skip target')
await expectCaught('an internal page left indexable', await build('fx-leak', {'style-guide/index.html': {title: 'Style Guide | Rumeau Design Co', description: 'Design tokens.', canonical: 'https://rumeaudesign.co/style-guide', ogTitle: 'Style Guide', robots: null}}), 'internal pages are noindexed')
await expectCaught('a real page accidentally noindexed', await build('fx-hidden', {'about/index.html': {robots: 'noindex'}}), 'accidentally noindexed')

console.log('\n--- the preview build has the opposite rule ---')
// On a preview build EVERY page must be noindex, including the real ones.
await expectCaught('a preview build leaving pages indexable', await build('fx-prev'), 'noindexes every page', {PUBLIC_IS_PREVIEW: 'true'})

console.log('\n--- no output at all is a failure, not a pass ---')
const empty = path.join(here, 'fx-empty')
await rm(empty, {recursive: true, force: true})
await mkdir(empty, {recursive: true})
await expectCaught('an empty dist directory', empty, 'no HTML')
const missing = path.join(here, 'fx-missing')
await rm(missing, {recursive: true, force: true})
await expectCaught('a dist directory that does not exist', missing, 'no built output')

await rm(here, {recursive: true, force: true})
console.log(bad ? `\n${bad} checker behaviour(s) BROKEN` : '\nThe checker catches every defect it claims to.')
process.exit(bad ? 1 : 0)
