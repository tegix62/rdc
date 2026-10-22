/*
  Do the test browsers really not download pictures? A real browser, a page
  served from this machine, no network needed.

  Run the way every workflow runs a test script:

    NODE_OPTIONS=--import=./scripts/lib/test-images-off.mjs node scripts/test-test-images-off.mjs

  The page carries pictures as the site does - from cdn.sanity.io (as
  before) and through /img/ (now) - including a crop and a srcset. Checks:
  each arrives as a stand-in of the real picture's shape, nothing reaches
  the network, and a video is refused. Then the shape arithmetic on its own.

  The page first tries to install a service worker that fetches pictures
  itself, as the site's does. That is how the first version of the guard
  leaked: a worker's requests get past a route, so tests on the real site
  kept downloading pictures. The worker must not install.
*/
import {chromium} from 'playwright'
import http from 'node:http'
import {placeholderSize} from './lib/test-images-off.mjs'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

// ---------------------------------------------------------------- the shapes
const S = 'https://cdn.sanity.io/images/8337vjtf/production/abc-1000x800.jpg'
const eq = (a, b) => a.w === b.w && a.h === b.h
check('a width keeps the file\'s shape', eq(placeholderSize(`${S}?w=400`), {w: 400, h: 320}))
check('a width and height are taken as given (a crop)', eq(placeholderSize(`${S}?w=400&h=500`), {w: 400, h: 500}))
check('a rect crop sets the shape', eq(placeholderSize(`${S}?rect=0,0,500,500&w=256`), {w: 256, h: 256}))
check('no size asks for the original', eq(placeholderSize(S), {w: 1000, h: 800}))
check('the same through /img/', eq(placeholderSize('https://rumeaudesign.co/img/images/8337vjtf/production/abc-1000x800.jpg?w=400'), {w: 400, h: 320}))

// ---------------------------------------------------------------- in a browser
let siteHits = 0
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/img/')) {
    siteHits++
    res.writeHead(500)
    return res.end('should never be asked')
  }
  // A service worker that fetches pictures itself, as public/sw.js does. Its
  // requests are not the page's, so a page or context route never sees them.
  if (req.url === '/sw.js') {
    res.writeHead(200, {'content-type': 'text/javascript'})
    return res.end(`
      self.addEventListener('install', () => self.skipWaiting())
      self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
      self.addEventListener('fetch', (e) => {
        if (e.request.destination === 'image') e.respondWith(fetch(e.request.url, {mode: 'cors'}))
      })`)
  }
  res.writeHead(200, {'content-type': 'text/html'})
  if (req.url === '/worker') {
    return res.end(`<!doctype html><body><script>
      window.sw = navigator.serviceWorker
        ? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(() => 'registered', () => 'refused')
        : Promise.resolve('none')
    </script></body>`)
  }
  res.end(`<!doctype html><body>
    <img id="a" src="https://cdn.sanity.io/images/8337vjtf/production/abc-1000x800.jpg?w=400">
    <img id="b" src="/img/images/8337vjtf/production/abc-1000x800.jpg?w=300&h=600&fit=crop">
    <img id="c" srcset="/img/images/8337vjtf/production/def-600x900.jpg?w=200 200w, /img/images/8337vjtf/production/def-600x900.jpg?w=1200 1200w" sizes="200px">
    <video id="v" src="/img/files/8337vjtf/production/clip.mp4" preload="auto"></video>
  </body>`)
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const outside = []
for (const open of ['newPage', 'newContext']) {
  const page = open === 'newPage' ? await browser.newPage() : await (await browser.newContext()).newPage()
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.hostname === 'cdn.sanity.io') outside.push(r.url())
  })
  page.on('requestfinished', async (r) => {
    // A request that really went out has a server address; a fulfilled one does not.
    if (new URL(r.url()).hostname === 'cdn.sanity.io' && (await r.response())?.fromServiceWorker() === false) {
      const addr = await (await r.response())?.serverAddr()
      if (addr) outside.push(`REAL ${r.url()}`)
    }
  })
  // Install the worker first, as a returning visitor would have it, then load
  // the pictures under it.
  await page.goto(`${base}/worker`, {waitUntil: 'load'})
  const sw = await page.evaluate(() => Promise.race([window.sw, new Promise((r) => setTimeout(() => r('timed out'), 3000))]))
  check(`${open}: the site's service worker does not run, so it cannot fetch around the guard`, sw !== 'registered', sw)
  await page.goto(base, {waitUntil: 'load'})
  await page.waitForTimeout(500)
  const r = await page.evaluate(() => {
    const s = (id) => {
      const i = document.getElementById(id)
      return {w: i.naturalWidth, h: i.naturalHeight, ok: i.complete && i.naturalWidth > 0}
    }
    return {a: s('a'), b: s('b'), c: s('c'), video: document.getElementById('v').error?.code ?? null}
  })
  check(`${open}: a Sanity picture arrives as a stand-in of its shape`, r.a.ok && r.a.w === 400 && r.a.h === 320, JSON.stringify(r.a))
  check(`${open}: so does one through /img/, cropped`, r.b.ok && r.b.w === 300 && r.b.h === 600, JSON.stringify(r.b))
  check(`${open}: and a srcset picture`, r.c.ok && r.c.w / r.c.h === 600 / 900, JSON.stringify(r.c))
  check(`${open}: a video is refused`, r.video !== null, `error ${r.video}`)
}
check('nothing reached the site\'s /img/ route', siteHits === 0, `${siteHits} request(s)`)
check('nothing really went out to Sanity', !outside.some((u) => u.startsWith('REAL')), outside.filter((u) => u.startsWith('REAL')).join(', '))
await browser.close()
server.close()

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
