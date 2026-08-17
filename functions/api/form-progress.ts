/*
  Drop-off tracking for /contact: increments one of five running counters on
  a single Sanity document, `formFunnel.contact`. See
  studio/schemaTypes/formFunnel.ts for why this is one document forever
  rather than one per visitor.

  NO SPAM PROTECTION HERE, DELIBERATELY - AND STATED, NOT JUST OMITTED

  functions/api/contact.ts runs a honeypot, then Turnstile, then validation,
  because what it protects (Sanity writes that cost real storage and produce
  a document Chris acts on - replying to an enquiry) is worth defending.

  This endpoint protects a vanity counter. The worst outcome of someone
  hammering it with garbage is a wrong number on a dashboard nobody's
  business decision depends on - not a lost enquiry, not spam in an inbox,
  not unbounded storage growth (this document has exactly five numbers in it
  regardless of how many times they are incremented). Adding Turnstile here
  would mean solving a spam challenge to increment a step counter, which is a
  worse experience for zero real protection of anything that matters. The
  allow-list in formFunnelValidation.ts is the only defence, and is enough
  for what is actually at stake.
*/
import { validateFunnelPing } from '../../src/lib/formFunnelValidation';

interface Env {
  SANITY_WRITE_TOKEN: string;
}

interface Context {
  request: Request;
  env: Env;
}

const SANITY_PROJECT_ID = '8337vjtf';
const SANITY_DATASET = 'production';

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  let fields: Record<string, string>;
  try {
    const raw = await request.formData();
    fields = {};
    for (const [key, value] of raw.entries()) {
      if (typeof value === 'string') fields[key] = value;
    }
  } catch {
    return new Response(null, { status: 400 });
  }

  const result = validateFunnelPing(fields);
  if (!result.ok) {
    // No message body needed - src/lib/contactForm.ts sends this with
    // `keepalive: true` and never reads the response. A step-tracking ping
    // failing silently is the correct behaviour for a nice-to-have counter;
    // it must never be the thing that makes the actual form submission look
    // broken to a visitor.
    return new Response(null, { status: 400 });
  }

  const { form, step } = result.data;
  const docId = `formFunnel.${form}`;
  const field = `step${step}`;

  /*
    Two mutations in ONE transaction, applied in order: create the counter
    document if this is the very first ping this form has ever received,
    THEN increment the field. `createIfNotExists` combined with a `patch` in
    the same transaction is the standard Sanity pattern for a counter that
    must exist before it can be incremented, without a separate read to check
    first - a read-then-write here would race under concurrent requests in a
    way this single transaction cannot.
  */
  const res = await fetch(
    `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${SANITY_DATASET}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mutations: [
          {
            createIfNotExists: {
              _id: docId,
              _type: 'formFunnel',
              formName: form,
              since: new Date().toISOString(),
              step1: 0,
              step2: 0,
              step3: 0,
              step4: 0,
              step5: 0,
            },
          },
          {
            patch: {
              id: docId,
              inc: { [field]: 1 },
            },
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    // Same reasoning as the validation failure above: logged for later,
    // never surfaced to whoever is filling in the actual form.
    console.error('formFunnel increment failed', res.status, await res.text());
    return new Response(null, { status: 502 });
  }

  return new Response(null, { status: 204 });
};

export const onRequestGet = async (): Promise<Response> =>
  new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
