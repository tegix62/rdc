/*
  Phase 3 of docs/launch.md, run against the real domain instead of by eye.

  WHY THIS IS A SCRIPT AND NOT A CHECKLIST

  Two of these checks have no visible symptom, which is the whole reason they are
  on the launch list:

    robots.txt   A production build made with the preview flag set says
                 `Disallow: /`. The site looks perfect to every visitor and is
                 invisible to Google. Nothing on the page hints at it.
    canonical    A build that canonicalises to the preview host tells Google the
                 real domain is a copy of a pages.dev URL. Also invisible.

  And one of them is easy to get wrong in a way that looks like success: a
  www -> apex redirect that fires but drops the path sends every inbound link
  anyone ever posted to your front door. The redirect works; the link is dead.

  Everything here is a GET against the live site. It writes nothing and needs no
  credentials.

  Usage: node scripts/check-live.mjs [https://rumeaudesign.co]
*/
const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const HOST = new URL(BASE).host
const WWW = `https://www.${HOST.replace(/^www\./, '')}`

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
}

/*
  redirect: 'manual' so a 301 is reported rather than followed. Following them is
  the default, which would make a redirect that loses the path indistinguishable
  from one that keeps it - the check would pass on the broken case.
*/
const get = async (url, {follow = true} = {}) => {
  try {
    const res = await fetch(url, {redirect: follow ? 'follow' : 'manual'})
    return {
      status: res.status,
      location: res.headers.get('location'),
      cacheControl: res.headers.get('cache-control'),
      body: await res.text(),
      url: res.url,
    }
  } catch (error) {
    return {status: 0, error: error.message, body: ''}
  }
}

console.log(`Checking ${BASE}\n`)

// --- the site is actually there ----------------------------------------------
const home = await get(`${BASE}/`)
check('the homepage responds 200', home.status === 200, home.error ?? `HTTP ${home.status}`)
if (home.status !== 200) {
  console.log('\nNothing else is worth checking until the homepage loads.')
  process.exit(1)
}

// Which commit built what is live, so "I deployed" and "this is deployed" are
// different statements that can be compared.
const commit = home.body.match(/<meta name="build-commit" content="([^"]*)"/)?.[1]
console.log(`      built from commit ${commit ?? '(not stated)'}\n`)

/*
  public/_headers, checked against what Cloudflare actually SENDS, not just
  what the file says - a typo in the pattern syntax there would fail silently
  (Cloudflare ignores a rule it cannot parse rather than erroring), so this is
  the only check that can catch that class of mistake. See
  scripts/test-headers.mjs for the build-time check on the file itself; this
  is the live-request check on top of it.
*/
check(
  'the homepage is NOT cached by the browser',
  (home.cacheControl ?? '').includes('no-cache'),
  home.cacheControl ?? '(no Cache-Control header at all)',
)

