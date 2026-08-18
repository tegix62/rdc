/*
  countryRequiresConsent() is the one piece of functions/_middleware.ts that
  can actually be tested from this repo's own sandbox - HTMLRewriter and
  request.cf are real Cloudflare Workers runtime globals, not available in
  plain Node.js, so the removal mechanics can only be reasoned about against
  Cloudflare's documented behaviour. This is the part most likely to actually
  be wrong in a way that matters: a mistyped or missing country code means
  the pixel keeps firing somewhere it legally should not, silently.

  Usage: node scripts/test-pixel-geofence.mjs
*/
import { countryRequiresConsent, CONSENT_REQUIRED_COUNTRIES } from '../src/lib/pixelGeofence.ts'

let failures = 0
const check = (name, actual, expected) => {
  if (actual === expected) console.log(`ok    ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// A representative sample, not every code - the set itself is short enough
// to read in src/lib/pixelGeofence.ts directly.
check('Germany requires consent', countryRequiresConsent('DE'), true)
check('France requires consent', countryRequiresConsent('FR'), true)
check('the UK requires consent', countryRequiresConsent('GB'), true)
check('Ireland requires consent', countryRequiresConsent('IE'), true)
check('Norway (EEA, not EU) requires consent', countryRequiresConsent('NO'), true)
check('Iceland (EEA, not EU) requires consent', countryRequiresConsent('IS'), true)
check('Liechtenstein (EEA, not EU) requires consent', countryRequiresConsent('LI'), true)

check('the US does not require consent', countryRequiresConsent('US'), false)
check('Canada does not require consent', countryRequiresConsent('CA'), false)
check(
  'Switzerland (EU-adjacent, but not EU/EEA) does not require consent',
  countryRequiresConsent('CH'),
  false,
)

// Malformed/missing input must fail SAFE - "unknown" is not evidence that
// consent is required, and this must never throw, since functions/_middleware.ts
// calls it on every single HTML response the site serves.
check('lowercase input still matches (Cloudflare sends uppercase, but do not trust that)', countryRequiresConsent('de'), true)
check('empty string does not require consent', countryRequiresConsent(''), false)
check('undefined does not require consent', countryRequiresConsent(undefined), false)
check('null does not require consent', countryRequiresConsent(null), false)
check('a nonsense code does not require consent', countryRequiresConsent('XX'), false)

// The set itself: exactly 31 codes (27 EU + UK + 3 EEA), no accidental
// duplicates from typing the same code twice.
check('the set has no duplicate entries', CONSENT_REQUIRED_COUNTRIES.size, 31)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
