/*
  Drop-off tracking for /contact. THE COUNTER IS OFF. This endpoint accepts a
  ping, validates it, and records nothing.

  WHY - AND WHAT THE ORIGINAL REASONING GOT WRONG

  This used to increment five counters on a published Sanity document,
  `formFunnel.contact`, with no spam protection at all. The comment that used
  to sit here argued that was fine, in these words:

      "The worst outcome of someone hammering it with garbage is a wrong
       number on a dashboard nobody's business decision depends on."

  That was wrong, and on 17 August 2026 it cost the site several hundred
  unintended production deploys in a few minutes.

  The step the reasoning missed is that a Sanity webhook fires a GitHub
  `repository_dispatch` on any create/update/delete of a PUBLISHED document,
  and both deploy-production.yml and deploy-pages.yml listen for it. So the
  real chain was:

      anyone POSTs here  ->  published document changes
                         ->  Sanity webhook
                         ->  repository_dispatch
                         ->  a full build and a deploy to rumeaudesign.co

  One unauthenticated HTTP request, one production deploy. No rate limit, no
  Turnstile, no cap. The blast radius was never "a wrong number on a
  dashboard" - it was an open amplification path into the deploy pipeline, and
  it does not matter whether the traffic that found it was a scanner or a
  crawler.

  Two things were wrong together, and each is worth fixing on its own:

    - an endpoint reachable by anyone wrote to the CMS
    - a CMS write redeployed the live site, with nothing bounding the rate

  This file fixes the first. scripts/test-no-public-cms-writes.mjs keeps it
  fixed. The `concurrency` blocks added to both deploy workflows bound the
  second, so no future burst of ANY kind - webhook, script, or mistake - can
  turn into hundreds of deploys again.

  WHY THE ENDPOINT STILL EXISTS AT ALL

  Pages already cached by browsers and CDNs still contain the old script and
  will keep pinging for a while. A 404 for each of those is noise in the logs
  and a failed request in someone's devtools for no reason. Validating and
  discarding is quieter and costs nothing.

  BRINGING THE COUNTER BACK

  It needs a store that is not the CMS - D1, where the enquiries already live
  (see db/schema.sql). A `funnel` table of five integers and an UPDATE per
  ping. That is a deliberate piece of work rather than something to reinstate
  quietly: it needs a table created against the remote database, and it is
  worth deciding whether a step counter is worth an endpoint at all first.
  Until then this is honest about recording nothing, rather than looking like
  it works.
*/
import { validateFunnelPing } from '../../src/lib/formFunnelValidation';

interface Context {
  request: Request;
}

export const onRequestPost = async ({ request }: Context): Promise<Response> => {
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

  /*
    Validated and discarded. 204 rather than an error, because as far as a
    caller is concerned nothing went wrong - there is simply nowhere for this
    to go until the counter is rebuilt on D1. The validation above is kept so
    that whatever replaces this inherits a checked input rather than a raw
    one.
  */
  return new Response(null, { status: 204 });
};

export const onRequestGet = async (): Promise<Response> =>
  new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
