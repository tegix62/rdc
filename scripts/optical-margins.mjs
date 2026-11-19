/*
  A build step after proxy-images.mjs: optical margin alignment for every
  page's h1 and h2 (scripts/lib/optical-margins.mjs). PREVIEW ONLY while it
  is a trial - Chris approves a type change before it goes live - so it does
  nothing unless PUBLIC_IS_PREVIEW is "true".

  Usage: node scripts/optical-margins.mjs [dist-dir]
*/
import {readdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {opticalMargins} from './lib/optical-margins.mjs'

const DIST = process.argv[2] ?? 'dist'
if (process.env.PUBLIC_IS_PREVIEW !== 'true') {
  console.log('[optical-margins] not the preview build - headings left as set')
  process.exit(0)
}

async function* htmlFiles(dir) {
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* htmlFiles(p)
    else if (e.name.endsWith('.html')) yield p
  }
}

let pages = 0
let headings = 0
for await (const file of htmlFiles(DIST)) {
  const before = await readFile(file, 'utf8')
  const {html, count} = opticalMargins(before)
  if (count) {
    await writeFile(file, html)
    pages++
    headings += count
  }
}
console.log(`[optical-margins] ${headings} heading(s) on ${pages} page(s) set into the margin`)
