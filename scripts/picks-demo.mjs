/*
  A demo picks board, so the apparatus can be tried end to end before Chris
  makes his own: a public VOTE over the whole All view, labelled as a demo
  in Studio's Picks tool, where it can be deleted.

  Also checks the one thing the design rests on: that a board at a dotted
  id ("picks.<code>") is NOT served by the public API. If it were, a
  pitch's note and its results key would be readable by anyone.

  Prints the board's code (its address), never its results key - this
  repository's workflow logs are public.

  Usage: SANITY_API_TOKEN=... node scripts/picks-demo.mjs
*/
import {randomBytes} from 'node:crypto'

const TOKEN = process.env.SANITY_API_TOKEN
if (!TOKEN) throw new Error('SANITY_API_TOKEN is required.')
const API = 'https://8337vjtf.api.sanity.io/v2024-01-01'
const auth = {authorization: `Bearer ${TOKEN}`}
const random = (n) => Array.from(randomBytes(n), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
const query = async (q, withToken) =>
  (await (await fetch(`${API}/data/query/production?query=${encodeURIComponent(q)}`, {headers: withToken ? auth : {}})).json()).result

let demo = await query(`*[_type == "picksBoard" && _id in path("picks.**") && label == "Demo vote"][0]{code}`, true)
if (!demo) {
  const code = random(10)
  const res = await fetch(`${API}/data/mutate/production`, {
    method: 'POST',
    headers: {...auth, 'content-type': 'application/json'},
    body: JSON.stringify({
      mutations: [
        {
          create: {
            _id: `picks.${code}`,
            _type: 'picksBoard',
            code,
            key: random(24),
            kind: 'vote',
            label: 'Demo vote',
            heading: 'Which do you like most?',
            note: 'A demo, made to try the picks out. Delete it any time in Studio > Picks.',
            collect: true,
            open: true,
          },
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`create: ${res.status} ${await res.text()}`)
  demo = {code}
  console.log(`made the demo vote: /picks/${code}/`)
} else console.log(`the demo vote exists: /picks/${demo.code}/`)

const open = await query(`*[_id == "picks.${demo.code}"]{_id}`, false)
console.log(open.length === 0 ? 'private: the public API does not serve it - good' : 'NOT PRIVATE: the public API serves the board')
if (open.length) process.exit(1)
