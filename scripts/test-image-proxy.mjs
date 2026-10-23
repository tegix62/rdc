/*
  Pictures through Cloudflare - the parts that are plain code, tested with
  no network at all (the point of the change is to stop spending Sanity
  bandwidth, so this must not spend any):

    the route (src/lib/imageProxy.ts), with stand-ins for fetch and the cache
      - only this project's assets pass; anything else is a 404
      - a first request goes to Sanity once and is kept; the second is
        served from the cache without asking Sanity again
      - a failure from Sanity is passed on and NOT kept
      - a video's byte range is passed through
    the page rewrite (scripts/lib/proxy-images.mjs)
      - src, srcset, posters, data-* and style url()s move to /img/
      - <meta> tags, JSON-LD and preconnect hints are left alone

  Usage: node scripts/test-image-proxy.mjs
*/
import {proxyImage, upstreamFor, ALLOWED, YEAR} from '../src/lib/imageProxy.ts'
import {rewriteHtml} from './lib/proxy-images.mjs'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const ASSET = 'images/8337vjtf/production/abc123def456-1000x800.jpg'
const req = (path, headers = {}) => new Request(`https://rumeaudesign.co/img/${path}`, {headers})

function rig(status = 200) {
  const calls = []
  const store = new Map()
  const pending = []
  const deps = {
    fetch: async (url, init) => {
      calls.push({url, init})
      return new Response(status === 200 ? 'BYTES' : 'over quota', {
        status,
        headers: {'content-type': status === 200 ? 'image/webp' : 'text/plain', 'set-cookie': 'x=1'},
      })
    },
    cache: {
      match: async (r) => store.get(r.url)?.clone(),
      put: async (r, res) => void store.set(r.url, res),
    },
    waitUntil: (p) => pending.push(p),
  }
  return {deps, calls, store, settle: () => Promise.all(pending)}
}

// ---------------------------------------------------------------- the route
check('this project\'s pictures are allowed', ALLOWED.test(ASSET))
check('so are its files (videos)', ALLOWED.test('files/8337vjtf/production/abc.mp4'))
check('another project is not', !ALLOWED.test('images/someoneelse/production/abc-1x1.jpg'))
check('nor a path that climbs out', !ALLOWED.test('images/8337vjtf/production/../../x'))
check('nor another host', !ALLOWED.test('https://evil.example/x.jpg'))

{
  const r = rig()
  const res = await proxyImage(req('images/elsewhere/production/a-1x1.jpg'), {path: 'images/elsewhere/production/a-1x1.jpg'.split('/')}, r.deps)
  check('a foreign path is a 404, and Sanity is never asked', res.status === 404 && r.calls.length === 0, `${res.status}, ${r.calls.length} call(s)`)
}

{
  const r = rig()
  const params = {path: ASSET.split('/')}
  const first = await proxyImage(req(`${ASSET}?w=800&auto=format`), params, r.deps)
  await r.settle()
  check('the first request goes to Sanity, same path, the format named in place of auto', r.calls[0]?.url === `https://cdn.sanity.io/${ASSET}?w=800&fm=webp`, r.calls[0]?.url)
  check('a browser that does not say AVIF is sent WebP', /^image\/webp/.test(r.calls[0]?.init?.headers?.accept ?? ''))
  check('the picture is fetched without the cf cache options, which lose the Accept header', !r.calls[0]?.init?.cf)
  check('so the two formats are two addresses, which any cache can keep apart', upstreamFor(ASSET, '?w=800&auto=format', 'avif') !== upstreamFor(ASSET, '?w=800&auto=format', 'webp'))
  check('a fixed format, or none asked, is passed on as it is', upstreamFor(ASSET, '?w=800&fm=jpg', 'avif') === `https://cdn.sanity.io/${ASSET}?w=800&fm=jpg` && upstreamFor(ASSET, '', 'avif') === `https://cdn.sanity.io/${ASSET}`)
  check('an animated GIF is not converted', upstreamFor('images/8337vjtf/production/a-800x800.gif', '?auto=format', 'avif').endsWith('?auto=format'))
  check('served with a year-long cache', first.status === 200 && first.headers.get('cache-control') === `public, max-age=${YEAR}, immutable`, first.headers.get('cache-control'))
  check('without passing on Sanity\'s cookies', !first.headers.get('set-cookie'))
  check('and kept', r.store.size === 1)
  const second = await proxyImage(req(`${ASSET}?w=800&auto=format`), params, r.deps)
  check('the second request is served from the cache - Sanity is asked once', r.calls.length === 1 && (await second.text()) === 'BYTES', `${r.calls.length} call(s)`)
  await proxyImage(req(`${ASSET}?w=1600&auto=format`), params, r.deps)
  check('a different size is its own picture', r.calls.length === 2)
}

