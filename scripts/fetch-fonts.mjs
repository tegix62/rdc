/*
  The type trial's fonts, put in place for the PREVIEW build only.

  Chris, of the homepage type trial: "just make sure it's preview only - may
  roll back to what we got". So a production build gets none of these
  files, and the live site's output is what it was before the trial.

  Two sources, both copied into public/fonts/ (ignored by git) before a
  preview build:

  - preview-fonts/ in this repository: the free (SIL OFL) stand-ins -
    Cheltenham Classic and its squeezed cut, Roboto Serif, Noto Serif -
    each with its licence.
  - Sanity: licensed fonts, which cannot be committed because this
    repository is public and a webfont licence does not allow the files to
    be handed out. They are uploaded in Studio's Fonts tool
    (studio/tools/FontsTool.tsx) as assets labelled "site-font" and land in
    public/fonts/licensed/.

  Never fails the build: with Sanity unreachable or nothing uploaded, the
  trial falls back to the next font in its stack, and a warning says so.

  Usage: node scripts/fetch-fonts.mjs
*/
import {cp, mkdir, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const out = path.join(root, 'public', 'fonts')

// Whatever an earlier preview build left behind goes, so a production build starts clean.
await rm(out, {recursive: true, force: true})

if (process.env.PUBLIC_IS_PREVIEW !== 'true') {
  console.log('[fetch-fonts] not a preview build: no trial fonts')
} else {
  await cp(path.join(root, 'preview-fonts'), out, {recursive: true})
  console.log('[fetch-fonts] the free stand-ins, from preview-fonts/')
  const dir = path.join(out, 'licensed')
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
