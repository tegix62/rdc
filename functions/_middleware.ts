/*
  Geofences the Meta Pixel: strips it out of the response entirely for
  visitors in the EU, UK, and EEA, before their browser ever receives it.

  WHY THIS EXISTS

  MetaPixel.astro's own comment named this gap when the pixel was switched
  on: it fires on load, on every page, for every visitor, with no
  prior-consent gate. EU/UK/EEA law (the ePrivacy Directive, and the UK's
  PECR) requires opt-in consent BEFORE a non-essential tracking cookie like
  the pixel's `_fbp` is set - not a privacy-policy paragraph, not an
  after-the-fact opt-out. A full consent banner is the textbook-correct fix
  and real UX/engineering work Chris decided not to take on right now;
  geofencing the pixel out of the regions that require consent closes the
  actual legal gap without that cost, at the price of losing ad-attribution
  data for that traffic specifically.

  WHY THIS RUNS HERE, NOT IN THE ASTRO TEMPLATE

  The site is static - built once, served as files - so nothing at BUILD
  time can know a visitor's country. Cloudflare's edge does, on every
  request, via request.cf.country. Pages middleware (this file) is the one
  place that information exists at request time for a site with no other
  server.

  HOW

  Cloudflare Pages serves the built HTML first (context.next()), and this
  rewrites THAT response with HTMLRewriter, removing anything marked
  data-meta-pixel - see src/components/MetaPixel.astro, the only place that
  attribute is written. Only HTML responses are touched; every other asset
  a page load makes (CSS, JS, images) passes through unread, so this costs
  nothing on the majority of requests.

  WHAT THIS DOES NOT PROVE

  HTMLRewriter and request.cf are real Cloudflare Workers runtime globals,
  not available in plain Node.js - so the removal mechanics here cannot be
  exercised by a script run from this repo's own sandbox, only reasoned
  about against Cloudflare's documented behaviour. The COUNTRY-MATCHING
  decision is a pure function precisely so that part - the part most likely
  to actually be wrong, like a mistyped country code - has a real test
  behind it. See src/lib/pixelGeofence.ts and
  scripts/test-pixel-geofence.mjs.
*/
import { countryRequiresConsent } from '../src/lib/pixelGeofence';

interface CFRequest extends Request {
  cf?: { country?: string };
}

interface Context {
  request: CFRequest;
  next(): Promise<Response>;
}

// Only the shape this file actually uses, hand-written rather than pulled
// from @cloudflare/workers-types - same reasoning as functions/api/contact.ts's
// D1Database interface. HTMLRewriter is a real global in the Workers/Pages
// runtime; TypeScript just does not know that without this declaration.
declare global {
  class HTMLRewriter {
    on(selector: string, handlers: { element(el: { remove(): void }): void }): HTMLRewriter;
    transform(response: Response): Response;
  }
}

export const onRequest = async ({ request, next }: Context): Promise<Response> => {
  const response = await next();

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  /*
    request.cf is Cloudflare's own edge-populated field, present on every
    real visitor request. CF-IPCountry is the same information as a request
    header, kept as a fallback for the odd context where .cf is not
    populated. If NEITHER is present, the pixel is left alone rather than
    guessed at - an unknown country is not evidence that consent is
    required, and stripping the pixel from every visitor on a false signal
    would be a worse failure mode than under-geofencing an edge case.
  */
  const country = request.cf?.country ?? request.headers.get('cf-ipcountry') ?? '';
  if (!countryRequiresConsent(country)) return response;

  return new HTMLRewriter()
    .on('script[data-meta-pixel]', { element: (el) => el.remove() })
    .on('img[data-meta-pixel]', { element: (el) => el.remove() })
    .transform(response);
};
