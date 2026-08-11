/*
  Checks whether Sanity's visual editing overlay actually boots when the site is
  loaded inside an iframe, which is how Studio's Presentation tab loads it.

  Written because the Edit toggle in Presentation can now be flicked - so
  Presentation is connecting, which it wasn't before - but flicking it does
  nothing visible. Stega is confirmed working (130k zero-width markers in the
  page), so the content is tagged; the question is whether the overlay that
  turns those markers into clickable targets is running at all.

  The overlay is now gated to iframes only, so that a visitor opening the
  preview URL directly doesn't get editing chrome. This verifies the gate lets
  it through in the case it's supposed to.

  scripts/build-overlay.mjs makes the bundle log "[sanity] visual editing
  enabled" on success and log an error on failure, so the frame console answers
  the question directly.

  Usage: node scripts/test-visual-editing.mjs [url]
*/
import {chromium} from 'playwright'

const TARGET = process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev/about'

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1440, height: 900}})

const requests = []
const consoleLines = []
page.on('request', (r) => {
  if (r.url().includes('sanity-visual-editing')) requests.push(`REQ  ${r.url()}`)
})
page.on('response', (r) => {
  if (r.url().includes('sanity-visual-editing')) requests.push(`RES  ${r.status()} ${r.url()}`)
})
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text().slice(0, 200)}`))
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message.slice(0, 200)}`))

let failures = 0
const check = (name, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (pass) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
console.log(`\n1. Direct load (a normal visitor) — overlay should NOT run\n`)
await page.goto(TARGET, {waitUntil: 'load', timeout: 60000})
await page.waitForTimeout(3000)

const directRequests = [...requests]
check('overlay not requested on a direct visit', directRequests.length, 0)

// ---------------------------------------------------------------------------
console.log(`\n2. Inside an iframe (how Presentation loads it) — overlay SHOULD run\n`)
requests.length = 0
consoleLines.length = 0

// A blank page on a different origin embedding the site, mirroring Studio.
await page.goto('about:blank')
await page.setContent(
  `<!doctype html><html><body style="margin:0">
     <iframe id="preview" src="${TARGET}" style="width:100%;height:900px;border:0"></iframe>
   </body></html>`,
  {waitUntil: 'load'},
)
await page.waitForTimeout(6000)

for (const r of requests) console.log(`    ${r}`)
check('overlay requested inside an iframe', requests.some((r) => r.startsWith('REQ')), true)
check(
  'overlay served 200',
  requests.some((r) => r.startsWith('RES  200')),
  true,
)

// The bundle logs 'mounted' only once the overlay's element is actually in
// the DOM - see scripts/build-overlay.mjs for why 'started' wasn't enough.
const booted = consoleLines.some((l) => l.includes('visual editing mounted'))
const failed = consoleLines.filter(
  (l) => l.includes('never mounted') || l.includes('threw on start'),
)
check('overlay reported that it mounted', booted, true)
if (failed.length) {
  console.log('\n  overlay start-up errors:')
  for (const f of failed) console.log(`    ${f}`)
}

// Whether the overlay actually put anything in the frame's DOM. Sanity renders
// its overlay UI into elements it owns; their absence means it loaded but never
// attached, which looks identical to a dead toggle.
const frame = page.frames().find((f) => f.url().startsWith('http'))
if (frame) {
  const dom = await frame.evaluate(() => ({
    stegaChars: (document.documentElement.innerHTML.match(/[​-‏﻿⁠]/g) ?? []).length,
    sanityElements: document.querySelectorAll('[data-sanity], [data-sanity-edit-target], sanity-visual-editing')
      .length,
    customElements: [...document.querySelectorAll('*')]
      .map((el) => el.tagName.toLowerCase())
      .filter((t) => t.includes('sanity'))
      .slice(0, 5),
  }))
  console.log(`\n  inside the frame:`)
  console.log(`    stega markers:        ${dom.stegaChars}`)
  console.log(`    sanity overlay nodes: ${dom.sanityElements}`)
  console.log(`    sanity elements:      ${dom.customElements.join(', ') || '(none)'}`)
  check('content carries stega markers', dom.stegaChars > 0, true)
}

if (consoleLines.length) {
  console.log('\n  frame console:')
  for (const l of consoleLines.slice(0, 15)) console.log(`    ${l}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
await browser.close()
process.exit(failures ? 1 : 0)
