/*
  Email addresses out of the page source (scripts/lib/hide-emails.mjs),
  checked on made-up pages - and the page's restore script run against the
  result in a stand-in DOM, so what a visitor ends up with is checked too.

  Usage: node scripts/test-hide-emails.mjs
*/
import {hideEmails, addressesIn, decode, encode, spelled, RESTORE} from './lib/hide-emails.mjs'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const A = 'chris@rumeaudesign.co'
const page = `<!doctype html><html><head><title>Privacy - write to ${A}</title>
<meta name="description" content="Questions? ${A}">
<script type="application/ld+json">{"email":"${A}"}</script>
</head><body>
<p>Contact us at ${A} or <a href="mailto:${A}?subject=Privacy%20question">${A}</a>.</p>
<p>Image license: <a href='mailto:licensing@example.org'>write to us</a></p>
<img src="/logo@2x.png" alt="">
<script>var x = "${A}"</script>
<style>/* ${A} */</style>
<textarea>${A}</textarea>
</body></html>`

const {html, count} = hideEmails(page)
const body = html.slice(html.search(/<body[\s>]/))
const bodyText = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<textarea[\s\S]*?<\/textarea>/g, '')
check('no address left in the page body\'s text or links', addressesIn(bodyText).length === 0, addressesIn(bodyText).join(', '))
check('every address counted: two in text, two links', count === 4, `${count}`)
check('a link without JavaScript reaches the contact page', /href="\/contact" data-mh=/.test(html) && /href='\/contact' data-mh=/.test(html))
check('the subject line is kept for the restored link', decode(html.match(/data-mh="([^"]+)"/)[1]) === `${A}?subject=Privacy question`)
check('without JavaScript the text reads as words', html.includes(`>${spelled(A)}<`) && spelled(A) === 'chris at rumeaudesign dot co', spelled(A))
check('a file name with an @ is left alone', html.includes('src="/logo@2x.png"'))
check('the head is untouched (title, meta, structured data)', html.startsWith(page.slice(0, page.indexOf('<body'))))
check('scripts, styles and text boxes are untouched', html.includes(`var x = "${A}"`) && html.includes(`/* ${A} */`) && html.includes(`<textarea>${A}</textarea>`))
check('the restore script is added once, before </body>', html.split(RESTORE).length === 2 && html.includes(`${RESTORE}</body>`))
check('a page with no address is unchanged', hideEmails('<html><body><p>hi</p></body></html>').html === '<html><body><p>hi</p></body></html>')
check('encode and decode are each other\'s inverse', decode(encode(A)) === A && !encode(A).includes('@'))

// ---------------------------------------------------------------- what a visitor gets
{
  const els = []
  for (const m of html.matchAll(/<(span|a)\b([^>]*)>/g)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([a-z-]+)=(["'])(.*?)\2/g)].map((a) => [a[1], a[3]]))
    if (attrs['data-m'] || attrs['data-mh']) {
      els.push({tag: m[1], attrs, textContent: null, getAttribute: (k) => attrs[k], setAttribute: (k, v) => (attrs[k] = v)})
    }
  }
  const document = {querySelectorAll: (sel) => els.filter((e) => e.attrs[sel.slice(1, -1)] !== undefined)}
  const atob = (s) => Buffer.from(s, 'base64').toString('binary')
  new Function('document', 'atob', RESTORE.replace(/^<script>|<\/script>$/g, ''))(document, atob)
  const texts = els.filter((e) => e.attrs['data-m']).map((e) => e.textContent)
  const links = els.filter((e) => e.attrs['data-mh']).map((e) => e.attrs.href)
  check('restored: the visitor reads the real address', texts.length === 2 && texts.every((t) => t === A), texts.join(', '))
  check('restored: the links are mailto: links again', links.includes(`mailto:${A}?subject=Privacy question`) && links.includes('mailto:licensing@example.org'), links.join(', '))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
