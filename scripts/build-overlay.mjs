// Bundles Sanity's visual-editing overlay into public/ as a single
// self-hosted file, but only for builds that asked for visual editing.
//
// Why not just import it from a component? Astro compiles every <script> it
// finds whether or not the surrounding conditional renders, so importing the
// overlay normally drags a ~640 KB chunk - plus React, framer-motion and a
// syntax highlighter - into every build, including production ones that never
// load it. Emitting it here instead keeps it out of Astro's graph entirely:
// production builds get no file at all.
//
// Why not a CDN? An editing tool that silently stops working when a third
// party has a bad day is a poor trade for a file we can serve ourselves - and
// a CDN can't be verified from a sandbox without egress to it.
//
// Runs as part of `npm run build`. Safe to run any time; it's a no-op unless
// PUBLIC_SANITY_VISUAL_EDITING is true.

import {build} from 'esbuild'
import {mkdir, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outfile = path.join(root, 'public', 'sanity-visual-editing.js')

const enabled = process.env.PUBLIC_SANITY_VISUAL_EDITING === 'true'

if (!enabled) {
  // Remove a file left behind by a previous preview build so it can't be
  // served - or deployed - by a production build.
  if (existsSync(outfile)) {
    await rm(outfile)
    console.log('[overlay] visual editing off - removed stale public/sanity-visual-editing.js')
  } else {
    console.log('[overlay] visual editing off - nothing to build')
  }
  process.exit(0)
}

await mkdir(path.dirname(outfile), {recursive: true})

// A tiny entry rather than bundling the package directly, so the overlay
// starts itself on load and reports what happened. Presentation only says
// "unable to connect" when this fails, which says nothing about the cause.
const entry = `
import {enableVisualEditing} from '@sanity/visual-editing'
try {
  enableVisualEditing()
  console.info('[sanity] visual editing enabled')
} catch (err) {
  console.error('[sanity] visual editing failed to start:', err)
}
`

const result = await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: 'visual-editing-entry.js',
    loader: 'js',
  },
  outfile,
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  // The overlay's dependencies ship React-flavoured code guarded by these.
  define: {'process.env.NODE_ENV': '"production"'},
  logLevel: 'warning',
  metafile: true,
})

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0
console.log(`[overlay] built public/sanity-visual-editing.js (${Math.round(bytes / 1024)} KB)`)
