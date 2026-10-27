/*
  The site's licensed fonts, fetched from Sanity at build time.

  The repository is public, so a licensed font cannot be committed to it:
  anyone could download it from GitHub, which a webfont licence does not
  allow. Instead the file is uploaded in Studio's Fonts tool
  (studio/tools/FontsTool.tsx) as a Sanity asset labelled "site-font", and
  this step copies every such asset into public/fonts/licensed/ (ignored by
  git) before the site is built, so the site serves it from its own address.

  Never fails the build: with Sanity unreachable or nothing uploaded, the
  pages fall back to the next font in their stack, and a warning says so.

  Usage: node scripts/fetch-fonts.mjs
*/
import {createClient} from '@sanity/client'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(root, 'public', 'fonts', 'licensed')
const client = createClient({projectId: '8337vjtf', dataset: 'production', apiVersion: '2024-01-01', useCdn: false})

try {
  const fonts = await client.fetch(`*[_type == "sanity.fileAsset" && label == "site-font"]{url, originalFilename}`)
  await mkdir(dir, {recursive: true})
  for (const f of fonts) {
    // Its own name, kept to plain characters, so the page can refer to it.
    const name = path.basename(f.originalFilename ?? '').replace(/[^\w.-]/g, '-')
    if (!/\.(otf|ttf|woff2?)$/i.test(name)) continue
    const res = await fetch(f.url)
    if (!res.ok) throw new Error(`${name}: ${res.status}`)
    await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()))
    console.log(`[fetch-fonts] ${name}`)
  }
  if (!fonts.length) console.warn('[fetch-fonts] no fonts uploaded in Studio (Fonts tool)')
} catch (e) {
  console.warn(`[fetch-fonts] skipped: ${e instanceof Error ? e.message : e}`)
}
