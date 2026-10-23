/*
  The build's last step: email addresses out of every built page's source.
  See scripts/lib/hide-emails.mjs for what is rewritten and why.

  Then a report of any address still anywhere in the output - a page's
  <head>, a script, the RSS feed, a JavaScript bundle - which this step
  cannot hide. Reported, not failed: a deploy should not stop over it, but
  the build log says where to look.

  Usage: node scripts/hide-emails.mjs [dist-dir]
*/
import {readdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {hideEmails, addressesIn} from './lib/hide-emails.mjs'

const DIST = process.argv[2] ?? 'dist'
const TEXT = /\.(html|xml|txt|json|js|mjs|webmanifest)$/

async function* files(dir) {
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (TEXT.test(e.name)) yield p
  }
}

let pages = 0
let hidden = 0
const left = new Map()
for await (const file of files(DIST)) {
  let text = await readFile(file, 'utf8')
  if (file.endsWith('.html')) {
    const {html, count} = hideEmails(text)
    if (count) {
      await writeFile(file, html)
      text = html
      pages++
      hidden += count
    }
  }
  // Server code is not sent to visitors; everything else is.
  if (file.includes(`${path.sep}_worker`) || file.endsWith('_noop-middleware.mjs') || /manifest_.*\.mjs$/.test(file)) continue
  const still = addressesIn(text)
  if (still.length) left.set(path.relative(DIST, file), [...new Set(still)])
}
console.log(`[hide-emails] ${hidden} email address(es) on ${pages} page(s) hidden from the page source`)
for (const [file, list] of left) console.warn(`[hide-emails] still readable in ${file}: ${list.join(', ')}`)
