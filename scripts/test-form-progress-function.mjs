/*
  functions/api/form-progress.ts as a real Request -> Response round trip,
  Sanity's mutate API stubbed via a mocked global fetch - same approach as
  test-contact-function.mjs, for the same reason: reading the code and
  agreeing with it proves nothing about what a real Request produces.

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

const ENV = {SANITY_WRITE_TOKEN: 'fake-write-token'}

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

// --- a valid ping writes a two-mutation transaction --------------------------
{
  const fetchMock = mockFetch({'api.sanity.io': [jsonRes(200, {transactionId: 'tx1'})]})
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post({form: 'contact', step: '3'}), env: ENV})
  check('a valid ping returns 204', res.status === 204)
  check('exactly one Sanity call is made', fetchMock.calls.length === 1)

  const body = JSON.parse(fetchMock.calls[0].init.body)
  check('the transaction has exactly two mutations', body.mutations.length === 2)
  check('the first mutation creates the counter doc if missing', 'createIfNotExists' in body.mutations[0])
  check('the counter doc id is namespaced by form name', body.mutations[0].createIfNotExists._id === 'formFunnel.contact')
  check('the second mutation increments the RIGHT field for step 3', body.mutations[1].patch.inc.step3 === 1)
  check('it does not touch any other step field', Object.keys(body.mutations[1].patch.inc).length === 1)
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

// --- a Sanity failure is reported with a server error, not a false success ---
{
  const fetchMock = mockFetch({'api.sanity.io': [jsonRes(500, {error: 'internal'})]})
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post({form: 'contact', step: '1'}), env: ENV})
  check('a Sanity failure surfaces as 5xx, not a false 204', res.status >= 500)
}

// --- GET is not a ping -------------------------------------------------------
{
  const res = await onRequestGet()
  check('GET on this endpoint is rejected with 405', res.status === 405)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
