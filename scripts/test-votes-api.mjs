/*
  The votes endpoint (functions/api/votes.ts), run against a real SQLite
  database standing in for D1 - no deploy, no network. Turnstile is answered
  here too: the token "good" passes, anything else fails.

  Usage: node --experimental-strip-types scripts/test-votes-api.mjs
*/
import {DatabaseSync} from 'node:sqlite'
import {onRequestGet, onRequestPost} from '../functions/api/votes.ts'

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

globalThis.fetch = async (url, init) => {
  if (String(url).includes('turnstile')) return new Response(JSON.stringify({success: init.body.get('response') === 'good'}))
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

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
