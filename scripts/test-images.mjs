// Tests for the responsive-image helpers in src/lib/image.ts.
//
// These guard failures that are invisible in review and in a screenshot: a
// srcset with an unencoded comma still renders an image (the browser falls
// back to src), it just silently stops being responsive. Same for a variant
// that upscales past the source, or a crop whose aspect drifts between
// widths and makes the layout jump mid-scroll.
//
// Run: npm run test:images

import {build} from 'esbuild'
import {rm} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// Bundled into the repo root so bare imports resolve against node_modules,
// and because Node can't resolve extensionless TS imports on its own.
const outfile = path.join(root, '.image-test.build.mjs')

await build({
  stdin: {
    contents: `export * from './src/lib/image.ts'`,
    resolveDir: root,
    sourcefile: 'image-test-entry.js',
    loader: 'js',
  },
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  // src/lib/sanity.ts reads Astro's import.meta.env, which doesn't exist here.
  define: {'import.meta.env': '{}'},
  logLevel: 'error',
})

const {imageDimensions, buildSrcSet, imageUrl, originalUrl, isPassThrough, mayBeAnimated, sourceExtension, socialCardUrl} = await import(
  `file://${outfile}`
)
await rm(outfile)

let failures = 0
const check = (name, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (pass) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`)
  }
}

const img = (ref) => ({_type: 'image', asset: {_type: 'reference', _ref: ref}})
const wide = img('image-abc123-2400x1600-jpg')
const small = img('image-zzz999-400x300-png')
const widthsOf = (srcset) => [...srcset.matchAll(/ (\d+)w/g)].map((m) => Number(m[1]))

console.log('imageDimensions')
check('reads landscape', imageDimensions(wide), {width: 2400, height: 1600})
check('reads portrait', imageDimensions(img('image-a-800x1200-png')), {width: 800, height: 1200})
check('null on unparseable ref', imageDimensions(img('nonsense')), null)
check('null on missing image', imageDimensions(undefined), null)

console.log('\nimageUrl')
/*
  imageUrl, not urlFor. The raw builder is private to lib/image.ts now - it
  throws on an image field with no file attached, and letting call sites reach it
  is what took the site down twice. imageUrl returns the same builder for a real
  asset, so this assertion is unchanged in substance.
*/
const url = imageUrl(wide).width(800).url()
check('negotiates format', url.includes('auto=format'), true)
check('sets quality', url.includes('q=80'), true)

console.log('\nbuildSrcSet - sizing')
check('caps at the requested width', Math.max(...widthsOf(buildSrcSet(wide, 1200))), 1200)
check('offers phone-sized variants', widthsOf(buildSrcSet(wide, 1200)).includes(320), true)
check('never upscales past the source', Math.max(...widthsOf(buildSrcSet(small, 1200))), 400)
check('no srcset when only one width fits', buildSrcSet(img('image-a-200x200-png'), 300), undefined)

console.log('\nbuildSrcSet - syntax')
// The bug this file exists for: cropping makes Sanity emit rect=x,y,w,h, and
// an unencoded comma there splits one candidate into four broken ones.
const cropped = buildSrcSet(wide, 600, {width: 600, height: 750})
const entries = cropped.split(',').map((e) => e.trim())
const wellFormed = entries.every((e) => {
  const parts = e.split(' ')
  return parts.length === 2 && parts[0].startsWith('https://') && /^\d+w$/.test(parts[1])
})
check('every candidate is "<url> <n>w"', wellFormed, true)
check('commas inside urls are encoded', cropped.includes('%2C'), true)
check('no raw comma inside a url', /https:\/\/[^\s]*,[^\s]*/.test(cropped), false)

console.log('\nbuildSrcSet - crop stability')
const ratios = new Set(
  [...cropped.matchAll(/[?&]w=(\d+)&h=(\d+)/g)].map((m) => (Number(m[1]) / Number(m[2])).toFixed(3)),
)
check('aspect identical across variants', ratios.size, 1)
check('matches the requested ratio', [...ratios][0], (600 / 750).toFixed(3))


console.log('\npass-through - "serve exactly as uploaded"')
// The whole point is that these bytes are never re-encoded. If a transform
// parameter ever leaks into this URL, hand-compressed art silently starts
// getting a second lossy pass - invisible in the page, permanent in the file.
const plain = img('image-abc123-1200x800-png')
const kept = {...plain, noRecompress: true}

check('flag detected', isPassThrough(kept), true)
check('absent flag is not pass-through', isPassThrough(plain), false)
check('explicit false is not pass-through', isPassThrough({...plain, noRecompress: false}), false)

const orig = originalUrl(kept)
check('url points at the asset', orig.endsWith('/abc123-1200x800.png'), true)
check('NO query string at all', orig.includes('?'), false)
check('no format conversion', /[?&]fm=|auto=format/.test(orig), false)
check('no quality parameter', /[?&]q=/.test(orig), false)
check('no resizing', /[?&]w=|[?&]h=/.test(orig), false)
check('malformed ref returns null', originalUrl({_ref: 'not-an-image'}), null)

// Dimensions must survive, or pass-through reintroduces the layout shift
// that the whole Img component exists to prevent.
check('dimensions still available', JSON.stringify(imageDimensions(kept)), JSON.stringify({width: 1200, height: 800}))


console.log('\nanimated sources bypass the transform pipeline')
// Measured cause of the homepage being heavier than Webflow: an animated WebP
// hand-compressed to under 1 MB came back from the CDN at 10,721 KB after a
// w=800&q=80 resize. Animations must never be re-encoded.
const gif = img('image-anim1-800x800-gif')
const staticPng = img('image-flat1-800x800-png')

// The extension is only a hint about whether probing is worthwhile. It is
// explicitly NOT a verdict: this dataset has `-gif` references holding static
// PNG and `-webp` references holding JPEG, and trusting them disabled
// responsive sizing on dozens of ordinary images.
check('gif is worth probing', mayBeAnimated(gif), true)
check('webp is worth probing', mayBeAnimated(img('image-y-800x800-webp')), true)
check('png is never probed', mayBeAnimated(staticPng), false)
check('jpg is never probed', mayBeAnimated(img('image-z-800x800-jpg')), false)
check('extension parsed', sourceExtension(gif), 'gif')
check('extension parsed (webp)', sourceExtension(img('image-x-10x10-webp')), 'webp')

// A gif reference alone must NOT force pass-through - only a positive probe.
check('gif reference alone is not pass-through', isPassThrough(gif), false)
check('gif with positive probe is pass-through', isPassThrough(gif, true), true)
check('png still goes through the pipeline', isPassThrough(staticPng), false)
// The probe result is passed in as the second argument for animated WebP.
check('animated webp forced to pass-through', isPassThrough(img('image-y-800x800-webp'), true), true)
check('static webp untouched', isPassThrough(img('image-y-800x800-webp'), false), false)

check('gif url carries no transform', originalUrl(gif).includes('?'), false)
check('gif url keeps its extension', originalUrl(gif).endsWith('.gif'), true)


console.log('\na source the layout will stretch is encoded better')
/*
  All six case study heroes are narrower than a 2x desktop needs - measured,
  from 1.18x on Adelante to 3.69x on Two Point Oh. Nothing can add detail that
  was never captured, but an image about to be enlarged 2.5x is the worst
  possible candidate for q80: every ringing artifact is enlarged with it.

  Checked on the srcset rather than only the src, because once a srcset exists
  the browser chooses from it - improving only the fallback would improve the
  one URL almost nobody is served.
*/
const short = img('image-small1-1200x800-jpg')   // asked for 2400: stretched
const ample = img('image-big1-3200x2000-jpg')    // asked for 2400: pixels spare

const shortSet = buildSrcSet(short, 2400)
const ampleSet = buildSrcSet(ample, 2400)

check('a stretched source is delivered at higher quality', /[?&]q=92/.test(shortSet), true)
check('a stretched source is sharpened', /[?&]sharp=15/.test(shortSet), true)
check('every candidate gets it, not just the largest', shortSet.split(', ').every((c) => c.includes('q=92')), true)
// The default must be untouched, or this quietly becomes a site-wide quality
// bump and a site-wide byte increase.
check('a source with pixels to spare keeps q80', /[?&]q=80/.test(ampleSet) && !/q=92/.test(ampleSet), true)
check('a source with pixels to spare is not sharpened', /sharp=/.test(ampleSet), false)
// Sharpening is the one knob here that can make things worse; a big number
// prints halos along every edge. Pinned so a future edit has to mean it.
check('the sharpen amount stays modest', /sharp=(\d+)/.exec(shortSet)?.[1] === '15', true)

console.log('\nsocial cards')
/*
  Every page now emits an og:image, falling back to the wordmark for the pages
  that have no image of their own. Nothing about this is visible on the site: a
  wrong crop only shows up when someone pastes a link into Slack.

  The wordmark is wide and short - 2000x600 here, and the real one is similar -
  which is what makes the padded variant necessary and what makes it easy to get
  wrong.
*/
const wordmark = img('image-mark1-2000x600-png')
const photo = img('image-photo1-1600x1200-jpg')

const card = socialCardUrl(photo)
check('a card is 1200 wide', /[?&]w=1200(&|$)/.test(card), true)
check('a card is 630 tall', /[?&]h=630(&|$)/.test(card), true)
// An animated source left to auto-format comes back as an animated WebP, which
// every scraper rejects outright.
check('a card is forced to jpeg', /[?&]fm=jpg(&|$)/.test(card), true)
check('a card is absolute', card.startsWith('https://cdn.sanity.io/'), true)
check('a photo card is cropped to fill', /[?&]fit=crop(&|$)/.test(card), true)

/*
  THE ONE THAT ACTUALLY CAUGHT SOMETHING.

  fit('fill') alone did NOT pad. Given both a width and a height,
  @sanity/image-url computes a `rect=x,y,w,h` crop of the source before the CDN
  ever sees fit=fill - so the wordmark was still being sliced down the middle
  and the white background was never used. ignoreImageParams() drops the rect.

  Asserted on the absence of `rect`, because that is the thing that was wrong
  and the thing a future edit to this chain would silently reintroduce.
*/
const padded = socialCardUrl(wordmark, {pad: true})
check('the padded card does not crop the source', /[?&]rect=/.test(padded), false)
check('the padded card pads instead', /[?&]fit=fill(&|$)/.test(padded), true)
check('the padded card pads onto white', /[?&]bg=ffffff(&|$)/.test(padded), true)
check('the padded card is still 1200x630', /w=1200/.test(padded) && /h=630/.test(padded), true)

// The empty-field crash class: a saved-but-fileless image field is an object,
// so a truthiness check waves it through and the raw builder throws on it.
check('no file attached yields null', socialCardUrl({_type: 'image', noRecompress: true}), null)
check('undefined yields null', socialCardUrl(undefined), null)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
