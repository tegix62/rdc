/*
  initContactForm against a real DOM (jsdom), not a mock of one.

  WHY A REAL DOM RATHER THAN TESTING THE MARKUP OR THE SCRIPT SEPARATELY

  The step logic's whole job is DOM state: which fieldset has `hidden`, which
  button is visible, whether focus moved. Asserting on the source code would
  prove nothing about whether clicking "Next" actually does what it claims.
  jsdom is the one dependency that lets this run the real function against a
  real document, headless, in CI.

  Loads contact.astro's form markup directly - a copy of the relevant HTML
  lives in TEST_HTML below, not a full Astro render (which needs Sanity data
  and a bundler this script does not have). Kept in sync BY EYE with
  contact.astro; if the two drift, this suite is testing a form that no longer
  exists, which is the risk of any duplicated fixture. Flagged here so it is a
  known trade-off rather than a silent one.

  Usage: node scripts/test-contact-form.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const outdir = path.join(root, 'node_modules', '.cache', 'contact-form-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'contactForm.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/contactForm.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})
const {initContactForm} = await import(outfile)

// A trimmed copy of contact.astro's five fieldsets - real field names, real
// `required`s, real budget slider markup - without the Layout chrome around it.
const TEST_HTML = `
<form id="contact-form" class="contact-form" method="POST" action="/api/contact" novalidate>
  <div class="contact-form__honeypot" aria-hidden="true">
    <input type="text" id="website" name="website" tabindex="-1" autocomplete="off" />
  </div>

  <fieldset class="contact-form__step" data-step="1">
    <legend class="contact-form__step-heading">Welcome!</legend>
    <label><input type="text" name="name" required /></label>
    <label><input type="email" name="email" required /></label>
    <label><input type="text" name="company" /></label>
  </fieldset>

  <fieldset class="contact-form__step" data-step="2">
    <legend class="contact-form__step-heading">Your business</legend>
    <label><textarea name="businessDescription" required></textarea></label>
    <label><textarea name="goals" required></textarea></label>
  </fieldset>

  <fieldset class="contact-form__step" data-step="3">
    <legend class="contact-form__step-heading">Seriousness</legend>
    <div class="contact-form__scale" role="radiogroup">
      ${Array.from({length: 11}, (_, n) => `<label><input type="radio" name="seriousness" value="${n}" required="${n === 0}" /></label>`).join('')}
    </div>
  </fieldset>

  <fieldset class="contact-form__step" data-step="4">
    <legend class="contact-form__step-heading">Logistics</legend>
    <label><input type="text" name="timeframe" required /></label>
    <div class="budget-slider" data-min="1500" data-max="6000" data-step="250">
      <div class="budget-slider__track"><div class="budget-slider__range"></div></div>
      <input type="range" class="budget-slider__input budget-slider__input--low" name="budgetMin" min="1500" max="6000" step="250" value="1500" />
      <input type="range" class="budget-slider__input budget-slider__input--high" name="budgetMax" min="1500" max="6000" step="250" value="3000" />
      <output class="budget-slider__value budget-slider__value--low"></output>
      <output class="budget-slider__value budget-slider__value--high"></output>
    </div>
    <label><input type="checkbox" name="budgetNotSure" id="budget-not-sure" /></label>
    <label><input type="text" name="foundVia" required /></label>
  </fieldset>

  <fieldset class="contact-form__step" data-step="5">
    <legend class="contact-form__step-heading">Phone</legend>
    <label><input type="tel" name="phone" required /></label>
  </fieldset>

  <div class="contact-form__nav">
    <button type="button" class="button contact-form__back" hidden>Back</button>
    <button type="button" class="button contact-form__next">Next</button>
    <button type="submit" class="button contact-form__submit" hidden>Submit</button>
  </div>
  <p class="contact-form__error" role="alert" hidden></p>
</form>
<div class="contact-form__done" hidden>
  <h2>Thanks for filling this out!</h2>
</div>
`

/*
  A minimal in-memory sessionStorage and a recording fetch, installed on
  globalThis before each test - matching what pingFunnelStep in
  contactForm.ts actually reads from the GLOBAL scope, not from `document`.
  Without these, the real `fetch` global (Node 22 has one; jsdom does not)
  fires actual, immediately-rejecting network calls on every render() during
  every test - harmless (caught internally), but untested: nothing then
  proves the funnel ping sends the right form name and step, or that it
  dedupes correctly. This is what turns "does not crash" into "does the
  right thing."
*/
function mockStorage() {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  }
}
function mockFundFetch() {
  const calls = []
  const fn = async (url, init) => {
    calls.push({url: String(url), init})
    return new Response(null, {status: 204})
  }
  fn.calls = calls
  return fn
}

