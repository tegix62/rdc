/*
  Reproduces Studio's Presentation tool well enough to see why the Edit toggle
  does nothing - without needing a browser console, a desktop, or a Sanity
  login.

  Everything checkable without running code already checks out: the site's
  overlay boots inside an iframe, the page is full of stega markers, and the
  two halves speak the same protocol (both sides at @sanity/comlink 3.1.1 and
  @sanity/presentation-comlink 1.0.33; Presentation posts
  "presentation/toggle-overlay" and the site listens for exactly that). So the
  fault has to be in the one thing that only happens at runtime: the comlink
  handshake between the Studio page and the site in its iframe.

  Rather than guess at it, this stands up a fake Presentation host that runs
  Presentation's own code. The host bundle is built from studio/node_modules,
  so it is literally the same comlink the deployed Studio ships, wired the same
  way sanity's PreviewFrame wires it:

      const controller = createController({targetOrigin})
      controller.addTarget(iframe.contentWindow)
      controller.createChannel(
        {name: 'presentation', heartbeat: true, connectTo: 'visual-editing'},
        createConnectionMachine().provide({actors: createCompatibilityActors()}),
      )

  It is served over http on localhost so the iframe is genuinely cross-origin,
  as it is in the real Studio. Then it does what the Edit toggle does - post
  "presentation/toggle-overlay" - and reports whether the site reacted.

  Reading the result:

    handshake connected + overlay elements appear
      The site is fine and so is the protocol. The fault is in the real
      Studio's environment: browser storage partitioning, an extension, or the
      Studio being on a different origin than the one allowOrigins permits.

    handshake never connects
      The site never answers. The status log and the console lines below it
      say how far it got.

  Usage: node scripts/test-presentation-handshake.mjs [preview-url]
*/
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {chromium} from 'playwright'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const TARGET = process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev/about'

// ---------------------------------------------------------------------------
// The host page, bundled out of studio/node_modules so it uses the Studio's
// own copy of comlink rather than the site's.

const hostEntry = `
import {createController, createConnectionMachine} from '@sanity/comlink'
import {createCompatibilityActors} from '@sanity/presentation-comlink'

const t0 = Date.now()
const log = []
window.__log = log
const record = (m) => {
  log.push(\`+\${String(Date.now() - t0).padStart(5)}ms  \${m}\`)
  console.log('[host] ' + m)
}

const target = new URLSearchParams(location.search).get('target')
record('embedding ' + target)

const iframe = document.createElement('iframe')
iframe.src = target
iframe.style.cssText = 'width:100%;height:900px;border:0'
document.body.appendChild(iframe)

iframe.addEventListener('load', () => {
  record('iframe fired load')

  // Presentation derives this from the preview URL and refuses to post
  // anywhere else, so a mismatch here is exactly the "unable to connect"
  // case the Studio reports.
  const targetOrigin = new URL(target).origin
  const controller = createController({targetOrigin})
  controller.addTarget(iframe.contentWindow)

  const comlink = controller.createChannel(
    {name: 'presentation', heartbeat: true, connectTo: 'visual-editing'},
    createConnectionMachine().provide({actors: createCompatibilityActors()}),
  )

  comlink.onStatus(({status}) => {
    record('status -> ' + status)
    if (status === 'connected') window.__connected = true
  })
  comlink.on('visual-editing/toggle', (d) => record('page -> visual-editing/toggle ' + JSON.stringify(d)))
  comlink.on('visual-editing/navigate', (d) => record('page -> visual-editing/navigate ' + JSON.stringify(d)))
  comlink.on('visual-editing/focus', (d) => record('page -> visual-editing/focus ' + JSON.stringify(d)))

  window.__comlink = comlink
  comlink.start()
  record('channel started, waiting for the page to answer')
})
`

