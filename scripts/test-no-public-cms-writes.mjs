/*
  Nothing reachable from the open internet may write to the CMS.

  WHY THIS EXISTS - THE INCIDENT IT COMES FROM

  On 17 August 2026, ordinary traffic on /contact caused several hundred
  unintended deploys of rumeaudesign.co in a few minutes. Nothing was hacked
  and no single piece of code was buggy. Two reasonable-looking decisions,
  made weeks apart, combined:

    1. functions/api/form-progress.ts incremented a counter on a PUBLISHED
       Sanity document, with no spam protection, on the stated grounds that
       the worst case was "a wrong number on a dashboard".

    2. A Sanity webhook fires a GitHub repository_dispatch on any
       create/update/delete of a published document, and both deploy
       workflows listen for it - so that the live site can never lag behind
       the CMS.

  Each is defensible alone. Together they mean one unauthenticated HTTP
  request triggers one full production deploy, with nothing bounding the rate.

  The lesson is not "remember to be careful with that endpoint". It is that
  the CMS is now part of the deploy trigger, so a CMS write from a public
  endpoint is a deploy trigger from a public endpoint, however small the write
  looks. That property cannot be held in anyone's head across two files and a
  dashboard setting - so it is asserted here instead.

  WHAT IS CHECKED

  Every file under functions/ - which is exactly the set of things Cloudflare
  exposes as a public HTTP endpoint - for anything that could mutate Sanity:
  a mutate URL, a write token, or the client's mutating methods.

  Reads are fine and are not flagged. The site reads Sanity at BUILD time and
  a Function may legitimately query it; querying does not fire a webhook.

  Usage: node scripts/test-no-public-cms-writes.mjs
*/
import {readdirSync, readFileSync, statSync} from 'node:fs'
import path from 'node:path'

const ROOT = 'functions'

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|js|mjs)$/.test(entry)) files.push(full)
  }
}
try {
  walk(ROOT)
} catch (error) {
  console.error(`Could not read ${ROOT}/: ${error.message}`)
  process.exit(1)
}

/*
  Each pattern names the specific thing it forbids, because the failure
  message has to be actionable to someone who has just written the line and
  does not know this incident happened.
*/
const FORBIDDEN = [
  {
    pattern: /api\.sanity\.io\/[^'"`\s]*\/data\/mutate/,
    what: 'a Sanity mutate endpoint',
  },
  {
    pattern: /SANITY_WRITE_TOKEN/,
    what: 'the Sanity write token',
  },
  {
    // The client library's mutating surface. `.fetch(` is deliberately absent:
    // reading is allowed.
    pattern: /\.(createIfNotExists|createOrReplace|patch|commit|delete)\s*\(/,
    what: "a Sanity client mutation (createIfNotExists / createOrReplace / patch / commit / delete)",
  },
]

const findings = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  /*
    Comments are stripped before matching. This file's own subject matter
    means the fixed endpoint DESCRIBES the thing it no longer does, at length,
    and a checker that cannot tell an explanation from an instruction would
    fail on the very file that documents the fix.
  */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  for (const {pattern, what} of FORBIDDEN) {
    const line = code.split('\n').findIndex((l) => pattern.test(l))
    if (line !== -1) findings.push({file, what, text: code.split('\n')[line].trim().slice(0, 100)})
  }
}

const bar = (n) => '='.repeat(n)
console.log(`\n${bar(74)}\nPublic endpoints must not write to the CMS - ${files.length} file(s)\n${bar(74)}\n`)

if (!findings.length) {
  for (const file of files) console.log(`ok    ${file} - no CMS write`)
  console.log('\nAll checks passed.\n')
  process.exit(0)
}

for (const {file, what, text} of findings) {
  console.log(`FAIL  ${file}`)
  console.log(`        uses ${what}`)
  console.log(`        ${text}`)
}
console.log(`
Everything under functions/ is a PUBLIC HTTP endpoint, and a Sanity webhook
turns any published-document change into a production deploy. So a CMS write
from here means anyone on the internet can trigger unlimited deploys of the
live site - which is exactly what happened on 17 August 2026.

Reading Sanity is fine. If this endpoint needs to RECORD something, use D1
(see db/schema.sql and functions/api/contact.ts, which stores enquiries there
for the same reason).
`)
process.exit(1)