const assetHref = home.body.match(/\/_astro\/[^"'\s)]+\.(?:css|js)/)?.[0]
if (assetHref) {
  const asset = await get(`${BASE}${assetHref}`)
  check(
    `a hashed build asset (${assetHref}) is cached for a year and marked immutable`,
    (asset.cacheControl ?? '').includes('max-age=31536000') && (asset.cacheControl ?? '').includes('immutable'),
    asset.cacheControl ?? '(no Cache-Control header at all)',
  )
} else {
  check('a hashed /_astro/ asset was found on the homepage to check caching on', false, 'none referenced in the HTML')
}

/*
  /contact and its Turnstile widget.

  Every check here has a silent failure mode. A missing site key renders a
  "spam check not configured" note and rejects every real enquiry; a leftover
  Cloudflare TEST key renders a widget that always passes and cannot verify
  server-side. Both look like a working form to anyone glancing at the page,
  and the only symptom is enquiries that never arrive - which is exactly the
  thing nobody notices, because a form that eats submissions looks identical
  to a quiet week.
*/
const contact = await get(`${BASE}/contact`)
check('/contact responds 200', contact.status === 200, `HTTP ${contact.status}`)
if (contact.status === 200) {
  const siteKey = contact.body.match(/cf-turnstile[^>]+data-sitekey="([^"]+)"/)?.[1]
  check(
    'the Turnstile widget has a real site key baked in',
    Boolean(siteKey),
    siteKey ? undefined : 'shows the "spam check not configured" placeholder - PUBLIC_TURNSTILE_SITE_KEY was not set at build time',
  )
  /*
    Printed in full deliberately: a site key is public by definition, sitting
    in the HTML of every visitor's page, so there is nothing to protect and a
    real question to settle - WHICH key is live. Cloudflare's test keys all
    begin 1x/2x/3x, and a test site key left in place is a widget that waves
    every bot through.
  */
  if (siteKey) {
    console.log(`      live site key: ${siteKey} (${siteKey.length} chars)`)
    check(
      'the live site key is a real one, not a Cloudflare test key',
      !/^[123]x/.test(siteKey),
      /^[123]x/.test(siteKey) ? 'this is a TEST key - it passes everything, including bots' : undefined,
    )
  }
  check(
    "Turnstile's own script is loaded",
    contact.body.includes('challenges.cloudflare.com/turnstile'),
  )
  /*
    The form must work with JavaScript off, which is the reason every fieldset
    is in the markup rather than being built at runtime. If a build ever
    started shipping the steps hidden, a no-JS visitor would get a form with
    one visible question and no way forward.
  */
  check(
    'every step is present in the raw HTML (works without JavaScript)',
    (contact.body.match(/<fieldset/g) ?? []).length >= 5,
    `${(contact.body.match(/<fieldset/g) ?? []).length} fieldset(s)`,
  )
}

/*
  The Function behind the form. A GET is answered 405 by design - the handler
  only accepts POST - and that is precisely what makes it a useful check: 405
  proves the Function is DEPLOYED, where 404 would mean Cloudflare never picked
  it up and every submission dies at the last step. Those look identical from
  the form itself, which just says something broke.
*/
const contactApi = await get(`${BASE}/api/contact`)
check(
  'the contact Function is deployed (405 on GET, not 404)',
  contactApi.status === 405,
  `HTTP ${contactApi.status}${contactApi.status === 404 ? ' - Cloudflare has not picked up functions/api/contact.ts, so every submission will fail' : ''}`,
)

// --- robots.txt: the invisible one -------------------------------------------
const robots = await get(`${BASE}/robots.txt`)
check('robots.txt is served', robots.status === 200, `HTTP ${robots.status}`)
check(
  'robots.txt ALLOWS crawling',
  /^\s*Allow:\s*\/\s*$/im.test(robots.body) && !/^\s*Disallow:\s*\/\s*$/im.test(robots.body),
  /Disallow:\s*\/\s*$/im.test(robots.body)
    ? 'SAYS Disallow: / - this build was made with the preview flag set, and the whole site is hidden from Google'
    : robots.body.trim().split('\n').join(' | '),
)
check(
  'robots.txt points at the sitemap on THIS domain',
  robots.body.includes(`${BASE}/sitemap.xml`),
  robots.body.match(/Sitemap:.*/)?.[0] ?? 'no Sitemap line',
)

// --- sitemap ------------------------------------------------------------------
const sitemap = await get(`${BASE}/sitemap.xml`)
check('sitemap.xml is served', sitemap.status === 200, `HTTP ${sitemap.status}`)
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
check('sitemap lists URLs', locs.length > 0, `${locs.length} entries`)
const offDomain = locs.filter((l) => !l.startsWith(`${BASE}/`) && l !== `${BASE}/`)
check(
  'every sitemap URL is on the real domain',
  offDomain.length === 0,
  offDomain.length ? `${offDomain.length} point elsewhere, e.g. ${offDomain[0]}` : `all ${locs.length}`,
)
const images = [...sitemap.body.matchAll(/<image:loc>/g)].length
check('sitemap declares project images', images > 0, `${images} images`)

// --- canonical: the other invisible one --------------------------------------
const canonical = home.body.match(/<link rel="canonical" href="([^"]*)"/)?.[1]
check(
  'the homepage canonical is the real domain',
  canonical === `${BASE}/`,
  canonical ?? 'no canonical at all',
)

const robotsMeta = home.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? ''
check('the homepage is not noindexed', !/noindex/i.test(robotsMeta), robotsMeta || '(no robots meta)')
check('large image previews are opted into', /max-image-preview:large/.test(robotsMeta), robotsMeta)

// Visual editing must never reach production: it ships a live-editing overlay
// and connects every visitor's browser to Sanity.
check('no visual-editing overlay on production', !home.body.includes('sanity-visual-editing'), '')

// --- www -> apex, path preserved ---------------------------------------------
const wwwRoot = await get(`${WWW}/`, {follow: false})
check(
  'www redirects with a 301',
  wwwRoot.status === 301,
  `HTTP ${wwwRoot.status}${wwwRoot.location ? ` -> ${wwwRoot.location}` : ''}`,
)

/*
  The check that distinguishes a working redirect from one that merely fires. A
  rule that sends every www URL to the homepage looks correct in a browser and
  silently discards every inbound link to a specific page.
*/
const wwwPath = await get(`${WWW}/portfolio`, {follow: false})
check(
  'www redirect KEEPS the path',
  wwwPath.location === `${BASE}/portfolio`,
  `-> ${wwwPath.location ?? '(no Location header)'}`,
)

const wwwQuery = await get(`${WWW}/portfolio?ref=instagram`, {follow: false})
check(
  'www redirect keeps the query string',
  (wwwQuery.location ?? '').includes('ref=instagram') &&
    !/ref=instagram.*ref=instagram/.test(wwwQuery.location ?? ''),
  `-> ${wwwQuery.location ?? '(none)'}`,
)

// --- the old Webflow URLs -----------------------------------------------------
/*
  These are what preserve whatever the old site had earned. A 301 to a 404 is
  worse than no redirect: it tells a crawler the page moved permanently to a dead
  end, throwing away the ranking the redirect exists to pass on.
*/
for (const [from, to] of [
  ['/case-studies/dumpstat-podcast', '/work/dumpstat'],
  ['/case-studies/hug-a-mug-coffeehouse-ceramics-studio', '/work/hug-a-mug'],
  ['/post/logo-design-worth-paying-for', '/blog/logo-design-worth-paying-for'],
]) {
  const res = await get(`${BASE}${from}`, {follow: false})
  const landed = res.location?.replace(BASE, '') ?? ''
  check(`${from} redirects to ${to}`, res.status === 301 && landed === to, `HTTP ${res.status} -> ${landed || '(none)'}`)
  if (res.status === 301) {
    const target = await get(`${BASE}${to}`)
    check(`  …and ${to} is a real page`, target.status === 200, `HTTP ${target.status}`)
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nEverything Phase 3 checks for is correct.')
process.exit(failures ? 1 : 0)
