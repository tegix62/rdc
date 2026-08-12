/*
  Server-side validation for a contact-form submission - the part that runs
  regardless of what the browser already checked, because a browser's
  `required` attribute is a courtesy to a real visitor and no obstacle at all
  to a POST built by hand.

  Pure and framework-free on purpose: no FormData, no Request, no Cloudflare
  runtime types. functions/api/contact.ts adapts a real FormData into the
  plain object this expects; scripts/test-contact-validation.mjs calls it
  directly with plain objects. Untestable-without-a-live-server code is
  exactly how a validation bug survives to production unnoticed.
*/
import { clampBudgetRange } from './budget';

export interface SubmissionData {
  name: string;
  email: string;
  company: string;
  businessDescription: string;
  goals: string;
  seriousness: number;
  timeframe: string;
  budgetMin: number;
  budgetMax: number;
  budgetOpenEnded: boolean;
  budgetNotSure: boolean;
  foundVia: string;
  phone: string;
}

export type ValidationResult =
  | { ok: true; data: SubmissionData }
  | { ok: false; message: string };

// Deliberately permissive - it exists to catch "forgot the @", not to reject a
// real address in an unusual shape. An overzealous email regex turning away a
// genuine enquiry is a worse failure than letting a slightly odd one through.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A ceiling on every free-text field, not a floor on quality. This exists so
// one request cannot hand Sanity a multi-megabyte string - not to police how
// much someone writes about their project.
const MAX_TEXT = 5000;

const str = (v: string | undefined): string => (v ?? '').trim();

export function validateSubmission(fields: Record<string, string | undefined>): ValidationResult {
  const name = str(fields.name);
  if (!name) return { ok: false, message: 'Name is required.' };
  if (name.length > 200) return { ok: false, message: 'That name is too long.' };

  const email = str(fields.email);
  if (!email) return { ok: false, message: 'Email is required.' };
  if (!EMAIL_RE.test(email)) return { ok: false, message: "That doesn't look like a valid email address." };

  const company = str(fields.company).slice(0, 200);

  const businessDescription = str(fields.businessDescription);
  if (!businessDescription) return { ok: false, message: 'Tell me a bit about your business.' };
  if (businessDescription.length > MAX_TEXT) return { ok: false, message: 'That description is too long.' };

  const goals = str(fields.goals);
  if (!goals) return { ok: false, message: "Let me know how I can help." };
  if (goals.length > MAX_TEXT) return { ok: false, message: 'That description is too long.' };

  const seriousnessRaw = str(fields.seriousness);
  const seriousness = Number(seriousnessRaw);
  if (seriousnessRaw === '' || !Number.isInteger(seriousness) || seriousness < 0 || seriousness > 10) {
    return { ok: false, message: 'Pick a seriousness rating from 0 to 10.' };
  }

  const timeframe = str(fields.timeframe);
  if (!timeframe) return { ok: false, message: 'What is your timeframe?' };
  if (timeframe.length > 200) return { ok: false, message: 'That timeframe is too long.' };

  const foundVia = str(fields.foundVia);
  if (!foundVia) return { ok: false, message: 'How did you find me?' };
  if (foundVia.length > 200) return { ok: false, message: 'That answer is too long.' };

  const phone = str(fields.phone);
  if (!phone) return { ok: false, message: 'A phone number is required for the discovery call.' };
  if (phone.length > 40) return { ok: false, message: "That doesn't look like a phone number." };

  /*
    "Not sure yet" is read straight from the checkbox rather than inferred from
    the slider's position. A slider always sits somewhere - there is no empty
    state for it to fall back to - so the only reliable signal for "I have not
    thought about it" is the checkbox someone deliberately ticked, not
    whatever numbers happened to be under the handles when they submitted.
  */
  const budgetNotSure = fields.budgetNotSure === 'true' || fields.budgetNotSure === 'on';
  /*
    Empty string first, THEN Number() - not the other way round.
    `Number('')` is `0`, not `NaN`, so checking Number.isFinite() on the raw
    conversion treats a missing field as a real, valid budget of $0. Bug
    found by the test below: an omitted budgetMin/budgetMax with the "not
    sure" box unticked was silently accepted instead of rejected.
  */
  const budgetMinStr = str(fields.budgetMin);
  const budgetMaxStr = str(fields.budgetMax);
  const rawMin = budgetMinStr === '' ? NaN : Number(budgetMinStr);
  const rawMax = budgetMaxStr === '' ? NaN : Number(budgetMaxStr);
  if (!budgetNotSure && (!Number.isFinite(rawMin) || !Number.isFinite(rawMax))) {
    return { ok: false, message: 'The budget field looks incomplete - try reloading the page.' };
  }
  // clampBudgetRange also runs client-side as the slider moves, but that is a
  // UI nicety, not a guarantee about what actually arrives here - the same
  // reason every other field above is re-checked rather than trusted.
  const { min, max, openEnded } = clampBudgetRange(
    Number.isFinite(rawMin) ? rawMin : 1500,
    Number.isFinite(rawMax) ? rawMax : 1500,
  );

  return {
    ok: true,
    data: {
      name,
      email,
      company,
      businessDescription,
      goals,
      seriousness,
      timeframe,
      budgetMin: min,
      budgetMax: max,
      budgetOpenEnded: openEnded,
      budgetNotSure,
      foundVia,
      phone,
    },
  };
}
