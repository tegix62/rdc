/*
  The client half of /contact: step navigation, the budget slider, and
  submitting via fetch so a validation error can be shown without a full page
  reload.

  PROGRESSIVE ENHANCEMENT, STATED PRECISELY

  contact.astro renders every fieldset visible, with a plain <form
  method="POST" action="/api/contact">. That already works with no JavaScript
  at all - one long form, real submission, real redirect on success (the
  Function 303s to /contact?done on a no-JS POST - see there for why).

  What THIS file adds, once it runs: hides all but one fieldset at a time,
  wires Back/Next, builds the slider out of the two <input type="range">
  elements, and intercepts submit to show the result in place instead of
  navigating. None of that is required for the form to function - it is
  purely nicer, which is the point of calling it enhancement rather than the
  form's foundation.

  Exported as a function called from an inline <script> in contact.astro,
  rather than running at module scope, so scripts/test-contact-form.mjs can
  import it against a JSDOM document without it trying to touch a page.
*/
import { BUDGET_MIN, BUDGET_MAX, formatBudget, formatBudgetHigh } from './budget';

/*
  DROP-OFF TRACKING IS REMOVED. There used to be a `pingFunnelStep` here,
  fired on every step advance, and the endpoint it called wrote to a published
  Sanity document.

  A Sanity webhook redeploys the site on any published-document change, so
  each of those pings was a full production deploy - which on 17 August 2026
  turned ordinary traffic on /contact into several hundred deploys of
  rumeaudesign.co in a few minutes. functions/api/form-progress.ts has the
  full chain written out.

  Nothing about the form itself depended on it: the ping was never awaited and
  every failure was already swallowed, precisely because a counter must never
  affect a submission. Removing it therefore changes nothing a visitor
  experiences, which is the clearest possible sign of what it was worth
  against what it cost.

  If the counter comes back it belongs in D1 alongside the enquiries, not in
  the CMS. scripts/test-no-public-cms-writes.mjs now fails the build if any
  Pages Function writes to Sanity again.
*/

export function initContactForm(doc: Document = document): void {
  const form = doc.querySelector<HTMLFormElement>('#contact-form');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll<HTMLFieldSetElement>('.contact-form__step'));
  const backBtn = form.querySelector<HTMLButtonElement>('.contact-form__back');
  const nextBtn = form.querySelector<HTMLButtonElement>('.contact-form__next');
  const submitBtn = form.querySelector<HTMLButtonElement>('.contact-form__submit');
  const errorBox = form.querySelector<HTMLElement>('.contact-form__error');
  const doneBox = doc.querySelector<HTMLElement>('.contact-form__done');

  let current = 0;

  /*
    hidden rather than a CSS class, deliberately. The `hidden` attribute is
    what makes an inactive step invisible to a screen reader and unreachable by
    Tab WITHOUT any stylesheet cooperating - a class-based approach needs
    `display: none` to be defined somewhere and kept in sync with this file,
    which is one more place the two could drift.
  */
  const render = () => {
    steps.forEach((step, i) => {
      step.hidden = i !== current;
    });
    if (backBtn) backBtn.hidden = current === 0;
    if (nextBtn) nextBtn.hidden = current === steps.length - 1;
    if (submitBtn) submitBtn.hidden = current !== steps.length - 1;
    // Focus the new step's heading, so a screen-reader user or keyboard user
    // is not left focused on a Back/Next button that no longer makes sense in
    // the new step's context - and so the step change is actually ANNOUNCED,
    // which moving focus to something with role/text does and a silent DOM
    // swap does not.
    const heading = steps[current]?.querySelector<HTMLElement>('.contact-form__step-heading');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  };

  /*
    Only the fields belonging to the CURRENT step are checked. Every field on
    every step is marked `required` in the HTML, which is correct for the
    no-JS fallback - a single long form - but wrong here: without narrowing
    the check to `current`, pressing "Next" on step 1 would report step 4's
    empty fields as the reason it cannot proceed.
  */
  const validateStep = (): boolean => {
    const fields = steps[current].querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[required]');
    for (const field of fields) {
      if (field.type === 'radio') {
        const group = steps[current].querySelectorAll<HTMLInputElement>(`input[name="${field.name}"]`);
        if (![...group].some((r) => r.checked)) {
          (group[0] ?? field).reportValidity();
          return false;
        }
        continue;
      }
      if (!field.reportValidity()) return false;
    }
    return true;
  };

  nextBtn?.addEventListener('click', () => {
    if (!validateStep()) return;
    current = Math.min(current + 1, steps.length - 1);
    render();
  });

  backBtn?.addEventListener('click', () => {
    current = Math.max(current - 1, 0);
    render();
  });

  render();

  // --- the budget slider -------------------------------------------------------
  initBudgetSlider(form);

  // --- submit --------------------------------------------------------------
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep()) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }
    if (errorBox) errorBox.hidden = true;

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        form.hidden = true;
        if (doneBox) doneBox.hidden = false;
        return;
      }

      /*
        The Function returns a specific reason (validation, spam check,
        rate limit) as JSON. Showing THAT rather than a generic "something
        went wrong" is what lets someone fix a mistyped email themselves
        instead of re-submitting the same broken thing, or emailing Chris to
        ask why the form will not work.
      */
      const body = await res.json().catch(() => null);
      showError(errorBox, body?.message ?? "Something went wrong sending this - please try again, or email chris@rumeaudesign.co directly.");
    } catch {
      showError(errorBox, "Could not reach the server - check your connection and try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit →';
      }
      /*
        Mint a fresh Turnstile token for the retry.

        This is a real trap, not housekeeping. A Turnstile token is SINGLE-USE
        and short-lived: the moment a submission is attempted, that token is
        spent whether the submission succeeded or not. So a visitor who
        mistypes their email, gets the validation error, corrects it and
        presses Submit again sends the SAME spent token - and Cloudflare
        answers timeout-or-duplicate, which this form reports as "the spam
        check didn't pass".

        The result is somebody who has filled in five steps being told they
        look like a bot, with no way out except reloading the page and
        starting over, which nobody does. They just leave. Every retry after
        any error would hit it - a validation slip becomes a lost enquiry.

        Found by hitting it in testing. Reset unconditionally rather than only
        on a spam-check failure: the token is spent either way, so any error
        that leaves the visitor on this form needs a new one.
      */
      resetTurnstile(form.ownerDocument.defaultView);
    }
  });
}

