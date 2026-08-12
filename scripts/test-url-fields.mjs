/*
  Guard against the specific mistake that cost us an hour tonight.

  The url checker reported "None. Every url field is valid" about a Site
  Settings document whose clientLogos[].href values were the very thing
  disabling Chris's Publish button. It was not that the rule was wrong - it was
  that the checker never looked inside the array. It checked a hand-written
  list of two field names and declared the document clean.

  So the load-bearing case here is the nested one. If findUrlProblems ever
  stops descending into arrays or objects, case 1 fails and says why.

  Usage: node scripts/test-url-fields.mjs
*/
import {badUrl, findUrlProblems} from './lib/url-fields.mjs'

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures++
    console.log(`FAIL  ${name}`)
    console.log(`        expected  ${JSON.stringify(expected)}`)
    console.log(`        got       ${JSON.stringify(actual)}`)
  } else {
    console.log(`ok    ${name}`)
  }
}

const paths = (doc) => findUrlProblems(doc).map(([p]) => p)

// --- 1. The regression. A bad href nested in an array of objects. ----------
// This is the shape that was missed: siteSettings.clientLogos[].href.
check(
  'finds a bad href nested inside an array of objects',
  paths({
    clientLogos: [
      {_key: 'a', alt: 'Dumpstat', href: 'ht!tp://broken'},
      {_key: 'b', alt: 'Fine', href: 'https://example.com'},
    ],
  }),
  ['clientLogos[_key=="a"].href'],
)

// Two levels of nesting, to prove the walk is recursive rather than
// one-array-deep.
check(
  'descends more than one level',
  paths({sections: [{_key: 's', blocks: [{_key: 'b', url: 'nope'}]}]}),
  ['sections[_key=="s"].blocks[_key=="b"].url'],
)

// --- 2. What must NOT be flagged ------------------------------------------
// Relative paths are the values Chris deleted. If this ever fails, the checker
// has started calling correct content broken again.
check('a relative path is valid', paths({href: '/work/dumpstat'}), [])
check('an https url is valid', paths({url: 'https://example.com/x?y=1'}), [])
check('an http url is valid', paths({url: 'http://example.com'}), [])
check('an absent field is fine', paths({href: null, url: undefined}), [])
check('a field that is not url-ish is ignored', paths({slug: 'not a url'}), [])
check('system fields are skipped', paths({_id: 'x', _rev: 'y'}), [])

// --- 3. What must be flagged ----------------------------------------------
check('empty string', paths({url: ''}), ['url'])
check('whitespace only', paths({url: '   '}), ['url'])
check('bare domain, no scheme', paths({url: 'example.com'}), ['url'])
check('mailto', paths({url: 'mailto:a@b.com'}), ['url'])
check('javascript scheme', paths({href: 'javascript:alert(1)'}), ['href'])
check('non-string', paths({url: 42}), ['url'])

// --- 4. Reasons, not just detections --------------------------------------
// The point of the output is to tell Chris what to change, so the reason has
// to name the actual problem.
check(
  'empty string is explained as invalid rather than absent',
  badUrl('')?.includes('empty string'),
  true,
)
check('a bare domain is explained', badUrl('example.com')?.includes('bare domain'), true)
check('a bad scheme names the scheme', badUrl('mailto:a@b.com')?.includes('mailto:'), true)
check('a valid value has no reason', badUrl('https://x.com'), null)

// --- 5. Case insensitivity, since Sanity field names are author-chosen -----
check('matches HREF as well as href', paths({HREF: 'nope'}), ['HREF'])

console.log()
if (failures) {
  console.error(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All url-field checks pass.')
