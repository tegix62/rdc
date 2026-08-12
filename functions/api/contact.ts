/*
  The contact form's backend: a Cloudflare Pages Function, not an Astro route.
  This site's pages are static - built once, served as files - so anything
  that has to run PER REQUEST (verifying a spam token, writing to Sanity,
  sending an email) has to live here instead, in `functions/`, which Cloudflare
  Pages picks up automatically alongside the static build. It does not change
  how the rest of the site is built or deployed.

  Runs on every POST to /contact. The <form> in src/pages/contact.astro posts
  here directly (progressive enhancement: a real HTML form action, working
  with no JavaScript, that src/lib/contactForm.ts intercepts with fetch when
  it can).

  FOUR LAYERS, IN THE ORDER THEY ARE CHECKED - CHEAPEST AND MOST DEFINITIVE
  FIRST:

    1. Honeypot        a hidden field only a bot fills in. Free, and it
                        catches the least sophisticated bots without ever
                        involving Turnstile or Sanity.
    2. Turnstile        Cloudflare's own proof-of-human check. Requires an
                        API call, so it runs after the honeypot, not before.
    3. Validation       src/lib/contactValidation.ts, shared with nothing
                        here that a client could have supplied honestly -
                        this is what would matter even with the two spam
                        checks disabled entirely.
    4. Sanity + email   only reached once the above are all satisfied.

  A submission that fails an earlier, cheaper check never reaches the more
  expensive ones - so a bot hammering this endpoint costs an API call at
  most, not two.
*/
import { validateSubmission } from '../../src/lib/contactValidation';

interface Env {
  SANITY_WRITE_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_NOTIFY_EMAIL: string;
}

interface Context {
  request: Request;
  env: Env;
}

const SANITY_PROJECT_ID = '8337vjtf';
const SANITY_DATASET = 'production';

