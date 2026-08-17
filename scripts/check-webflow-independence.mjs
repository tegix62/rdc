/*
  Does anything on this site still load from Webflow?

  WHY THIS EXISTS, AND WHY IT RUNS BEFORE A SUBSCRIPTION IS CANCELLED

  Cancelling Webflow stops serving whatever is hosted there. Assets are the
  danger: an <img> pointing at cdn.prod.website-files.com renders perfectly
  today and turns into a broken image the moment the plan lapses. Nothing in
  the repository would show it either, because case study bodies and image
  fields come from Sanity - a URL pasted into Studio months ago is invisible to
  every source-level grep.

  So this reads the BUILT output, which is the only place Sanity's content and
  this project's templates exist side by side. If it passes, no page on the
  site fetches anything from Webflow, and the subscription can end without a
  single image breaking.

  Deliberately not limited to images. A stylesheet, a font, or a script left
  pointing at Webflow fails the same way, and a link to a webflow.io preview
  URL in prose becomes a dead link for a reader rather than a broken asset for
  a browser - worth knowing about too, even though it is the milder failure.

  Usage: node scripts/check-webflow-independence.mjs [dist]
*/
import {readdirSync, readFileSync, statSync} from 'node:fs'
import path from 'node:path'

const dist = process.argv[2] ?? 'dist'

/*
  Every host Webflow has served assets from, including the older ones - a site
  migrated over several years accumulates URLs from whichever CDN was current
  when each asset was uploaded, and the old hostnames stay in the content long
  after Webflow stopped issuing them.
*/
const WEBFLOW_HOSTS = [
  'website-files.com', // covers assets. / cdn.prod. / uploads. variants
  'uploads-ssl.webflow.com',
  'webflow.io', // *.webflow.io staging/preview subdomains
  'webflow.com',
]

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    // Only text formats can carry a URL. Skipping binaries also keeps this
    // from reading every image in the build.
    else if (/\.(html|css|js|mjs|json|xml|txt|svg)$/i.test(entry)) files.push(full)
  }
}

try {
  walk(dist)
} catch (error) {
  console.error(`Could not read ${dist}/ - run \`npm run build\` first.`)
  console.error(error.message)
  process.exit(1)
}

console.log(`Scanning ${files.length} built files in ${dist}/ for Webflow-hosted URLs\n`)

const hits = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const host of WEBFLOW_HOSTS) {
    if (!text.includes(host)) continue
    /*
      Report the surrounding URL, not just the filename. "something in
      about.html mentions webflow" is not actionable; the actual URL says
      whether it is an image to re-upload, a stylesheet to drop, or a link in
      prose to repoint.
    */
    const urls = new Set(text.match(new RegExp(`[^\\s"'()<>]*${host.replace('.', '\\.')}[^\\s"'()<>]*`, 'gi')) ?? [])
    for (const url of urls) hits.push({file: path.relative(dist, file), url})
  }
}

if (hits.length === 0) {
  console.log('ok    nothing on this site loads from Webflow.')
  console.log('      The subscription can be cancelled without breaking a page.')
  process.exit(0)
}

console.log(`FAIL  ${hits.length} Webflow URL(s) still referenced by the built site:\n`)
for (const {file, url} of hits) console.log(`  ${file}\n    ${url}`)
console.log(`
Each of these stops working when the Webflow plan lapses. For an image, save
the file and re-upload it in Sanity Studio; for a link in prose, repoint it.
Do that BEFORE cancelling - once the plan ends, the originals are gone and
there is nothing left to download.`)
process.exit(1)
