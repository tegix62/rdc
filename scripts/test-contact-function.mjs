/*
  functions/api/contact.ts, exercised as a real
  Request -> Response round trip. The two outbound HTTP calls (Turnstile,
  Resend) are stubbed via a mocked global fetch; the D1 database is stubbed as
  a fake binding, because D1 is not reached over HTTP - it arrives on env as an
  object. Neither is reimplemented or read as source. Reading the code
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

/*
  A stand-in for the D1 binding, recording what was actually bound rather than
  just that something was called. The SQL and its parameters are the whole
  contract with the database - a test that only checked "insert happened"
  would pass while writing a visitor's phone number into the wrong column.

  `fails` makes .run() throw, which is how a real D1 error surfaces: a
  rejected promise, not an { ok: false } response like fetch.
*/
function mockDb({fails = false} = {}) {
  const writes = []
  return {
    writes,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              if (fails) throw new Error('D1_ERROR: no such table: enquiries')
              writes.push({sql, params})
              return {success: true}
            },
          }
        },
      }
    },
  }
}

const ENV = {
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
  sent them - e.g. that a failed Turnstile check never reaches the database.
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
    'api.resend.com': [jsonRes(200, {id: 'email1'})],
  })
  globalThis.fetch = fetchMock

  const db = mockDb()
  const res = await onRequestPost({request: post(VALID_FIELDS), env: {...ENV, DB: db}})
  const body = await res.json()
  check('a fully valid submission returns 200', res.status === 200, res.status)
  check('and ok: true', body.ok === true)
  check('Turnstile was checked before anything was stored', fetchMock.calls[0].url.includes('turnstile'))
  check('exactly one row was written', db.writes.length === 1, `${db.writes.length} write(s)`)
  check('Resend was called after the row was committed', fetchMock.calls[1].url.includes('api.resend.com'))

  const {sql, params} = db.writes[0]
  check('the write is an INSERT into enquiries', /INSERT INTO enquiries/i.test(sql))

  /*
    Parameter binding, not interpolation. These values are attacker-controlled
    free text off a public form; an apostrophe in a company name breaks an
    interpolated statement before anyone even tries anything deliberate.
  */
  const placeholders = (sql.match(/\?/g) ?? []).length
  check(
    'every value is bound, not interpolated into the SQL',
    placeholders === params.length,
    `${placeholders} placeholder(s) vs ${params.length} bound value(s)`,
  )
  check('no submitted value appears inline in the SQL text', !sql.includes(VALID_FIELDS.email))

  check('submitted_at is a real ISO timestamp', !Number.isNaN(Date.parse(params[0])))
  check('the name is stored', params.includes(VALID_FIELDS.name))
  check('the email is stored', params.includes(VALID_FIELDS.email))
  check('the phone number is stored', params.includes(VALID_FIELDS.phone))
  check('the honeypot field is never stored', !params.includes('http://spam.example'))
  check('the Turnstile token is never stored', !params.includes('fake-solved-token'))

  // status is a literal in the statement rather than a bound parameter, so it
  // cannot be set to anything else by a request.
  check("status is fixed to 'new' by the SQL itself", /'new'/.test(sql))
}

// --- the honeypot: silently accepted, and NOTHING downstream is called --------
{
  const fetchMock = mockFetch({}) // any call at all is a failure for this case
  globalThis.fetch = fetchMock

  const honeypotDb = mockDb()
  const res = await onRequestPost({
    request: post({...VALID_FIELDS, website: 'http://spam.example'}),
    env: {...ENV, DB: honeypotDb},
  })
  const body = await res.json()
  check('a filled honeypot still returns 200 (does not tip the bot off)', res.status === 200)
  check('and ok: true, indistinguishable from a real success', body.ok === true)
  check('NEITHER Turnstile nor Resend was ever called', fetchMock.calls.length === 0, `${fetchMock.calls.length} call(s) made`)
  check('and nothing was written to the database', honeypotDb.writes.length === 0, `${honeypotDb.writes.length} write(s)`)
}

// --- Turnstile: missing token never reaches the verify API at all -------------
{
  const fetchMock = mockFetch({})
  globalThis.fetch = fetchMock
  const {['cf-turnstile-response']: _drop, ...withoutToken} = VALID_FIELDS
  const res = await onRequestPost({request: post(withoutToken), env: {...ENV, DB: mockDb()}})
  check('a missing Turnstile token is rejected with 400', res.status === 400)
  check('and no outbound call is made for it - nothing to verify', fetchMock.calls.length === 0)
}