/*
  Two response shapes, chosen by what the request itself asked for - not by
  guessing whether JavaScript is running.

  contactForm.ts sends `Accept: application/json` on every fetch() call, which
  is the enhanced path and gets a small JSON body back.

  A form submitted with NO JavaScript running never sets that header - the
  browser's own default for a form navigation is what arrives instead - so it
  gets a full, readable HTML page in return. That page is also, honestly, the
  only thing a no-JS submission can ever receive from this endpoint: Turnstile
  itself requires JavaScript to render and solve its challenge, so a request
  with no JS has already failed step 2 above by the time it gets here. The
  HTML response says so in plain language rather than leaving someone looking
  at a bare JSON error or a blank page.
*/
const wantsJson = (request: Request) => (request.headers.get('Accept') ?? '').includes('application/json');

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const htmlPage = (status: number, heading: string, message: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading} — Rumeau Design Co</title>
    <meta name="robots" content="noindex, nofollow">
    <style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;color:#1a1a1a;line-height:1.5}
    h1{color:#002885;font-size:1.5rem}a{color:#002885}</style></head>
    <body><h1>${heading}</h1><p>${message}</p><p><a href="/contact">← Back to the form</a></p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

const respondError = (request: Request, status: number, message: string) =>
  wantsJson(request)
    ? jsonResponse(status, { ok: false, message })
    : htmlPage(status, "That didn't go through", message);

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  let fields: Record<string, string>;
  try {
    /*
      `request.formData()` parses EITHER multipart/form-data (what
      fetch(form.action, {body: new FormData(form)}) sends) or
      application/x-www-form-urlencoded (what a browser sends for a plain,
      no-JS <form method="POST"> submission) - both are valid per the Fetch
      spec, and this is what lets the same handler serve both paths without
      branching on content type itself.
    */
    const raw = await request.formData();
    fields = {};
    for (const [key, value] of raw.entries()) {
      // File inputs would come through as File objects; this form has none,
      // so anything that is not a string is discarded rather than coerced -
      // coercing a File to a string produces "[object File]", which would
      // sail through every check below as a plausible-looking answer.
      if (typeof value === 'string') fields[key] = value;
    }
  } catch {
    return respondError(request, 400, 'Could not read the form. Please try again.');
  }

  /*
    The honeypot. Anything in this field means whatever submitted the form
    filled in EVERY input it could find, which a sighted human filling in a
    visible form does not do - the field is positioned off-screen, not
    display:none, specifically because some bots skip display:none fields
    having learned that trick exists.

    Returns a SUCCESS response despite doing nothing. Telling a bot "rejected"
    teaches it something useful about this endpoint; telling it "accepted"
    does not, and costs one wasted round trip on its side for zero writes on
    ours.
  */
  if (fields.website) {
    return wantsJson(request)
      ? jsonResponse(200, { ok: true })
      : htmlPage(200, 'Thanks!', "I'll get back to you soon.");
  }

  // --- Turnstile -----------------------------------------------------------
  const turnstileToken = fields['cf-turnstile-response'];
  if (!turnstileToken) {
    return respondError(
      request,
      400,
      'The spam check did not complete. If you have JavaScript disabled, please email chris@rumeaudesign.co directly instead.',
    );
  }
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
      remoteip: request.headers.get('CF-Connecting-IP') ?? '',
    }),
  });
  /*
    Cast rather than a generic on .json() - Response.json() in the standard
    Fetch types returns Promise<any> with no type parameter; a generic there
    only type-checks with @cloudflare/workers-types installed, which this file
    does not depend on (nothing else in the project does either, so it stays
    that way rather than adding a dependency for one file). Identical at
    runtime either way; the cast just keeps this honest for whichever types
    actually apply.
  */
  const verifyResult = (await verify.json().catch(() => ({ success: false }))) as { success: boolean };
  if (!verifyResult.success) {
    return respondError(request, 400, "The spam check didn't pass. Please try again.");
  }

  // --- validation ------------------------------------------------------------
  const result = validateSubmission(fields);
  if (!result.ok) {
    return respondError(request, 400, result.message);
  }
  const data = result.data;

  // --- write to Sanity -------------------------------------------------------
  const submittedAt = new Date().toISOString();
  const sanityRes = await fetch(
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
            create: {
              _type: 'submission',
              ...data,
              submittedAt,
              /*
                Set explicitly rather than relying on the schema's
                `initialValue: 'new'`. That field only fires when a document
                is created THROUGH STUDIO'S OWN UI - it is a desk-tool
                convenience, not something the content lake enforces - so a
                document created by a direct API mutation, which this is,
                would otherwise land with no status at all and vanish from
                every view that filters or sorts by it.
              */
              status: 'new',
            },
          },
        ],
      }),
    },
  );

  if (!sanityRes.ok) {
    /*
      Sanity failing is not the visitor's fault and "please try again" is not
      an honest response to it - retrying would very likely fail the same way.
      Logged for Chris to notice in the Cloudflare dashboard; the visitor gets
      a straight answer and a fallback that does not depend on this system
      working.
    */
    console.error('Sanity write failed', sanityRes.status, await sanityRes.text());
    return respondError(
      request,
      502,
      "Something broke on my end saving this. Please email chris@rumeaudesign.co directly so nothing gets lost.",
    );
  }

  // --- notify by email -------------------------------------------------------
  /*
    Best-effort, and deliberately not allowed to fail the request. The
    submission is already safely in Sanity by this point - Studio is the
    record of truth - so a Resend outage should cost Chris a delayed email
    notification, not cost the visitor a form that appears to have failed
    when their enquiry in fact went through.
  */
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Resend's own shared sending domain. Sending FROM it rather than
        // from @rumeaudesign.co is what avoids touching this domain's DNS -
        // no SPF/DKIM records to add, which is exactly the category of
        // change that silently breaks Google Workspace mail if gotten wrong.
        // This is a note to Chris about a submission, not a message to a
        // client, so the From address being generic costs nothing.
        from: 'Rumeau Design Co site <onboarding@resend.dev>',
        to: env.CONTACT_NOTIFY_EMAIL,
        subject: `New enquiry: ${data.name}${data.company ? ` (${data.company})` : ''}`,
        text: [
          `${data.name} <${data.email}>${data.company ? ` — ${data.company}` : ''}`,
          '',
          `Business: ${data.businessDescription}`,
          `Goals: ${data.goals}`,
          `Seriousness: ${data.seriousness}/10`,
          `Timeframe: ${data.timeframe}`,
          data.budgetNotSure
            ? 'Budget: not sure yet'
            : `Budget: $${data.budgetMin.toLocaleString()}–$${data.budgetMax.toLocaleString()}${data.budgetOpenEnded ? '+' : ''}`,
          `Found via: ${data.foundVia}`,
          `Phone: ${data.phone}`,
          '',
          'Full record in Sanity Studio under Contact form submissions.',
        ].join('\n'),
      }),
    });
  } catch (error) {
    console.error('Resend notification failed (submission was still saved)', error);
  }

  return wantsJson(request)
    ? jsonResponse(200, { ok: true })
    : htmlPage(200, 'Thanks for filling this out!', "I'll get back to you soon. — Chris Rumeau, Rumeau Design Co");
};

// Anything other than POST is not a form submission this endpoint understands.
export const onRequestGet = async (): Promise<Response> =>
  new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
