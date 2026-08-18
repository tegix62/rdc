/*
  Did the /contact fixes from 18 August 2026 actually reach the live domain?

  WHY THIS EXISTS RATHER THAN TRUSTING THE DEPLOY WORKFLOW'S OWN "VERIFY WHAT
  IS LIVE" STEP

  That step (in deploy-production.yml) confirms the build-commit meta tag on
  "/" matches the commit that was just deployed, plus robots.txt, canonical,
  noindex and the editing overlay. None of that proves any PARTICULAR fix
  shipped - it proves the deploy pipeline worked, not that a specific line of
  copy or CSS is what a visitor's browser actually receives. Chris reported
  not seeing the intro-text and slider fixes right after both checks passed,
  which is exactly the gap this closes: this script fetches the real page and
  the real stylesheet and greps for the specific strings those two fixes
  depend on.

  READ-ONLY. GETs only, run from GitHub Actions because this repo's sandbox
  cannot reach the public internet.

  Usage: node scripts/check-contact-live.mjs [origin]
*/
const origin = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/+$/, '')

let failures = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`ok    ${label}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${label}${detail ? ` - ${detail}` : ''}`)
  }
}

const get = async (url) => {
  const res = await fetch(url, {cache: 'no-store'})
  return {status: res.status, body: await res.text()}
}

console.log(`\nFetching ${origin}/contact ...\n`)
const page = await get(`${origin}/contact`)
ok('the page loads', page.status === 200, `HTTP ${page.status}`)

const commit = page.body.match(/name="build-commit" content="([^"]*)"/)?.[1]
console.log(`  build-commit on this response: ${commit ?? '(none found)'}\n`)

ok(
  'the intro line is the restored 1-minute wording',
  page.body.includes('This 1-minute form is designed to help understand your business'),
)
ok(
  'the old intro line is gone',
  !page.body.includes('This form takes about a minute. I read every one myself'),
)

const cssHrefs = [...page.body.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
  (m) => m[1],
)
ok('the page links at least one stylesheet', cssHrefs.length > 0, `${cssHrefs.length} found`)

/*
  NOT a check for the slider fix's CSS text. There used to be one here -
  grepping the shipped stylesheet for `.budget-slider__labels` and a specific
  margin value - and it passed while the fix was still visibly broken on the
  real page, because the rule text was present and correct and STILL lost to
  CSS margin collapsing. "The right CSS shipped" and "the boxes don't
  overlap" are different claims; only a real rendered measurement proves the
  second one. See scripts/debug-budget-slider-live.mjs, which does that with
  Playwright - run it by hand after any slider change rather than trusting a
  grep here again.
*/

console.log(`\n${'='.repeat(74)}`)
console.log(
  failures
    ? `${failures} check(s) FAILED - the deploy pipeline may be green while the CDN, a`
    : 'All checks passed - both fixes are live in what a real visitor receives.',
)
if (failures) {
  console.log(
    'cache in front of it, or an edge/CDN cache is still serving something older.',
  )
}
console.log(`${'='.repeat(74)}\n`)
process.exit(failures ? 1 : 0)