// --- Turnstile: present but rejected by Cloudflare -----------------------------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: false})],
  })
  globalThis.fetch = fetchMock
  const turnstileFailDb = mockDb()
  const res = await onRequestPost({request: post(VALID_FIELDS), env: {...ENV, DB: turnstileFailDb}})
  const body = await res.json()
  check('a failed Turnstile verification is rejected with 400', res.status === 400)
  check('nothing is stored when Turnstile fails', turnstileFailDb.writes.length === 0, `${turnstileFailDb.writes.length} write(s)`)
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
    'api.resend.com': [jsonRes(200, {id: 'email1'})],
  })
  globalThis.fetch = fetchMock

  const padded = {...ENV, DB: mockDb(), TURNSTILE_SECRET_KEY: `  ${ENV.TURNSTILE_SECRET_KEY}\n`}
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
  const invalidDb = mockDb()
  const res = await onRequestPost({
    request: post({...VALID_FIELDS, email: 'not-an-email'}),
    env: {...ENV, DB: invalidDb},
  })
  check('an invalid email is rejected even after Turnstile passes', res.status === 400)
  check('nothing is stored for an invalid submission', invalidDb.writes.length === 0, `${invalidDb.writes.length} write(s)`)
}

/*
  --- a database failure is reported honestly, not papered over ----------------

  D1 signals failure by THROWING, where fetch returns a non-ok response. An
  uncaught throw inside a Pages Function is a bare 500 with no body, so a
  visitor would watch a filled-in form vanish into a blank error page with no
  idea their enquiry never arrived and no route to a human.
*/
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
  })
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post(VALID_FIELDS), env: {...ENV, DB: mockDb({fails: true})}})
  const body = await res.json()
  check('a database failure surfaces as a real error, not a 200', res.status >= 500, res.status)
  check('and directs the visitor to a fallback that does not depend on it', /email/i.test(body.message))
  check(
    'no notification claims an enquiry arrived when none was stored',
    !fetchMock.calls.some((c) => c.url.includes('api.resend.com')),
  )
}

// --- Resend failing must NOT undo an already-committed row --------------------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.resend.com': [jsonRes(500, {error: 'resend is down'})],
  })
  globalThis.fetch = fetchMock
  const resendFailDb = mockDb()
  const res = await onRequestPost({request: post(VALID_FIELDS), env: {...ENV, DB: resendFailDb}})
  const body = await res.json()
  check(
    'the submission still succeeds when only the email notification fails - the enquiry is already saved',
    res.status === 200 && body.ok === true,
  )
  /*
    Two HTTP calls now, not three: the storage step moved from Sanity's REST
    API to a D1 binding, which is not fetch. Asserting the row landed as well
    as the calls being made - "Resend failed but the enquiry survived" is the
    entire point of this case, and counting fetches alone would not show it.
  */
  check('both HTTP calls were still attempted, in order', fetchMock.calls.length === 2, `${fetchMock.calls.length}`)
  check('and the enquiry was committed despite the email failing', resendFailDb.writes.length === 1)
}

// --- "not sure yet" budget is accepted through the whole pipeline -----------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.resend.com': [jsonRes(200, {id: 'email3'})],
  })
  globalThis.fetch = fetchMock
  const notSureDb = mockDb()
  const {budgetMin: _m, budgetMax: _x, ...rest} = VALID_FIELDS
  const res = await onRequestPost({
    request: post({...rest, budgetNotSure: 'true'}),
    env: {...ENV, DB: notSureDb},
  })
  check('a "not sure yet" submission with no budget numbers still succeeds', res.status === 200)

  /*
    NULL, not 0. Storing zero for "I do not know my budget" makes it
    indistinguishable from someone answering "nothing" - a different enquiry,
    and the same conflation behind the Number('') === 0 bug caught before
    launch. The column is nullable specifically so these stay distinct.
  */
  const {params} = notSureDb.writes[0]
  check('budget_not_sure is stored as 1', params.includes(1))
  check(
    'the budget columns are NULL rather than 0',
    params.filter((v) => v === null).length === 2,
    `${params.filter((v) => v === null).length} null(s), ${params.filter((v) => v === 0).length} zero(s)`,
  )
}

