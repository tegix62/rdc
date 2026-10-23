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

export const pathOf = (params: {path?: string | string[]}) =>
  Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');

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

export const formatFor = (request: Request): 'avif' | 'webp' =>
  /image\/avif/i.test(request.headers.get('accept') ?? '') ? 'avif' : 'webp';

/*
  The address asked of Sanity, with the format written into it. Where the
  page asks for auto=format, that is swapped for fm=avif or fm=webp - so
  the two formats are two different addresses, and no cache keyed on the
  address alone can hand one browser the other's. Cloudflare's own fetch
  cache is one such: it keeps .jpg and .png answers by URL even when not
  asked to, and on the first version two pictures came back WebP to a
  browser that asked for AVIF. An animated GIF is left as asked: converting
  it is not this route's decision.
*/
export function upstreamFor(path: string, search: string, format: 'avif' | 'webp') {
  const q = new URLSearchParams(search);
  if (q.get('auto') === 'format' && !/\.gif$/i.test(path)) {
    q.delete('auto');
    q.set('fm', format);
  }
  const query = q.toString();
  return `https://cdn.sanity.io/${path}${query ? `?${query}` : ''}`;
}

export interface ProxyDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  cache: {match(r: Request): Promise<Response | undefined>; put(r: Request, res: Response): Promise<void>};
  waitUntil(p: Promise<unknown>): void;
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
  // it. v2: entries from before upstreamFor may hold the wrong format.
  const key = new Request(`${url.origin}/img/${path}${url.search}${url.search ? '&' : '?'}_as=${format}&_v=2`);
  const hit = await deps.cache.match(key);
  if (hit) return hit;

  // The upstream address names its format (upstreamFor), so caching it by
  // address is safe again.
  const r = await deps.fetch(upstream, {headers: {accept}, cf} as RequestInit);
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
