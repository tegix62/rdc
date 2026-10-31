/*
  The votes endpoint (functions/api/votes.ts), run against a real SQLite
  database standing in for D1 - no deploy, no network. Turnstile is answered
  here too: the token "good" passes, anything else fails.

  Usage: node --experimental-strip-types scripts/test-votes-api.mjs
*/
import {DatabaseSync} from 'node:sqlite'
import {onRequestGet, onRequestPost} from '../functions/api/votes.ts'
import * as endorse from '../functions/api/endorse.ts'
import {readSign} from '../src/lib/endorse.ts'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures++
}

// D1's shape over node:sqlite.
const d1 = () => {
  const db = new DatabaseSync(':memory:')
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    run: async () => db.prepare(sql).run(...args),
    all: async () => ({results: db.prepare(sql).all(...args)}),
    first: async () => db.prepare(sql).get(...args) ?? null,
  })
  return {raw: db, prepare: (sql) => statement(sql), batch: async (s) => Promise.all(s.map((x) => x.run()))}
}

const mail = []
globalThis.fetch = async (url, init) => {
  if (String(url).includes('turnstile')) return new Response(JSON.stringify({success: init.body.get('response') === 'good'}))
  if (String(url).includes('resend')) {
    mail.push(JSON.parse(init.body))
    return new Response('{}')
  }
  throw new Error(`unexpected fetch ${url}`)
}

const post = (env, body, ip = '203.0.113.7') =>
  onRequestPost({env, request: new Request('https://x/api/votes', {method: 'POST', headers: {'CF-Connecting-IP': ip}, body: JSON.stringify(body)})}).then(async (r) => ({status: r.status, ...(await r.json())}))
const counts = async (env) => (await (await onRequestGet({env, request: new Request('https://x/api/votes')})).json())

const a = 'aaaaaaaaaaaaaaaaaaaa'
const b = 'bbbbbbbbbbbbbbbbbbbb'

{
  const env = {DB: d1()}
  check('no database: 503, not a crash', (await post({}, {piece: 'p1', visitor: a})).status === 503)
  check('a bad piece id is refused', (await post(env, {piece: 'p 1;', visitor: a})).status === 400)
  check('a bad visitor id is refused', (await post(env, {piece: 'p1', visitor: 'x'})).status === 400)

  const r = await post(env, {piece: 'p1', visitor: a})
  check('a vote counts', r.ok && r.on, JSON.stringify(r))
  await post(env, {piece: 'p1', visitor: a})
  let c = await counts(env)
  check('the same person twice is one vote', c.counts.find((x) => x.id === 'p1')?.n === 1, JSON.stringify(c))
  await post(env, {piece: 'p1', visitor: b}, '198.51.100.2')
  await post(env, {piece: 'p2', visitor: b}, '198.51.100.2')
  c = await counts(env)
  check('two people, two pieces: counted and ranked', c.total === 3 && c.voters === 2 && c.counts[0].id === 'p1' && c.counts[0].n === 2, JSON.stringify(c))
  await post(env, {piece: 'p1', visitor: a, on: false})
  c = await counts(env)
  check('taking a vote back removes it', c.counts.find((x) => x.id === 'p1')?.n === 1, JSON.stringify(c))

  const rows = env.DB.raw.prepare('SELECT * FROM votes').all()
  check('no IP address is stored', !JSON.stringify(rows).includes('203.0.113.7') && !JSON.stringify(rows).includes('198.51.100.2'), JSON.stringify(rows[0]))
  const salts = env.DB.raw.prepare('SELECT * FROM vote_salts').all()
  check("one salt, today's", salts.length === 1 && salts[0].day === new Date().toISOString().slice(0, 10))
}

{
  // Stuffing one piece from one address with fresh browser ids.
  const env = {DB: d1()}
  for (let i = 0; i < 10; i++) await post(env, {piece: 'p1', visitor: `stuff${String(i).padStart(15, '0')}`})
  const c = await counts(env)
  check('one address cannot stuff one piece: at most 2 count unchecked', c.counts[0]?.n === 2, JSON.stringify(c))
  for (let i = 0; i < 80; i++) await post(env, {piece: `q${i}`, visitor: 'spray000000000000000'})
  const n = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM votes WHERE visitor = 'spray000000000000000'").get().n
  check("one address's day is capped (60 unchecked, less what it already used)", n <= 60 && n >= 50, `${n}`)
}

{
  // Turnstile: once passed, the larger allowance.
  const env = {DB: d1(), TURNSTILE_SECRET_KEY: 'secret'}
  const bad = await post(env, {piece: 'p1', visitor: a, token: 'nope'})
  check('a failed spam check still votes, unchecked', bad.ok && !bad.verified)
  const good = await post(env, {piece: 'p2', visitor: a, token: 'good'})
  check('a passed spam check is remembered for that browser', good.ok && good.verified)
  const later = await post(env, {piece: 'p3', visitor: a})
  check('and needs no token after', later.verified === true)
  for (let i = 0; i < 6; i++) {
    const v = `chk${String(i).padStart(17, '0')}`
    await post(env, {piece: 'z1', visitor: v, token: 'good'})
  }
  const c = await counts(env)
  check('checked browsers on one address: one piece counts at most 4', c.counts.find((x) => x.id === 'z1')?.n === 4, JSON.stringify(c.counts))
}