// --- the no-JS fallback: no Accept header -> HTML, not JSON -------------------
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.resend.com': [jsonRes(200, {id: 'email4'})],
  })
  globalThis.fetch = fetchMock
  const res = await onRequestPost({request: post(VALID_FIELDS, {Accept: 'text/html'}), env: {...ENV, DB: mockDb()}})
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

/*
  --- the notification's From and Reply-To --------------------------------------

  The first real enquiry's notification landed in SPAM. Not a bug in this code:
  it sends from Resend's shared onboarding@resend.dev, which carries no SPF or
  DKIM tying it to rumeaudesign.co, so filters treat it as unauthenticated bulk
  mail. Fixing that needs a verified sending domain, which needs DNS records
  only Chris can add.

  Hard-coding the new address would have made the switchover dangerous, since
  Resend REFUSES to send from an unverified domain: shipping
  enquiries@rumeaudesign.co even minutes early turns every notification into a
  silent failure, and this whole block is best-effort by design so nothing
  surfaces. Hence a variable with the working address as its fallback - correct
  before verification and after, with the switch under Chris's control.
*/
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.resend.com': [jsonRes(200, {id: 'email5'})],
  })
  globalThis.fetch = fetchMock
  await onRequestPost({request: post(VALID_FIELDS), env: {...ENV, DB: mockDb()}})

  const email = JSON.parse(fetchMock.calls.find((c) => c.url.includes('resend')).init.body)
  check(
    'with CONTACT_FROM_EMAIL unset, it falls back to a working sender',
    email.from.includes('onboarding@resend.dev'),
    email.from,
  )
  /*
    Reply-To is the enquirer. Without it, hitting Reply on a notification
    answers Resend's shared address - so a reply meant for a prospective
    client goes nowhere, while looking sent from Chris's side.
  */
  check('Reply-To is the enquirer, not the sending address', email.reply_to === VALID_FIELDS.email, email.reply_to)

  /*
    No dead links in the notification. This shipped pointing at
    /admin/enquiries - a page that was planned and never built - and Chris
    found the 404 in a real enquiry email. Cheap to assert, and the kind of
    thing that gets re-added the next time an admin page is imagined.
  */
  check('the email contains no /admin/ link', !/\/admin\//.test(email.text), email.text.split('\n').at(-1))
  check('every submitted field is in the body, so no link is needed', 
    [VALID_FIELDS.name, VALID_FIELDS.email, VALID_FIELDS.goals, VALID_FIELDS.phone].every((v) => email.text.includes(v)))
}

{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.resend.com': [jsonRes(200, {id: 'email6'})],
  })
  globalThis.fetch = fetchMock
  await onRequestPost({
    request: post(VALID_FIELDS),
    // Trailing whitespace on purpose: this value gets pasted into a dashboard,
    // and a stray newline on the Turnstile secret already cost an afternoon
    // once. An address with a newline in it is rejected outright by Resend.
    env: {...ENV, DB: mockDb(), CONTACT_FROM_EMAIL: '  Rumeau Design Co <enquiries@rumeaudesign.co>\n'},
  })

  const email = JSON.parse(fetchMock.calls.find((c) => c.url.includes('resend')).init.body)
  check(
    'a configured sender is used instead of the fallback',
    email.from === 'Rumeau Design Co <enquiries@rumeaudesign.co>',
    JSON.stringify(email.from),
  )
}

// An empty-string env var is what a cleared dashboard field leaves behind, and
// it must fall back rather than send from nothing.
{
  const fetchMock = mockFetch({
    'turnstile/v0/siteverify': [jsonRes(200, {success: true})],
    'api.resend.com': [jsonRes(200, {id: 'email7'})],
  })
  globalThis.fetch = fetchMock
  await onRequestPost({request: post(VALID_FIELDS), env: {...ENV, DB: mockDb(), CONTACT_FROM_EMAIL: '   '}})

  const email = JSON.parse(fetchMock.calls.find((c) => c.url.includes('resend')).init.body)
  check(
    'a blank CONTACT_FROM_EMAIL falls back rather than sending from nothing',
    email.from.includes('onboarding@resend.dev'),
    JSON.stringify(email.from),
  )
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
