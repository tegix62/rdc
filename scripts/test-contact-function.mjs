/*
  functions/api/contact.ts, exercised as a real Request -> Response round trip
  with the three outbound calls (Turnstile, Sanity, Resend) stubbed via a
  mocked global fetch - not reimplemented or read as source. Reading the code
  and agreeing with it proves nothing about whether it actually rejects a
  missing honeypot check or a failed Turnstile verification when a real
  Request hits it; running it does.

  Node 22 ships real Request/Response/FormData globals, which is what makes
  this possible without a Cloudflare-specific test harness - the Function
  imports nothing Workers-specific beyond `fetch`, which is stubbed here.

  Usage: node scripts/test-contact-function.mjs
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

const outdir = path.join(root, 'node_modules', '.cache', 'contact-function-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'contact.mjs')
await build({
  entryPoints: [path.join(root, 'functions/api/contact.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'error',
})
const {onRequestPost} = await import(outfile)

const ENV = {
  SANITY_WRITE_TOKEN: 'fake-write-token',
  TURNSTILE_SECRET_KEY: 'fake-turnstile-secret',
  RESEND_API_KEY: 'fake-resend-key',
  CONTACT_NOTIFY_EMAIL: 'chris@rumeaudesign.co',
}

const VALID_FIELDS = {
  name: 'Jordan Test',
  email: 'jordan@example.com',
  company: 'Test Co',
  businessDescription: 'A small apparel brand getting ready to launch.',
  goals: 'A logo and a brand system.',
  seriousness: '8',
  timeframe: 'Within 3 months',
  budgetMin: '3000',
  budgetMax: '4500',
  foundVia: 'Instagram',
  phone: '555-0100',
  'cf-turnstile-response': 'fake-solved-token',
}

/*
  A scripted fetch: each call the Function makes gets matched by URL and
  answered from a queue, so a test can assert not just the Function's final
  response but WHICH outbound calls it made, in what order, and with what it
  sent them - e.g. that a failed Turnstile check never reaches Sanity at all.
*/
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

const post = (fields, headers = {}) => {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('https://rumeaudesign.co/contact', {
    method: 'POST',
    body: form,
    headers: {Accept: 'application/json', ...headers},
  })
}

// --- happy path: every layer passes ------------------------------------------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.sanity.io': [jsonRes(200, {transactionId: 'tx1'})],
    'api.resend.com': [jsonRes(200, {id: 'email1'})],
  })
  globalThis.fetch = fetchMock

  const res = await onRequestPost({request: post(VALID_FIELDS), env: ENV})
  const body = await res.json()
  check('a fully valid submission returns 200', res.status === 200, res.status)
  check('and ok: true', body.ok === true)
  check('Turnstile was checked before Sanity was written', fetchMock.calls[0].url.includes('turnstile'))
  check('Sanity was called after Turnstile passed', fetchMock.calls[1].url.includes('api.sanity.io'))
  check('Resend was called last, after the Sanity write succeeded', fetchMock.calls[2].url.includes('api.resend.com'))

  const sanityBody = JSON.parse(fetchMock.calls[1].init.body)
  const doc = sanityBody.mutations[0].create
  check('the Sanity mutation is a create of type submission', doc._type === 'submission')
  check('status is set explicitly to "new"', doc.status === 'new', doc.status)
  check('submittedAt is a real ISO timestamp, not left for Sanity to fill in', !Number.isNaN(Date.parse(doc.submittedAt)))
  check('the honeypot field never reaches Sanity', !('website' in doc))
  check('the Turnstile token never reaches Sanity', !('cf-turnstile-response' in doc))
}

// --- the honeypot: silently accepted, and NOTHING downstream is called --------
{
  const fetchMock = mockFetch({}) // any call at all is a failure for this case
  globalThis.fetch = fetchMock

  const res = await onRequestPost({request: post({...VALID_FIELDS, website: 'http://spam.example'}), env: ENV})
  const body = await res.json()
  check('a filled honeypot still returns 200 (does not tip the bot off)', res.status === 200)
  check('and ok: true, indistinguishable from a real success', body.ok === true)
  check('NEITHER Turnstile, Sanity, nor Resend was ever called', fetchMock.calls.length === 0, `${fetchMock.calls.length} call(s) made`)
}

// --- Turnstile: missing token never reaches the verify API at all -------------
{
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const {['cf-turnstile-response']: _drop, ...withoutToken} = VALID_FIELDS
  const res = await onRequestPost({request: post(withoutToken), env: ENV})
  check('a missing Turnstile token is rejected with 400', res.status === 400)
  check('and no outbound call is made for it - nothing to verify', fetchMock.calls.length === 0)
}

// --- Turnstile: present but rejected by Cloudflare -----------------------------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: false})],
  })
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post(VALID_FIELDS), env: ENV})
  const body = await res.json()
  check('a failed Turnstile verification is rejected with 400', res.status === 400)
  check('Sanity is never reached when Turnstile fails', fetchMock.calls.length === 1, `${fetchMock.calls.length} call(s) made`)
  check('the rejection message does not silently claim success', body.ok === false)
}