/*
  Signed votes: a name rides on a person's votes, public names wait for
  Chris, his link is signed by the server, and only shown names are listed.
*/
{
  check('a signature is cleaned: spaces, controls, a link without https', JSON.stringify(readSign({name: '  Sam \u202e Lee ', link: 'samlee.design'})) === JSON.stringify({name: 'Sam Lee', link: 'https://samlee.design/', public: true}), JSON.stringify(readSign({name: '  Sam \u202e Lee ', link: 'samlee.design'})))
  check('a bare @handle links to Instagram', readSign({name: '@sam.lee'}).link === 'https://www.instagram.com/sam.lee/')
  check('a javascript: link is dropped', readSign({name: 'X', link: 'javascript:alert(1)'}).link === '')
  check('no name, no signature', readSign({name: '   ', link: 'https://a.b'}) === null)

  const env = {DB: d1(), RESEND_API_KEY: 'test-key', CONTACT_NOTIFY_EMAIL: 'chris@example.com'}
  const v = 'signsignsignsignsign'
  const r = await post(env, {piece: 'p1', visitor: v, sign: {name: '@sam.lee', public: true}})
  check('a public signature waits for Chris', r.ok && r.signed === 'pending', JSON.stringify(r))
  check('and mails him once, with both links', mail.length === 1 && /do=show&amp;sig=|do=show&sig=/.test(mail[0].html) && /do=hide/.test(mail[0].html), mail[0]?.subject)
  await post(env, {piece: 'p2', visitor: v, sign: {name: '@sam.lee', public: true}})
  check('the same name on another vote: no second email', mail.length === 1)

  const list = async () => (await (await endorse.onRequestGet({env, request: new Request('https://x/api/endorse')})).json()).names
  check('not listed before Chris says so', (await list()).length === 0)

  const showUrl = mail[0].html.match(/href="([^"]*do=show[^"]*)"/)[1].replace(/&amp;/g, '&')
  const forged = showUrl.replace(/sig=\w+/, 'sig=0000')
  check('a forged link is refused', (await endorse.onRequestPost({env, request: new Request(forged, {method: 'POST'})})).status === 403)
  const opened = await endorse.onRequestGet({env, request: new Request(showUrl)})
  check('opening his link changes nothing - it asks, with a button', opened.status === 200 && (await list()).length === 0 && /<button>/.test(await opened.text()))
  await endorse.onRequestPost({env, request: new Request(showUrl, {method: 'POST'})})
  const shown = await list()
  check('his button shows the name against every piece they voted for', shown.length === 2 && shown.every((n) => n.name === '@sam.lee' && n.link === 'https://www.instagram.com/sam.lee/'), JSON.stringify(shown))

  await post(env, {piece: 'p1', visitor: v, on: false})
  check('a vote taken back takes the name off that piece', (await list()).length === 1)

  await post(env, {piece: 'p3', visitor: v, sign: {name: '@sam.lee', public: false}})
  check('turning it private takes it off the site at once', (await list()).length === 0)
  await endorse.onRequestPost({env, request: new Request(showUrl, {method: 'POST'})})
  check("and Chris's old link cannot put it back", (await list()).length === 0)

  const w = 'renamerenamerenamere'
  await post(env, {piece: 'p1', visitor: w, sign: {name: 'Ana', public: true}})
  const anaShow = mail.at(-1).html.match(/href="([^"]*do=show[^"]*)"/)[1].replace(/&amp;/g, '&')
  await endorse.onRequestPost({env, request: new Request(anaShow, {method: 'POST'})})
  const before = mail.length
  const renamed = await post(env, {piece: 'p1', visitor: w, sign: {name: 'Ana <script>', public: true}})
  check('a changed name goes back to waiting, and asks again', renamed.signed === 'pending' && mail.length === before + 1 && (await list()).length === 0)
  check('and the email shows it as text, not markup', /Ana &lt;script&gt;/.test(mail.at(-1).html))

  const sent = mail.length
  for (let i = 0; i < 6; i++) await post(env, {piece: 'p1', visitor: `flood${String(i).padStart(15, '0')}`, sign: {name: `Bot ${i}`, public: true}}, '192.0.2.50')
  check('one connection puts at most 3 new names before Chris a day; the rest kept private', mail.length - sent === 3, `${mail.length - sent} emails`)

  const noKey = {DB: d1()}
  const quiet = await post(noKey, {piece: 'p1', visitor: v, sign: {name: 'Sam', public: true}})
  check('with no email key: kept waiting, nothing sent, no crash', quiet.ok && quiet.signed === 'pending')
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
