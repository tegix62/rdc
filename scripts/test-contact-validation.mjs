/*
  validateSubmission is the only thing standing between the internet and a
  write to Sanity - the client-side `required` attributes are a courtesy to a
  real browser and no obstacle at all to a POST built by curl. Every rejection
  path gets its own case, because a validator that is untested is a validator
  that MIGHT be checking the field it claims to.

  Bundled through esbuild, same as test-budget.mjs.
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

const outdir = path.join(root, 'node_modules', '.cache', 'contact-validation-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'contactValidation.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/contactValidation.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})
const {validateSubmission} = await import(outfile)

// A complete, valid submission - the baseline every rejection test mutates one
// field away from, so each case proves ONE thing is being checked rather than
// accidentally tripping over a different missing field.
const VALID = {
  name: 'Jordan Test',
  email: 'jordan@example.com',
  company: 'Test Co',
  businessDescription: 'A small apparel brand getting ready to launch.',
  goals: 'A logo and a brand system for the launch.',
  seriousness: '8',
  timeframe: 'Within 3 months',
  budgetMin: '3000',
  budgetMax: '4500',
  budgetNotSure: '',
  foundVia: 'Instagram',
  phone: '555-0100',
}

// --- the happy path ------------------------------------------------------
{
  const result = validateSubmission(VALID)
  check('a fully valid submission is accepted', result.ok === true)
  if (result.ok) {
    check('the name survives intact', result.data.name === 'Jordan Test')
    check('seriousness is parsed as a number, not a string', result.data.seriousness === 8 && typeof result.data.seriousness === 'number')
    check('the budget range comes through', result.data.budgetMin === 3000 && result.data.budgetMax === 4500)
    check('openEnded is false for a mid-range budget', result.data.budgetOpenEnded === false)
    check('budgetNotSure is false when unset', result.data.budgetNotSure === false)
  }
}

// --- each required field, missing one at a time -----------------------------
const REQUIRED_FIELDS = ['name', 'email', 'businessDescription', 'goals', 'timeframe', 'foundVia', 'phone']
for (const field of REQUIRED_FIELDS) {
  const result = validateSubmission({...VALID, [field]: ''})
  check(`missing "${field}" is rejected`, result.ok === false, result.ok ? '(wrongly accepted)' : result.message)
}
// Whitespace-only is not a loophole around "required".
for (const field of REQUIRED_FIELDS) {
  const result = validateSubmission({...VALID, [field]: '   '})
  check(`whitespace-only "${field}" is rejected`, result.ok === false)
}

// --- company is the one genuinely optional field -----------------------------
{
  const result = validateSubmission({...VALID, company: ''})
  check('an empty company is accepted - it is optional on the form', result.ok === true)
}

// --- email shape -----------------------------------------------------------
for (const bad of ['not-an-email', 'missing-domain@', '@missing-local.com', 'spaces in@it.com']) {
  const result = validateSubmission({...VALID, email: bad})
  check(`"${bad}" is rejected as an email`, result.ok === false)
}
for (const ok of ['a@b.co', 'first.last+tag@sub.example.com']) {
  const result = validateSubmission({...VALID, email: ok})
  check(`"${ok}" is accepted as an email`, result.ok === true)
}

// --- seriousness: must be an integer 0-10, not just "present" -----------------
for (const bad of ['', '-1', '11', '5.5', 'seven', ' ']) {
  const result = validateSubmission({...VALID, seriousness: bad})
  check(`seriousness "${bad}" is rejected`, result.ok === false)
}
for (const ok of ['0', '10']) {
  const result = validateSubmission({...VALID, seriousness: ok})
  check(`seriousness "${ok}" (a boundary value) is accepted`, result.ok === true)
}

// --- length ceilings, so one request cannot hand Sanity a megabyte string ------
{
  const result = validateSubmission({...VALID, businessDescription: 'x'.repeat(5001)})
  check('an over-length business description is rejected', result.ok === false)
}
{
  const result = validateSubmission({...VALID, businessDescription: 'x'.repeat(5000)})
  check('exactly the length ceiling is still accepted', result.ok === true)
}

// --- the budget range is clamped, not merely passed through -----------------
{
  const result = validateSubmission({...VALID, budgetMin: '1', budgetMax: '999999'})
  check('an absurd budget range is clamped into bounds rather than rejected', result.ok === true)
  if (result.ok) {
    check('clamped to the real floor', result.data.budgetMin === 1500)
    check('clamped to the real ceiling, and marked open-ended', result.data.budgetMax === 6000 && result.data.budgetOpenEnded === true)
  }
}
{
  // A crossed pair, exactly the shape a race between two 'input' events could
  // produce - see the note in lib/budget.ts about why the server re-derives
  // this instead of trusting whatever order the client sent it in.
  const result = validateSubmission({...VALID, budgetMin: '5000', budgetMax: '2000'})
  check('a crossed budget pair is still accepted', result.ok === true)
  if (result.ok) check('and corrected into order', result.data.budgetMin === 2000 && result.data.budgetMax === 5000)
}

// --- "not sure yet" bypasses the requirement for real budget numbers ----------
{
  const result = validateSubmission({...VALID, budgetMin: '', budgetMax: '', budgetNotSure: 'true'})
  check('"not sure" is accepted with no budget numbers at all', result.ok === true)
  if (result.ok) check('budgetNotSure is recorded as true', result.data.budgetNotSure === true)
}
{
  // Without the checkbox, missing budget numbers ARE a real problem - most
  // likely a client bug (the slider failed to initialise) rather than intent,
  // so this should fail loudly rather than silently invent a default range.
  const result = validateSubmission({...VALID, budgetMin: '', budgetMax: '', budgetNotSure: ''})
  check('missing budget numbers WITHOUT "not sure" ticked is rejected', result.ok === false)
}
// The checkbox arrives as "on" from a plain HTML checkbox with no explicit
// value, and as "true" from the form's own value="true" - both must work,
// since which one shows up depends on how the request was built.
for (const truthy of ['true', 'on']) {
  const result = validateSubmission({...VALID, budgetNotSure: truthy})
  check(`budgetNotSure="${truthy}" is treated as checked`, result.ok === true && result.data.budgetNotSure === true)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
