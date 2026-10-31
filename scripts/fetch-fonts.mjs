/*
  Licensed fonts, put in place for the PREVIEW build only.

  The repository is public, so a licensed font cannot be committed to it:
  anyone could download it from GitHub, which a webfont licence does not
  allow. It is uploaded in Studio's Fonts tool (studio/tools/FontsTool.tsx)
  as a Sanity asset labelled "site-font", and this step copies every such
  asset into public/fonts/licensed/ (ignored by git) before a preview build.
  A production build gets none, so the live site is unchanged until Chris
  says otherwise.

  First use: Friend (Simon Walker), which Chris has a web licence for, on
  the road map's headings - tried in one contained place after the whole
  homepage in it was "too transformational for this website right now".

  Never fails the build: with Sanity unreachable or nothing uploaded, the
  pages fall back to the next font in their stack, and a warning says so.

  Usage: node scripts/fetch-fonts.mjs
*/
import {mkdir, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(root, 'public', 'fonts', 'licensed')

// Whatever an earlier build left behind goes, so a production build starts clean.
await rm(dir, {recursive: true, force: true})

if (process.env.PUBLIC_IS_PREVIEW !== 'true') {
  console.log('[fetch-fonts] not a preview build: no licensed fonts')
} else {
  // Plain fetch, not @sanity/client: a dropped connection there surfaced as an
  // uncaught socket error that the try below could not catch, failing the build.
  const QUERY = '*[_type == "sanity.fileAsset" && label == "site-font"]{url, originalFilename}'
  try {
    const answer = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(QUERY)}`)
    if (!answer.ok) throw new Error(`query: ${answer.status}`)
    const fonts = (await answer.json()).result ?? []
    await mkdir(dir, {recursive: true})
    for (const f of fonts) {
      // Its own name, kept to plain characters, so the page can refer to it.
      const name = path.basename(f.originalFilename ?? '').replace(/[^\w.-]/g, '-')
      if (!/\.(otf|ttf|woff2?)$/i.test(name)) continue
      const res = await fetch(f.url)
      if (!res.ok) throw new Error(`${name}: ${res.status}`)
      await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()))
      console.log(`[fetch-fonts] ${name}, from Studio`)
    }
    if (!fonts.length) console.warn('[fetch-fonts] no fonts uploaded in Studio (Fonts tool)')
  } catch (e) {
    console.warn(`[fetch-fonts] licensed fonts skipped: ${e instanceof Error ? e.message : e}`)
  }
}
