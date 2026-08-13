/*
  The allow-list behind /api/form-progress - which forms and which steps this
  endpoint will record a ping for.

  This endpoint has no spam protection (see functions/api/form-progress.ts
  for why that is a deliberate, stated trade-off, not an oversight). What
  stands between it and a request that tries to write an arbitrary field name
  or an out-of-range number into the formFunnel document is this allow-list -
  pure and framework-free, same reasoning as contactValidation.ts.
*/

/*
  Every form this site tracks, and how many steps each has. A second form
  added later gets a second entry here, not a hardcoded "contact" scattered
  through the endpoint.

  A Map, not a plain object literal - deliberately. `"__proto__" in {}` is
  `true` in JavaScript, because a plain object inherits from Object.prototype
  and `in` walks the whole prototype chain, not just the object's own keys.
  With `FORMS` as a `{}`, a request carrying `form=__proto__` (or
  `constructor`, `toString`, `hasOwnProperty` - anything Object.prototype
  defines) would have been treated as a KNOWN, valid form purely because that
  name exists somewhere up the chain, never because anyone added it here.
  Caught by scripts/test-form-funnel-validation.mjs asserting the opposite of
  what the first version did. A Map has no prototype chain to leak through
  `.has()`.
*/
const FORMS = new Map<string, number>([['contact', 5]]);

export interface FunnelPing {
  form: string;
  step: number;
}

export type FunnelValidationResult = { ok: true; data: FunnelPing } | { ok: false; message: string };

export function validateFunnelPing(fields: Record<string, string | undefined>): FunnelValidationResult {
  const form = (fields.form ?? '').trim();
  const maxStep = FORMS.get(form);
  if (maxStep === undefined) {
    return { ok: false, message: `Unknown form "${form}".` };
  }

  const stepStr = (fields.step ?? '').trim();
  const step = Number(stepStr);
  if (stepStr === '' || !Number.isInteger(step) || step < 1 || step > maxStep) {
    return { ok: false, message: `Step must be an integer between 1 and ${maxStep} for "${form}".` };
  }

  return { ok: true, data: { form, step } };
}
