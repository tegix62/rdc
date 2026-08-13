/*
  validateFunnelPing is the entire defence on /api/form-progress - that
  endpoint has no Turnstile, no honeypot, on purpose (see the comment in
  functions/api/form-progress.ts for why a vanity counter does not warrant
  that overhead). Which makes this the one thing standing between a stray
  request and a corrupted counter document, and worth testing as carefully
  as the real spam-protected endpoint's validation.
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

const outdir = path.join(root, 'node_modules', '.cache', 'form-funnel-validation-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'formFunnelValidation.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/formFunnelValidation.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})
const {validateFunnelPing} = await import(outfile)

// --- the happy path --------------------------------------------------------
{
  const result = validateFunnelPing({form: 'contact', step: '3'})
  check('a known form and a step in range is accepted', result.ok === true)
  if (result.ok) {
    check('step is parsed as a number, not left as a string', result.data.step === 3 && typeof result.data.step === 'number')
    check('form is passed through unchanged', result.data.form === 'contact')
  }
}
for (const step of ['1', '5']) {
  check(`step "${step}" (a boundary) is accepted for contact`, validateFunnelPing({form: 'contact', step}).ok === true)
}

// --- an unknown form name is rejected, not silently recorded ---------------
for (const bad of ['newsletter', 'Contact', '', 'contact; DROP']) {
  const result = validateFunnelPing({form: bad, step: '1'})
  check(`unknown form "${bad}" is rejected`, result.ok === false, result.ok ? '(wrongly accepted)' : result.message)
}
// Trimmed whitespace around an otherwise-valid name is fine, not a rejection
// case - "contact " is not a different form, it is "contact" with a stray
// space, and the code trims before comparing.
check('a form name with incidental whitespace is still accepted', validateFunnelPing({form: ' contact ', step: '1'}).ok === true)

/*
  The specific bug a plain-object allow-list has: `"x" in {}` is true for
  every name Object.prototype defines, regardless of what was ever actually
  added to the object. A Map's `.has()` does not have this problem - this
  assertion is what proves FORMS is genuinely a Map and not a plain object
  literal that happens to look similar from the outside.
*/
for (const prototypeName of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
  const result = validateFunnelPing({form: prototypeName, step: '1'})
  check(`"${prototypeName}" (an Object.prototype member, not a real form) is rejected`, result.ok === false, result.ok ? '(wrongly accepted - prototype pollution risk)' : result.message)
}

// --- step bounds, per form - this is what stops a request writing to a
// field that does not exist on the schema (formFunnel has step1..step5 only)
for (const bad of ['0', '6', '-1', '3.5', 'three', '', ' ']) {
  const result = validateFunnelPing({form: 'contact', step: bad})
  check(`step "${bad}" is rejected for contact (5 steps)`, result.ok === false, result.ok ? '(wrongly accepted)' : result.message)
}
// "01" specifically: Number("01") is 1, a valid integer - worth asserting
// this is accepted rather than rejected, since it looks superficially like
// it should be in the "malformed" bucket above but genuinely is not one.
check('a zero-padded but numerically valid step is still accepted', validateFunnelPing({form: 'contact', step: '01'}).ok === true)

// --- missing fields entirely, not just empty strings -----------------------
check('a request with no form field at all is rejected', validateFunnelPing({step: '1'}).ok === false)
check('a request with no step field at all is rejected', validateFunnelPing({form: 'contact'}).ok === false)
check('a completely empty request is rejected', validateFunnelPing({}).ok === false)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