/*
  --- the secret is sent clean, whatever the dashboard stored -------------------

  The bug this locks in cost an afternoon of live debugging. A Turnstile secret
  pasted into Cloudflare's dashboard with a trailing newline keeps it, and
  every symptom points the wrong way: the value is a real non-empty string, the
  dashboard field looks identical, and siteverify answers invalid-input-secret -
  which reads exactly like a wrong key. Chris re-pasted a confirmed-correct key
  five times, and even Cloudflare's own always-passes TEST secret failed, which
  is the only reason this turned out to be about whitespace rather than the
  value.

  Asserting on what was SENT, not just that the request succeeded: a test that
  only checked the response would pass whether or not the trim happened, since
  the mock says success either way.
*/
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.sanity.io': [jsonRes(200, {transactionId: 'tx1'})],
    'api.resend.com': [jsonRes(200, {id: 'email1'})],
  })
  globalThis.fetch = fetchMock

  const padded = {...ENV, TURNSTILE_SECRET_KEY: `  ${ENV.TURNSTILE_SECRET_KEY}\n`}
  const res = await onRequestPost({request: post(VALID_FIELDS), env: padded})
  check('a secret stored with stray whitespace still verifies', res.status === 200, res.status)

  const sent = new URLSearchParams(fetchMock.calls[0].init.body).get('secret')
  check(
    'the whitespace is stripped before the secret is sent to Cloudflare',
    sent === ENV.TURNSTILE_SECRET_KEY,
    JSON.stringify(sent),
  )
}

// A secret that is nothing BUT whitespace is not a secret, and must not be
// sent to Cloudflare as if it were one.
{
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post(VALID_FIELDS), env: {...ENV, TURNSTILE_SECRET_KEY: '   \n'}})
  check('a whitespace-only secret is rejected with 400', res.status === 400, res.status)
  check('and siteverify is never called with it', fetchMock.calls.length === 0, `${fetchMock.calls.length} call(s)`)
}

// --- server-side validation still runs, independent of Turnstile passing ------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
  })
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post({...VALID_FIELDS, email: 'not-an-email'}), env: ENV})
  check('an invalid email is rejected even after Turnstile passes', res.status === 400)
  check('Sanity is never reached for an invalid submission', fetchMock.calls.length === 1)
}

// --- Sanity failing is reported honestly, not papered over -------------------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.sanity.io': [jsonRes(500, {error: 'internal'})],
  })
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post(VALID_FIELDS), env: ENV})
  const body = await res.json()
  check('a Sanity write failure surfaces as a real error, not a 200', res.status >= 500)
  check('and directs the visitor to a fallback that does not depend on Sanity', /email/i.test(body.message))
}

// --- Resend failing must NOT undo an already-successful Sanity write -----------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.sanity.io': [jsonRes(200, {transactionId: 'tx2'})],
    'api.resend.com': [jsonRes(500, {error: 'resend is down'})],
  })
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post(VALID_FIELDS), env: ENV})
  const body = await res.json()
  check(
    'the submission still succeeds when only the email notification fails - the enquiry is already saved',
    res.status === 200 && body.ok === true,
  )
  check('all three calls were still attempted, in order', fetchMock.calls.length === 3)
}

// --- "not sure yet" budget is accepted through the whole pipeline -----------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.sanity.io': [jsonRes(200, {transactionId: 'tx3'})],
    'api.resend.com': [jsonRes(200, {id: 'email3'})],
  })
  globalThis.fetch = fetchMock
  const {budgetMin: _m, budgetMax: _x, ...rest} = VALID_FIELDS
  const res = await onRequestPost({
    request: post({...rest, budgetNotSure: 'true'}),
    env: ENV,
  })
  check('a "not sure yet" submission with no budget numbers still succeeds', res.status === 200)
  const doc = JSON.parse(fetchMock.calls[1].init.body).mutations[0].create
  check('budgetNotSure is recorded as true in the saved document', doc.budgetNotSure === true)
}

// --- the no-JS fallback: no Accept header -> HTML, not JSON -------------------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.sanity.io': [jsonRes(200, {transactionId: 'tx4'})],
    'api.resend.com': [jsonRes(200, {id: 'email4'})],
  })
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post(VALID_FIELDS, {Accept: 'text/html'}), env: ENV})
  const contentType = res.headers.get('Content-Type') ?? ''
  check('a request that did not ask for JSON gets HTML back', contentType.includes('text/html'), contentType)
  const text = await res.text()
  check('the HTML response contains a real, readable thank-you', /thanks/i.test(text))
}

// --- GET is not a form submission ------------------------------------------
{
  const {onRequestGet} = await import(outfile)
  const res = await onRequestGet()
  check('GET on this endpoint is rejected with 405', res.status === 405)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
