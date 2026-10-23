/*
  NO WORKFLOW DOWNLOADS THE SITE'S PICTURES BY ACCIDENT.

  In October 2026 the Sanity plan's monthly bandwidth ran out and the site's
  pictures stopped loading for nine days. The cause was this repository's
  own automation: browser tests reloading the site's pictures dozens of
  times a run, and a six-hourly audit downloading every animated file in
  full. The fixes are in place - test browsers get blank pictures
  (scripts/lib/test-images-off.mjs), the site's pictures go through
  Cloudflare - and this keeps them in place as workflows are added:

    - every workflow that installs a browser switches the blank pictures on
      (the NODE_OPTIONS step), and does so after checkout, since the file
      does not exist before it
    - only screenshot-pages may turn real pictures back on (REAL_IMAGES),
      and only when someone asks for it by hand
    - nothing runs on a schedule except the jobs listed in SCHEDULED, each
      checked not to download pictures; a new scheduled job has to be added
      to that list on purpose

  No network. Usage: node scripts/test-workflows-no-pictures.mjs
*/
import {readdirSync, readFileSync} from 'node:fs'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

/*
  Scheduled jobs that are allowed. audit.yml and warm-loupe.yml are here
  because they exist, but they are switched off in GitHub (Actions ->
  disabled) and download pictures in full: do not switch them back on
  without Chris, and not before they stop downloading.
*/
const SCHEDULED = new Set(['audit.yml', 'warm-loupe.yml'])
const REAL_ALLOWED = new Set(['screenshot-pages.yml'])

const dir = '.github/workflows'
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))
let browsers = 0
const missing = []
const early = []
const real = []
const scheduled = []
for (const f of files) {
  const text = readFileSync(`${dir}/${f}`, 'utf8')
  if (/^\s+schedule:/m.test(text) && !SCHEDULED.has(f)) scheduled.push(f)
  if (/REAL_IMAGES/.test(text) && !REAL_ALLOWED.has(f)) real.push(f)
  if (!/playwright/.test(text)) continue
  browsers++
  const guard = text.indexOf('test-images-off.mjs')
  const checkout = text.indexOf('actions/checkout')
  if (guard < 0) missing.push(f)
  else if (checkout < 0 || guard < checkout) early.push(f)
}

check(`every workflow that opens a browser gets blank pictures (${browsers} of them)`, missing.length === 0, missing.join(', '))
check('and switches them on after checkout, not before', early.length === 0, early.join(', '))
check('real pictures only in screenshot-pages', real.length === 0, real.join(', '))
check('nothing new runs on a schedule', scheduled.length === 0, scheduled.length ? `${scheduled.join(', ')} - check it downloads no pictures, then add it to SCHEDULED` : '')

const shots = readFileSync(`${dir}/screenshot-pages.yml`, 'utf8')
check('screenshot-pages only uses real pictures when asked, by hand', /REAL_IMAGES: \$\{\{ inputs\.real_images && '1' \|\| '' \}\}/.test(shots) && !/^\s+schedule:/m.test(shots))

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
