/*
  The last build step: every built page's pictures load through /img/ (the
  Cloudflare route in functions/img/[[path]].ts) instead of straight from
  cdn.sanity.io. See scripts/lib/proxy-images.mjs for what is and is not
  rewritten, and why.

  Usage: node scripts/proxy-images.mjs [dist-dir]
*/
import {readdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {rewriteHtml} from './lib/proxy-images.mjs'

const DIST = process.argv[2] ?? 'dist'

async function* htmlFiles(dir) {
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* htmlFiles(p)
    else if (e.name.endsWith('.html')) yield p
  }
}

let pages = 0
let pictures = 0
for await (const file of htmlFiles(DIST)) {
  const before = await readFile(file, 'utf8')
  const {html, count} = rewriteHtml(before)
  if (count) {
    await writeFile(file, html)
    pages++
    pictures += count
  }
}
console.log(`[proxy-images] ${pictures} picture address(es) on ${pages} page(s) now load through /img/`)