{
  // Sanity sends AVIF to browsers that take it - 27% fewer bytes, measured.
  const r = rig()
  const params = {path: ASSET.split('/')}
  const avif = {accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'}
  const res = await proxyImage(req(`${ASSET}?w=800&auto=format`, avif), params, r.deps)
  await r.settle()
  check('a browser that takes AVIF is asked AVIF for', /^image\/avif/.test(r.calls[0]?.init?.headers?.accept ?? ''))
  check('by auto=format and the Accept header, never fm=avif, which Sanity rejects (400)', r.calls[0]?.url === `https://cdn.sanity.io/${ASSET}?w=800&auto=format&dpr=1` && !r.calls.some((c) => /fm=avif/.test(c.url)), r.calls[0]?.url)
  check('and told the answer varies by what it accepts', res.headers.get('vary') === 'Accept')
  await proxyImage(req(`${ASSET}?w=800&auto=format`, {accept: 'image/webp,*/*'}), params, r.deps)
  await r.settle()
  check('a WebP browser is not handed the AVIF copy - each format is kept apart', r.calls.length === 2 && r.store.size === 2, `${r.calls.length} call(s), ${r.store.size} kept`)
  await proxyImage(req(`${ASSET}?w=800&auto=format`, avif), params, r.deps)
  check('and the AVIF copy is served again from the cache', r.calls.length === 2)
}

{
  const r = rig(402)
  const res = await proxyImage(req(ASSET), {path: ASSET.split('/')}, r.deps)
  await r.settle()
  check('a failure from Sanity is passed on', res.status === 402)
  check('and not kept, so it cannot stick for a year', r.store.size === 0 && res.headers.get('cache-control') === 'no-store')
}

{
  const r = rig()
  const file = 'files/8337vjtf/production/clip.mp4'
  await proxyImage(req(file, {range: 'bytes=0-999'}), {path: file.split('/')}, r.deps)
  check('a video\'s byte range is passed through', r.calls[0]?.init?.headers?.range === 'bytes=0-999')
}

// ---------------------------------------------------------------- the rewrite
const page = `<!doctype html><html><head>
<link rel="preconnect" href="https://cdn.sanity.io" crossorigin />
<meta property="og:image" content="https://cdn.sanity.io/images/8337vjtf/production/og-1200x630.jpg">
<script type="application/ld+json">{"image":"https://cdn.sanity.io/images/8337vjtf/production/ld-10x10.jpg"}</script>
</head><body>
<img src="https://cdn.sanity.io/images/8337vjtf/production/a-1x1.jpg?w=800" srcset="https://cdn.sanity.io/images/8337vjtf/production/a-1x1.jpg?w=400 400w, https://cdn.sanity.io/images/8337vjtf/production/a-1x1.jpg?w=800 800w">
<video poster="https://cdn.sanity.io/images/8337vjtf/production/p-1x1.jpg"></video>
<figure data-scan="https://cdn.sanity.io/images/8337vjtf/production/scan-7186x7178.jpg"></figure>
<div style="background-image:url(https://cdn.sanity.io/images/8337vjtf/production/bg-1x1.jpg)"></div>
<script>var u = "https:\\/\\/cdn.sanity.io\\/images\\/8337vjtf\\/production\\/x-1x1.jpg"</script>
</body></html>`
const {html, count} = rewriteHtml(page)
check('every picture the page loads now goes through /img/', count === 7 && !/<(img|video|figure|div)[^>]*cdn\.sanity\.io/.test(html), `${count} rewritten`)
check('including srcset entries and escaped addresses in scripts', html.includes('/img/images/8337vjtf/production/a-1x1.jpg?w=400 400w') && html.includes('\\/img\\/images'))
check('the og:image tag is left absolute, for other sites\' crawlers', html.includes('content="https://cdn.sanity.io/images/8337vjtf/production/og-1200x630.jpg"'))
check('so is the structured data', html.includes('"image":"https://cdn.sanity.io/images/8337vjtf/production/ld-10x10.jpg"'))
check('a page with no pictures is unchanged', rewriteHtml('<p>hi</p>').html === '<p>hi</p>')

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