const setup = () => {
  const dom = new JSDOM(`<!doctype html><body>${TEST_HTML}</body>`, {pretendToBeVisual: true})
  const {document} = dom.window
  // jsdom does not implement reportValidity(); the real one is exercised in a
  // browser, not here. Stand in with checkValidity's boolean so the step gate
  // (validateStep) still behaves - required-but-empty blocks, filled-in passes.
  for (const el of document.querySelectorAll('input, textarea')) {
    el.reportValidity = () => el.checkValidity()
  }
  /*
    jsdom implements no layout, so scrollIntoView does not exist on any
    element - showError() calls it to bring the message into view. Same
    category as reportValidity above: a real browser API this environment
    simply lacks, stubbed so the code under test can run rather than worked
    around in the code itself.
  */
  for (const el of document.querySelectorAll('*')) {
    el.scrollIntoView = () => {}
  }
  globalThis.sessionStorage = mockStorage()
  /*
    jsdom's FormData, not Node's. `new FormData(form)` in the submit handler
    reads a jsdom HTMLFormElement, and Node's own global FormData (from undici)
    rejects it outright - the constructor throws, the submit handler's catch
    reports "could not reach the server", and a test looks like a network
    failure when nothing about the network was involved. A browser has exactly
    one FormData and this mismatch cannot happen there.
  */
  globalThis.FormData = dom.window.FormData
  const fetchMock = mockFundFetch()
  globalThis.fetch = fetchMock
  initContactForm(document)
  return {dom, document, fetchMock}
}

const step = (document, n) => document.querySelector(`.contact-form__step[data-step="${n}"]`)
const fill = (document, name, value) => {
  const el = document.querySelector(`[name="${name}"]`)
  el.value = value
  el.dispatchEvent(new document.defaultView.Event('input', {bubbles: true}))
}
const check_ = (document, name, value) => {
  const el = document.querySelector(`[name="${name}"][value="${value}"]`)
  el.checked = true
  el.dispatchEvent(new document.defaultView.Event('change', {bubbles: true}))
}
const click = (document, selector) => {
  document.querySelector(selector).dispatchEvent(new document.defaultView.Event('click', {bubbles: true}))
}

/*
  Walk a form all the way to the final step with every required field filled.

  Needed because the submit handler returns BEFORE spending a Turnstile token
  when client-side validation blocks - which is correct behaviour, and means a
  test that submits an empty form never reaches the code it is trying to
  exercise. It passes for the wrong reason and proves nothing.
*/
const reachFinalStep = (document) => {
  fill(document, 'name', 'A')
  fill(document, 'email', 'a@example.com')
  click(document, '.contact-form__next')
  fill(document, 'businessDescription', 'x')
  fill(document, 'goals', 'y')
  click(document, '.contact-form__next')
  check_(document, 'seriousness', '5')
  click(document, '.contact-form__next')
  fill(document, 'timeframe', 'ASAP')
  fill(document, 'foundVia', 'Instagram')
  click(document, '.contact-form__next')
  fill(document, 'phone', '555-0100')
}

// --- initial state -------------------------------------------------------
{
  const {document} = setup()
  check('step 1 starts visible', !step(document, 1).hidden)
  check('steps 2-5 start hidden', [2, 3, 4, 5].every((n) => step(document, n).hidden))
  check('Back is hidden on step 1', document.querySelector('.contact-form__back').hidden)
  check('Next is visible on step 1', !document.querySelector('.contact-form__next').hidden)
  check('Submit is hidden on step 1', document.querySelector('.contact-form__submit').hidden)
}

// --- Next is blocked by an empty required field -------------------------------
{
  const {document} = setup()
  click(document, '.contact-form__next')
  check('an empty required field blocks Next', !step(document, 2).hidden === false && !step(document, 1).hidden)
}

// --- a filled step advances ----------------------------------------------
{
  const {document} = setup()
  fill(document, 'name', 'Jordan Test')
  fill(document, 'email', 'jordan@example.com')
  click(document, '.contact-form__next')
  check('a filled step advances to step 2', step(document, 2).hidden === false)
  check('step 1 hides once advanced', step(document, 1).hidden)
}