/*
  Turnstile's own reset, guarded twice over.

  Reached through the form's OWN window rather than the bare `window` global,
  which is the convention the rest of this module already follows - every
  entry point takes a document instead of assuming one. Writing `window` here
  broke that and threw immediately under test, where jsdom's window is not a
  Node global. In a browser it would have worked, which is the worst version
  of that mistake: invisible until something else depends on it.

  The try/catch is the second guard, for a different failure. Turnstile's
  script is third-party and blockable - a privacy extension or a flaky network
  leaves `turnstile` undefined, or leaves reset() throwing. This runs inside a
  `finally`, so an exception here would replace the error message the visitor
  needs to read with nothing happening at all: "check your email address"
  becomes a dead button.
*/
function resetTurnstile(win: (Window & typeof globalThis) | null): void {
  try {
    (win as unknown as {turnstile?: {reset: () => void}} | null)?.turnstile?.reset();
  } catch {
    // A failed reset leaves the visitor exactly where they already were -
    // needing a page reload. Not worth an error message of its own, and
    // certainly not worth losing the real one.
  }
}

function showError(box: HTMLElement | null, message: string): void {
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/*
  Two overlapping <input type="range"> elements standing in for one dual-handle
  slider - the accessible route, since each keeps its own keyboard support and
  screen-reader announcement for free. What this function adds is the part
  native ranges cannot do alone: stopping the handles from crossing, painting
  the highlighted band between them, and keeping the "Not sure yet" checkbox
  in sync.
*/
function initBudgetSlider(form: HTMLFormElement): void {
  const root = form.querySelector<HTMLElement>('.budget-slider');
  if (!root) return;

  const lowInput = root.querySelector<HTMLInputElement>('.budget-slider__input--low');
  const highInput = root.querySelector<HTMLInputElement>('.budget-slider__input--high');
  const lowOutput = root.querySelector<HTMLOutputElement>('.budget-slider__value--low');
  const highOutput = root.querySelector<HTMLOutputElement>('.budget-slider__value--high');
  const range = root.querySelector<HTMLElement>('.budget-slider__range');
  const notSure = form.querySelector<HTMLInputElement>('#budget-not-sure');
  if (!lowInput || !highInput || !lowOutput || !highOutput || !range) return;

  const pct = (v: number) => ((v - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  const clampToBounds = (v: number) => Math.min(Math.max(v, BUDGET_MIN), BUDGET_MAX);

  /*
    Paints from whatever the two inputs currently hold - it does not decide
    which one is "wrong" when they cross. That decision is made by the two
    handlers below, BEFORE this runs, which is what keeps a slider drag from
    fighting itself: browsers report a range input's value on every 'input'
    event mid-drag, so by the time paint() runs the crossing has already been
    resolved for the one handle currently in the user's hand.
  */
  const paint = () => {
    const min = Number(lowInput.value);
    const max = Number(highInput.value);
    lowOutput.textContent = formatBudget(min);
    highOutput.textContent = formatBudgetHigh(max);
    range.style.left = `${pct(min)}%`;
    range.style.right = `${100 - pct(max)}%`;
  };

  /*
    Cap at the OTHER handle, never swap.

    A swap would mean: drag the low thumb right, past the high thumb, and the
    value under your cursor silently becomes "the high end" instead - the
    thumb you are physically moving stops being the thing its own label
    describes. Capping keeps "low" and "high" tied to the same DOM element for
    the whole interaction; the thumb simply cannot be pushed past its
    neighbour, which is what every slider a person has actually used does.

    clampBudgetRange in lib/budget.ts is deliberately NOT reused here: it
    exists for the server, which receives two raw numbers with no idea which
    one the user was just touching, and for which swapping into a valid
    {min, max} pair is the only sane behaviour. Live in a browser, which
    input just fired is exactly the information a swap would throw away.
  */
  lowInput.addEventListener('input', () => {
    const min = clampToBounds(Number(lowInput.value));
    const capped = Math.min(min, Number(highInput.value));
    lowInput.value = String(capped);
    paint();
  });
  highInput.addEventListener('input', () => {
    const max = clampToBounds(Number(highInput.value));
    const capped = Math.max(max, Number(lowInput.value));
    highInput.value = String(capped);
    paint();
  });
  paint();

  /*
    "Not sure yet" dims the slider rather than disabling its inputs. A
    disabled <input> is dropped from FormData entirely, and the Function has
    to be able to tell "chose not sure" from "this field never arrived, maybe
    a bug" - those are different things and should not look identical on the
    server. Dimming is CSS only; see .budget-slider--disabled in global.css.
  */
  notSure?.addEventListener('change', () => {
    root.classList.toggle('budget-slider--disabled', notSure.checked);
  });
}
