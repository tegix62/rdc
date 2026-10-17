/*
  ONE CONTACT, NOT TWO - the forward from /contact, written at build time.

  Every Contact and Let's Work button follows Site Settings -> contactUrl,
  which points at Chris's Tally form ("I think I want the tally form to stay
  for now"). The site's own form at /contact is built regardless and works
  end to end, so a search could land someone on a second, different form.

  So when contactUrl points off the site, this appends a redirect for
  /contact to dist/_redirects and Cloudflare forwards it before any page is
  served. The page itself stays a real, complete page in the build, so every
  check that walks dist (head, CSS, a11y) sees what it always saw. Clear
  contactUrl and the next build writes no redirect: /contact is the form
  again, and sitemap.xml.ts lists it again - the same field drives both.

  302, because this is a setting rather than a move: a 301 is cached by
  browsers and would keep sending people to Tally after the field changed.

  Published document only (no drafts), read without a token - the dataset is
  public-read. If Sanity cannot be reached the build carries on with no
  redirect, which leaves a working form at /contact: the safe way to fail.

  Usage: node scripts/contact-redirect.mjs [dist]
*/
import {appendFileSync, existsSync, readFileSync} from 'node:fs'
import path from 'node:path'

const dist = process.argv[2] ?? 'dist'
const PROJECT_ID = '8337vjtf'
const DATASET = 'production'
const query = `*[_type == "siteSettings" && !(_id in path("drafts.**"))][0].contactUrl`

let contactUrl = null
try {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  contactUrl = (await res.json()).result
} catch (err) {
  console.warn(`[contact-redirect] could not read contactUrl (${err.message}) - no redirect written`)
  process.exit(0)
}

const target = typeof contactUrl === 'string' ? contactUrl.trim() : ''
if (!/^https?:\/\/\S+$/.test(target)) {
  console.log('[contact-redirect] Contact points at this site - /contact stays the form')
  process.exit(0)
}

const file = path.join(dist, '_redirects')
const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
const lines = [
  '',
  '# Written by scripts/contact-redirect.mjs: Site Settings -> contactUrl points',
  '# off the site, so /contact forwards there rather than being a second form.',
  `/contact   ${target}   302`,
  `/contact/  ${target}   302`,
  '',
]
appendFileSync(file, (existing.endsWith('\n') || !existing ? '' : '\n') + lines.join('\n'))
console.log(`[contact-redirect] /contact -> ${target} (302)`)