// --- Back returns without losing what was typed -------------------------------
{
  const {document} = setup()
  fill(document, 'name', 'Jordan Test')
  fill(document, 'email', 'jordan@example.com')
  click(document, '.contact-form__next')
  click(document, '.contact-form__back')
  check('Back returns to step 1', !step(document, 1).hidden)
  check('typed values survive going back', document.querySelector('[name="name"]').value === 'Jordan Test')
}

// --- the radio-group step (seriousness) ---------------------------------------
{
  const {document} = setup()
  fill(document, 'name', 'A')
  fill(document, 'email', 'a@example.com')
  click(document, '.contact-form__next')
  fill(document, 'businessDescription', 'x')
  fill(document, 'goals', 'y')
  click(document, '.contact-form__next')
  check('reaches step 3 (seriousness)', !step(document, 3).hidden)
  click(document, '.contact-form__next')
  check('an unchecked radio group blocks Next', !step(document, 3).hidden)
  check_(document, 'seriousness', '7')
  click(document, '.contact-form__next')
  check('checking a radio option allows Next', !step(document, 4).hidden)
}

// --- Submit only appears on the last step ---------------------------------
{
  const {document} = setup()
  const advance = (name, value) => {
    fill(document, name, value)
  }
  advance('name', 'A')
  advance('email', 'a@example.com')
  click(document, '.contact-form__next')
  advance('businessDescription', 'x')
  advance('goals', 'y')
  click(document, '.contact-form__next')
  check_(document, 'seriousness', '5')
  click(document, '.contact-form__next')
  advance('timeframe', 'ASAP')
  advance('foundVia', 'Instagram')
  click(document, '.contact-form__next')
  check('reaches the final step', !step(document, 5).hidden)
  check('Next is hidden on the final step', document.querySelector('.contact-form__next').hidden)
  check('Submit is visible on the final step', !document.querySelector('.contact-form__submit').hidden)
}

// --- the budget slider ---------------------------------------------------
{
  const {document} = setup()
  const low = document.querySelector('.budget-slider__input--low')
  const high = document.querySelector('.budget-slider__input--high')
  const lowOut = document.querySelector('.budget-slider__value--low')
  const highOut = document.querySelector('.budget-slider__value--high')

  check('low output starts at the initial value', lowOut.textContent === '$1,500')
  check('high output starts at the initial value', highOut.textContent === '$3,000')

  // Moving the low handle to somewhere still below the high handle: an
  // ordinary drag, nothing to cap.
  fill(document, 'budgetMin', '2000')
  check('moving the low handle updates its own output', lowOut.textContent === '$2,000')
  check('the high output is untouched by moving the low handle', highOut.textContent === '$3,000')

  /*
    The case the capping exists for: drag the LOW handle past the high one.
    It must stop AT the high handle's value - not swap identities, which
    would mean the thumb the test is dragging suddenly reports as the "high"
    one instead. The physical thumb (`low`) stays the low input; it is simply
    capped from going further right.
  */
  fill(document, 'budgetMin', '4000')
  check('the low handle is capped at the high handle, not swapped past it', low.value === high.value, `low=${low.value} high=${high.value}`)
  check('low output reflects the capped value, not the raw drag target', lowOut.textContent === '$3,000')

  // And the symmetric case: drag the HIGH handle left, past the (now-capped)
  // low position.
  fill(document, 'budgetMax', '1500')
  check('the high handle is capped at the low handle, not swapped past it', high.value === low.value, `low=${low.value} high=${high.value}`)
}

// --- "Not sure yet" dims the slider ----------------------------------------
{
  const {document} = setup()
  const root = document.querySelector('.budget-slider')
  check('the slider is not dimmed initially', !root.classList.contains('budget-slider--disabled'))
  const notSure = document.querySelector('#budget-not-sure')
  notSure.checked = true
  notSure.dispatchEvent(new document.defaultView.Event('change', {bubbles: true}))
  check('checking "not sure" dims the slider', root.classList.contains('budget-slider--disabled'))
}

// --- drop-off tracking -----------------------------------------------------
{
  const {document, fetchMock} = setup()
  check('landing on step 1 pings the funnel once', fetchMock.calls.length === 1)
  const firstBody = fetchMock.calls[0]?.init?.body
  check('the ping goes to the funnel endpoint', fetchMock.calls[0]?.url === '/api/form-progress')
  check('the ping names the contact form', firstBody?.get('form') === 'contact')
  check('the ping for the first step says step 1', firstBody?.get('step') === '1')

  fill(document, 'name', 'A')
  fill(document, 'email', 'a@example.com')
  click(document, '.contact-form__next')
  check('advancing to step 2 sends a second ping', fetchMock.calls.length === 2)
  check('the second ping says step 2', fetchMock.calls[1]?.init?.body?.get('step') === '2')

  click(document, '.contact-form__back')
  check('going back to step 1 does NOT re-ping (already recorded this tab-session)', fetchMock.calls.length === 2)

  click(document, '.contact-form__next')
  check('returning to step 2 a second time does NOT re-ping either', fetchMock.calls.length === 2)
}

