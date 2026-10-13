/*
  Captions: the words, the markup, and the links that go into it.

  A caption is the line under a photograph, and now it can carry a link to
  the photographer. Three things can go wrong, and none of them is visible
  until a visitor meets it:

    - a caption not yet converted (still a string) stops rendering, or
      renders with its markup showing
    - a cleared rich-text caption draws an empty box under the picture
    - a link goes somewhere it should not, or carries a `javascript:` href

  Pure functions, no network, so it runs in front of every push.

  Usage: node scripts/test-caption.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}
const eq = (name, actual, expected) =>
  check(name, actual === expected, actual === expected ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`)

const outdir = path.join(root, 'node_modules', '.cache', 'caption-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'caption.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/caption.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  logLevel: 'error',
})
const {captionHtml, captionText} = await import(outfile)

const block = (children, markDefs = []) => ({_type: 'block', _key: 'b', style: 'normal', markDefs, children})
const span = (text, marks = []) => ({_type: 'span', _key: Math.random().toString(36).slice(2), text, marks})
const link = (href) => ({_type: 'link', _key: 'L', href})

// --- strings still work --------------------------------------------------
eq('a plain string renders as its own text', captionHtml('Photo: Jane Doe'), 'Photo: Jane Doe')
eq('a string is escaped, not trusted', captionHtml('<b>x</b> & "y"'), '&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;')
eq('the plain text of a string', captionText('  Photo: Jane  '), 'Photo: Jane')

// --- nothing is nothing --------------------------------------------------
eq('undefined is no caption', captionHtml(undefined), '')
eq('null is no caption', captionHtml(null), '')
eq('a blank string is no caption', captionHtml('   '), '')
eq(
  'a CLEARED rich caption (Studio leaves an empty block) is no caption',
  captionHtml([block([span('')])]),
  '',
)
eq('and its plain text is empty', captionText([block([span('')])]), '')
eq('an empty array is no caption', captionHtml([]), '')

// --- the point of the whole change --------------------------------------
const linked = [block([span('Photo: '), span('Jane Doe', ['L'])], [link('https://janedoe.com')])]
eq(
  'a linked name becomes an external, noopener anchor',
  captionHtml(linked),
  '<span class="caption__line">Photo: <a href="https://janedoe.com" target="_blank" rel="noopener noreferrer">Jane Doe</a></span>',
)
eq('the plain text of a linked caption has no markup', captionText(linked), 'Photo: Jane Doe')
eq(
  'a mailto link opens in the same tab',
  captionHtml([block([span('Ask', ['L'])], [link('mailto:a@b.co')])]),
  '<span class="caption__line"><a href="mailto:a@b.co">Ask</a></span>',
)

// --- a link that goes nowhere or somewhere bad ---------------------------
eq(
  'a half-filled link (no href) keeps the words and drops the anchor',
  captionHtml([block([span('Jane', ['L'])], [{_type: 'link', _key: 'L'}])]),
  '<span class="caption__line">Jane</span>',
)
check(
  'a javascript: href loses its anchor',
  !/<a /i.test(captionHtml([block([span('x', ['L'])], [link('javascript:alert(1)')])])),
)
check(
  'a data: href loses its anchor',
  !/<a /i.test(captionHtml([block([span('x', ['L'])], [link('data:text/html,<script>alert(1)</script>')])])),
)
check(
  'JAVASCRIPT: in capitals is caught too',
  !/<a /i.test(captionHtml([block([span('x', ['L'])], [link('JaVaScRiPt:alert(1)')])])),
)
check(
  'a quote in a URL cannot break out of the attribute',
  !/href="[^"]*"[^>]*onmouseover/i.test(
    captionHtml([block([span('x', ['L'])], [link('https://a.co/" onmouseover="alert(1)')])]),
  ),
)
check(
  'text inside a stripped link survives',
  captionHtml([block([span('Jane', ['L'])], [link('javascript:alert(1)')])]).includes('Jane'),
)

// --- more than one line --------------------------------------------------
eq(
  'a second paragraph is a second line, not a nested <p>',
  captionHtml([block([span('One')]), block([span('Two')])]),
  '<span class="caption__line">One</span><span class="caption__line">Two</span>',
)
eq('plain text joins the lines with a space', captionText([block([span('One')]), block([span('Two')])]), 'One Two')

console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('All caption checks pass.')
