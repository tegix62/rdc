/*
  Every redirect lands on a page that exists.

  WHY THIS MATTERS MORE THE DAY THE DOMAIN MOVES

  public/_redirects is the entire reason the old Webflow URLs keep working. The
  moment DNS moves, every inbound link, bookmark and search result for
  /case-studies/<slug> and /post/<slug> arrives here and is 301'd somewhere. A
  301 to a 404 is worse than no redirect at all: it tells a crawler the old page
  moved permanently to a dead end, so the ranking it was carrying is thrown away
  rather than passed on.

  THE FAILURE THIS CATCHES

  Nothing tied the redirect file to the content. Chris deleted a case study
  today - "More Kilos, Less Egos" - and case studies have gone from 13 to 5 over
  the project. Any deletion can orphan a redirect, silently, and the symptom
  only appears after cutover, on exactly the URLs that used to rank. This time
  the three targets survived; that was luck rather than design, and luck is not
  a launch check.

  Reads dist/, so it knows what was actually built rather than what the CMS said
  at some point. External targets are skipped - the point is internal dead ends.

  Usage: node scripts/test-redirects.mjs [dir]     (default: dist)
*/
import {readFile, access} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.resolve(root, process.argv[2] ?? 'dist')

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const exists = async (p) => {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

const source = await readFile(path.join(root, 'public/_redirects'), 'utf8')

/*
  `from  to  status`, whitespace separated, # for comments. Parsed rather than
  regexed out, so a malformed line is reported instead of silently skipped -
  a redirect Cloudflare cannot parse is a redirect that does not exist.
*/
const rules = []
const malformed = []
for (const [i, raw] of source.split('\n').entries()) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const parts = line.split(/\s+/)
  if (parts.length < 2) {
    malformed.push(`line ${i + 1}: "${line}"`)
    continue
  }
  const [from, to, status] = parts
  rules.push({line: i + 1, from, to, status: status ?? '302'})
}

console.log(`${rules.length} redirect rules in public/_redirects\n`)

check('every line parses', malformed.length === 0, malformed.join(' | ') || 'no malformed rules')

// A 302 tells crawlers the OLD url is still canonical, which throws away the
// ranking this file exists to pass on.
const notPermanent = rules.filter((r) => r.status !== '301')
check(
  'every redirect is a 301',
  notPermanent.length === 0,
  notPermanent.map((r) => `line ${r.line}: ${r.from} -> ${r.status}`).join(', ') || `${rules.length} rules`,
)

/*
  The one that would have bitten. Astro's directory build format writes
  /about/index.html, and the root is /index.html.
*/
const targetExists = async (to) => {
  if (/^https?:\/\//.test(to)) return true // external, not ours to verify
  const clean = to.split('#')[0].split('?')[0].replace(/\/$/, '')
  if (clean === '' || clean === '/') return exists(path.join(dir, 'index.html'))
  return (
    (await exists(path.join(dir, clean, 'index.html'))) ||
    (await exists(path.join(dir, `${clean}.html`)))
  )
}

const dead = []
for (const r of rules) {
  if (!(await targetExists(r.to))) dead.push(`line ${r.line}: ${r.from} -> ${r.to}`)
}
check(
  'every redirect target is a page that exists',
  dead.length === 0,
  dead.join(' | ') || `${rules.length} targets resolve`,
)

// A rule whose source is also a real page never fires, and quietly shadows it.
const shadowed = []
for (const r of rules) {
  if (await targetExists(r.from)) shadowed.push(`line ${r.line}: ${r.from}`)
}
check(
  'no redirect shadows a page the site actually builds',
  shadowed.length === 0,
  shadowed.join(', ') || 'no rule hides a real page',
)

// Two rules for one source: the first wins and the second is dead weight, but
// more importantly it means someone edited this file twice with different ideas.
const bySource = new Map()
for (const r of rules) bySource.set(r.from, [...(bySource.get(r.from) ?? []), r.line])
const dupes = [...bySource.entries()].filter(([, lines]) => lines.length > 1)
check(
  'no source is redirected twice',
  dupes.length === 0,
  dupes.map(([from, lines]) => `${from} on lines ${lines.join(' and ')}`).join('; ') || `${bySource.size} distinct sources`,
)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