/*
  A REAL reload of the same tab, simulated properly: sessionStorage survives
  a reload (that is its entire purpose - session-scoped, not page-scoped), so
  this reuses the SAME storage mock across two separate initContactForm()
  calls rather than letting setup() hand each one a fresh Map. The previous
  version of this test called setup() twice and asserted a second ping fired
  - which passed, but only because setup() itself hands out fresh storage
  every time, proving nothing about dedup across an actual reload. This is
  the version that would have caught pingFunnelStep reading from the wrong
  place, or the key format not matching between two calls.
*/
{
  const dom = new JSDOM(`<!doctype html><body>${TEST_HTML}</body>`, {pretendToBeVisual: true})
  for (const el of dom.window.document.querySelectorAll('input, textarea')) {
    el.reportValidity = () => el.checkValidity()
  }
  const sharedStorage = mockStorage()
  globalThis.sessionStorage = sharedStorage
  const fetchMock = mockFundFetch()
  globalThis.fetch = fetchMock

  initContactForm(dom.window.document)
  check('the first load of a tab pings step 1', fetchMock.calls.length === 1)

  // Same storage, a SECOND initContactForm call - standing in for reloading
  // the same tab, since a real reload re-runs this site's script but keeps
  // sessionStorage intact.
  initContactForm(dom.window.document)
  check('reloading the same tab does NOT re-ping step 1', fetchMock.calls.length === 1)
}

/*
  --- a failed submit must mint a fresh Turnstile token -------------------------

  The trap this guards cost a real round of live debugging, and it would have
  cost real enquiries.

  A Turnstile token is single-use and short-lived. Attempting a submission
  spends it whether or not the submission succeeded. So a visitor who mistypes
  their email, gets the validation error back, fixes it and presses Submit
  again re-sends the SAME spent token - Cloudflare answers
  timeout-or-duplicate, and the form tells them the spam check didn't pass.

  Somebody who has filled in five steps is then told they look like a bot,
  with no way out but reloading and starting over. Nobody does that; they
  leave. Any error at all leads there, so one mistyped character turns into a
  lost enquiry.

  Asserting reset() was CALLED rather than that a retry succeeds: the token
  lifecycle lives inside Cloudflare's script, so calling their reset is the
  only part this code is responsible for, and the only part a test here can
  honestly verify.
*/
{
  const {document, dom} = setup()
  reachFinalStep(document)
  let resets = 0
  dom.window.turnstile = {reset: () => {resets += 1}}

  // A rejection the Function would really produce - the visitor stays on the
  // form with the message, which is exactly when a stale token bites.
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ok: false, message: 'Email is required.'}), {status: 400})

  const form = document.querySelector('form')
  form.dispatchEvent(new dom.window.Event('submit', {bubbles: true, cancelable: true}))
  await new Promise((r) => setTimeout(r, 0))

  check('a rejected submission resets the Turnstile widget', resets === 1, `reset called ${resets} time(s)`)
  check(
    'and the visitor still sees why it was rejected',
    /Email is required/.test(document.querySelector('.contact-form__error')?.textContent ?? ''),
    document.querySelector('.contact-form__error')?.textContent ?? '(no message shown)',
  )
}

/*
  Turnstile's script is third-party and blockable - a privacy extension or a
  flaky network leaves window.turnstile undefined. An unguarded reset() would
  throw inside the `finally` block and swallow the error message the visitor
  needs to read, turning "check your email address" into nothing happening.
*/
{
  const {document, dom} = setup()
  reachFinalStep(document)
  delete dom.window.turnstile

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ok: false, message: 'Email is required.'}), {status: 400})

  const form = document.querySelector('form')
  form.dispatchEvent(new dom.window.Event('submit', {bubbles: true, cancelable: true}))
  await new Promise((r) => setTimeout(r, 0))

  check(
    'with no Turnstile script loaded, the error message still reaches the visitor',
    /Email is required/.test(document.querySelector('.contact-form__error')?.textContent ?? ''),
    document.querySelector('.contact-form__error')?.textContent ?? '(no message shown)',
  )
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
