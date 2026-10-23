/*
  The logic of functions/img/[[path]].ts - pictures through Cloudflare - as
  plain code, so it can be tested outside Cloudflare (scripts/
  test-image-proxy.mjs). The route passes in the real fetch and cache; the
  test passes in stand-ins and checks what was asked for and what came back.
*/

export const PROJECT = '8337vjtf';
export const DATASET = 'production';
export const YEAR = 31536000;

/** images/<project>/<dataset>/<file> or files/<project>/<dataset>/<file>, nothing else. */
export const ALLOWED = new RegExp(`^(images|files)/${PROJECT}/${DATASET}/[A-Za-z0-9._-]+$`);

/* The asset's path; a leading v2/ (see TO in scripts/lib/proxy-images.mjs) is only a fresh address. */
export const pathOf = (params: {path?: string | string[]}) =>
  (Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')).replace(/^v2\//, '');

const KEEP = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];

export function passHeaders(from: Headers, extra: Record<string, string> = {}) {
  const h = new Headers();
  for (const k of KEEP) {
    const v = from.get(k);
    if (v) h.set(k, v);
  }
  // Pictures are fetched anonymously (crossorigin on some), as from Sanity.
  h.set('access-control-allow-origin', '*');
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

/*
  Two formats, each kept separately. Many URLs ask Sanity for auto=format,
  which picks by the browser's Accept header - so a single cached copy would
  let the first visitor's browser decide for everyone. The first version
  asked for WebP for everyone; measured on the live site (October 2026,
  scripts/measure-image-speed.mjs) that was 27% more bytes than Sanity sent
  directly, because Sanity gives AVIF to the browsers that take it. Now a
  browser that says it takes AVIF is given Sanity's AVIF, and every other
  browser WebP, and the cache keeps one copy of each.
*/
export const ACCEPT = 'image/webp,image/*;q=0.9,*/*;q=0.8';
export const ACCEPT_AVIF = 'image/avif,image/webp;q=0.9,image/*;q=0.8,*/*;q=0.7';

/*
  WebP for everyone, for now - AVIF switched off.

  Measured on the live domain (October 2026): three times a request from a
  browser WITHOUT AVIF was answered with AVIF. Something in front of the
  route on rumeaudesign.co keeps one copy per address and does not honour
  Vary: Accept (the preview address did not do this), and an AVIF given to
  an older Safari is a broken picture. One format per address is the only
  safe arrangement there, and every browser the site supports shows WebP.
  Turning AVIF back on needs the two formats at two different PAGE
  addresses (a <picture> with an AVIF source and a WebP one), not one
  address that answers differently - see AVIF_ENABLED.
*/
export const AVIF_ENABLED = false;

export const formatFor = (request: Request): 'avif' | 'webp' =>
  AVIF_ENABLED && /image\/avif/i.test(request.headers.get('accept') ?? '') ? 'avif' : 'webp';

/*
  The address asked of Sanity, different for each format, so no cache keyed
  on the address alone can hand one browser the other's. Cloudflare's own
  fetch cache is one such: it keeps .jpg and .png answers by URL even when
  not asked to, and on the first version two pictures came back WebP to a
  browser that asked for AVIF.

  For WebP, auto=format is swapped for fm=webp. For AVIF, auto=format is
  kept and Sanity picks AVIF from the Accept header - Sanity does NOT take
  fm=avif: tried on preview (October 2026), every picture came back 400 -
  with dpr=1 added. That is Sanity's default, so the picture is the same,
  but the address is new: the plain auto=format address had been fetched
  as WebP by the first version of this route, and Cloudflare's fetch cache
  went on handing that WebP to AVIF requests at the same address. An animated GIF is left as asked: converting
  it is not this route's decision.
*/
export function upstreamFor(path: string, search: string, format: 'avif' | 'webp') {
  const q = new URLSearchParams(search);
  if (q.get('auto') === 'format' && !/\.gif$/i.test(path)) {
    if (format === 'webp') {
      q.delete('auto');
      q.set('fm', 'webp');
    } else if (!q.has('dpr')) {
      q.set('dpr', '1');
    }
  }
  const query = q.toString();
  return `https://cdn.sanity.io/${path}${query ? `?${query}` : ''}`;
}

export async function proxyImage(
  request: Request,
  params: {path?: string | string[]},
  deps: ProxyDeps,
): Promise<Response> {
  const path = pathOf(params);
  if (!ALLOWED.test(path)) return new Response('Not found', {status: 404});
  const url = new URL(request.url);
  const format = formatFor(request);
  const accept = format === 'avif' ? ACCEPT_AVIF : ACCEPT;
  const upstream = upstreamFor(path, url.search, format);
  const cf = {cacheEverything: true, cacheTtl: YEAR};

  // A video asks for byte ranges; those go to Cloudflare's own cache, which
  // serves ranges from a cached file.
  const range = request.headers.get('range');
  if (range) {
    const r = await deps.fetch(upstream, {headers: {range, accept}, cf} as RequestInit);
    return new Response(r.body, {
      status: r.status,
      headers: passHeaders(r.headers, {'cache-control': r.ok ? `public, max-age=${YEAR}` : 'no-store'}),
    });
  }

  // One stored copy per format: the key is any URL, so the format goes in
  // it. v5: entries before it may hold the wrong format (see below), and
  // v2's were asked with fm=avif, which Sanity answers 400 (not kept, but to be sure).
  const key = new Request(`${url.origin}/img/${path}${url.search}${url.search ? '&' : '?'}_as=${format}&_v=6`);
  const hit = await deps.cache.match(key);
  if (hit) return hit;

  /*
    No `cf` cache options for a picture. Measured on preview (October 2026):
    with cacheEverything on, Sanity sent WebP to 18 of 24 requests that
    asked for AVIF, at addresses never fetched before - the cached fetch
    does not pass the browser's Accept on as given. Without it, AVIF came
    back. The Cache API entry above, keyed by format, is the copy kept.
  */
  const r = await deps.fetch(upstream, {headers: {accept}});
  if (!r.ok) {
    // Not kept: a failure (Sanity over quota, say) must not be cached for a year.
    return new Response(r.body, {status: r.status, headers: passHeaders(r.headers, {'cache-control': 'no-store'})});
  }
  const res = new Response(r.body, {
    status: 200,
    // Vary, so nothing between here and the browser hands one browser's
    // format to another.
    headers: passHeaders(r.headers, {'cache-control': `public, max-age=${YEAR}, immutable`, vary: 'Accept'}),
  });
  deps.waitUntil(deps.cache.put(key, res.clone()));
  return res;
}