console.log('building the fake Presentation host from studio/node_modules...')
const bundle = await build({
  stdin: {
    contents: hostEntry,
    // Resolving from studio/ is the point: this must be the Studio's comlink,
    // not the site's, or the test proves nothing about the real pairing.
    resolveDir: path.join(root, 'studio'),
    sourcefile: 'host.js',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  target: 'es2020',
  write: false,
  define: {'process.env.NODE_ENV': '"production"'},
  logLevel: 'warning',
})
const hostJs = bundle.outputFiles[0].text
console.log(`  built (${Math.round(hostJs.length / 1024)} KB)\n`)

// ---------------------------------------------------------------------------
const server = createServer((req, res) => {
  if (req.url.startsWith('/host.js')) {
    res.writeHead(200, {'Content-Type': 'text/javascript'})
    res.end(hostJs)
    return
  }
  res.writeHead(200, {'Content-Type': 'text/html'})
  res.end('<!doctype html><meta charset="utf-8"><body style="margin:0"><script type="module" src="/host.js"></script>')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const hostUrl = `http://127.0.0.1:${server.address().port}/?target=${encodeURIComponent(TARGET)}`

// ---------------------------------------------------------------------------
const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1440, height: 1000}})

const frameConsole = []
page.on('console', (m) => {
  const text = m.text()
  if (!text.startsWith('[host]')) frameConsole.push(`[${m.type()}] ${text.slice(0, 240)}`)
})
page.on('pageerror', (e) => frameConsole.push(`[pageerror] ${e.message.slice(0, 240)}`))

let failures = 0
const check = (name, pass, detail) => {
  if (pass) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ''}`)
  }
}

console.log(`1. Handshake\n`)
await page.goto(hostUrl, {waitUntil: 'load', timeout: 60000})

const connected = await page
  .waitForFunction(() => window.__connected === true, null, {timeout: 30000})
  .then(() => true)
  .catch(() => false)

for (const line of await page.evaluate(() => window.__log ?? [])) console.log(`    ${line}`)
console.log()
check('Presentation connected to the site', connected)

// ---------------------------------------------------------------------------
console.log(`\n2. The Edit toggle\n`)

const frame = page.frames().find((f) => f.url().startsWith('http') && !f.url().includes('127.0.0.1'))
const overlayState = async () => {
  if (!frame) return null
  return frame.evaluate(() => {
    const host = document.querySelector('sanity-visual-editing')
    return {
      hostExists: !!host,
      // The overlay renders its rects and "Open in Studio" chrome inside this
      // element, so its child count is the difference between the toggle
      // having done something and having done nothing.
      childCount: host ? host.querySelectorAll('*').length : 0,
      elementsMarked: document.querySelectorAll('[data-sanity]').length,
    }
  })
}

const before = await overlayState()
console.log(`    before toggle: ${JSON.stringify(before)}`)

// Exactly what the Edit toggle does - see sanity's PreviewFrame:
//   const toggleOverlay = useCallback(() => visualEditingComlink?.post('presentation/toggle-overlay'), ...)
await page.evaluate(() => window.__comlink?.post('presentation/toggle-overlay'))
await page.waitForTimeout(2500)

// Overlay rects are drawn for whatever the pointer is over, so nudge it the
// way an editor would before deciding nothing happened.
if (frame) {
  await page.mouse.move(700, 400)
  await page.waitForTimeout(400)
  await page.mouse.move(700, 500)
  await page.waitForTimeout(1200)
}

const after = await overlayState()
console.log(`    after toggle:  ${JSON.stringify(after)}`)
console.log()

check('the site has an overlay host element', !!after?.hostExists)
check(
  'toggling the overlay changed the page',
  !!after && !!before && after.childCount > before.childCount,
  `child count went ${before?.childCount} -> ${after?.childCount}`,
)

for (const line of await page.evaluate(() => window.__log ?? [])) console.log(`    ${line}`)

if (frameConsole.length) {
  console.log(`\n  console from inside the frame:`)
  for (const l of frameConsole.slice(0, 25)) console.log(`    ${l}`)
}

await page.screenshot({path: 'presentation-handshake.png', fullPage: false})
console.log(`\n  screenshot: presentation-handshake.png`)

console.log(failures ? `\n${failures} check(s) FAILED` : `\nAll checks passed.`)

await browser.close()
server.close()
process.exit(failures ? 1 : 0)
