/*
  functions/api/form-progress.ts as a real Request -> Response round trip,
  with global fetch mocked - same approach as test-contact-function.mjs, for
  the same reason: reading the code and agreeing with it proves nothing about
  what a real Request produces.

  WHAT THIS NOW ASSERTS, AND WHY IT IS THE OPPOSITE OF WHAT IT USED TO

  This file used to prove that a valid ping incremented exactly one field on a
  published Sanity document. It did prove that, and the behaviour it was
  guarding turned out to be the bug: a Sanity webhook redeploys the site on
  any published-document change, so every ping was a production deploy. On
  17 August 2026 ordinary traffic on /contact produced several hundred of them
  in minutes.

  So the assertion is inverted. The endpoint must now make NO outbound request
  whatsoever - not a mocked one, not a stubbed one, none - because "it only
  writes a little" is precisely the reasoning that failed. Everything else it
  did well (the allow-list, the prototype-chain defence, rejecting malformed
  bodies) is still checked, because that input handling is what whatever
  replaces this will inherit.

  Usage: node scripts/test-form-progress-function.mjs
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

const outdir = path.join(root, 'node_modules', '.cache', 'form-progress-function-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'form-progress.mjs')
await build({
  entryPoints: [path.join(root, 'functions/api/form-progress.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'error',
})
const {onRequestPost, onRequestGet} = await import(outfile)

/*
  No env at all. The Function's Context no longer declares one, and passing a
  write token here would quietly keep the old shape alive in the test long
  after the code stopped having it.
*/
const ENV = undefined

function mockFetch(responses) {
  const calls = []
  const queues = new Map()
  for (const [match, list] of Object.entries(responses)) queues.set(match, [...list])
  const fn = async (url, init) => {
    const urlStr = String(url)
    calls.push({url: urlStr, init})
    for (const [match, queue] of queues) {
      if (urlStr.includes(match) && queue.length) return queue.shift()
    }
    throw new Error(`mockFetch: no stubbed response for ${urlStr}`)
  }
  fn.calls = calls
  return fn
}
const jsonRes = (status, body) => new Response(JSON.stringify(body), {status})

const post = (fields) => {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('https://rumeaudesign.co/api/form-progress', {method: 'POST', body: form})
}

// --- a valid ping is accepted and recorded NOWHERE ---------------------------
{
  /*
    An empty stub map, so ANY outbound request throws "no stubbed response".
    That is the point: this asserts the absence of a network call, and the
    strongest way to assert that is to make one impossible to fake.
  */
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post({form: 'contact', step: '3'}), env: ENV})
  check('a valid ping still returns 204', res.status === 204)
  check('and makes NO outbound request - nothing reaches the CMS', fetchMock.calls.length === 0)
}

// --- an unknown form is rejected before any Sanity call is made --------------
{
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post({form: 'newsletter', step: '1'}), env: ENV})
  check('an unknown form is rejected with 400', res.status === 400)
  check('Sanity is never called for a rejected ping', fetchMock.calls.length === 0)
}

// --- an out-of-range step is rejected before any Sanity call -----------------
{
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post({form: 'contact', step: '99'}), env: ENV})
  check('an out-of-range step is rejected with 400', res.status === 400)
  check('Sanity is never called for a rejected ping', fetchMock.calls.length === 0)
}

/*
  The specific attack this Function's allow-list has to survive even with no
  spam protection in front of it: a request naming a JavaScript
  Object.prototype member as the form, trying to ride the prototype chain
  past a naive `in` check. See src/lib/formFunnelValidation.ts for the fix
  and scripts/test-form-funnel-validation.mjs for the unit-level proof; this
  confirms the SAME protection holds through the real Function, not just the
  validator in isolation.
*/
{
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post({form: '__proto__', step: '1'}), env: ENV})
  check('a prototype-chain form name is rejected through the real Function', res.status === 400)
  check('and never reaches Sanity', fetchMock.calls.length === 0)
}

// --- a malformed request body does not crash the Function --------------------
{
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const badRequest = new Request('https://rumeaudesign.co/api/form-progress', {
    method: 'POST',
    body: 'not form data at all',
    headers: {'Content-Type': 'application/json'},
  })
  const res = await onRequestPost({request: badRequest, env: ENV})
  check('a non-form body is rejected rather than throwing', res.status === 400)
}

/*
  The old "a Sanity failure surfaces as 5xx" case is gone with the write it
  described. There is no upstream left to fail, so a 204 is now the only
  answer a well-formed ping can get - which is what the first case asserts.
*/

// --- GET is not a ping -------------------------------------------------------
{
  const res = await onRequestGet()
  check('GET on this endpoint is rejected with 405', res.status === 405)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
