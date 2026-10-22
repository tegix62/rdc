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
  One format for everyone. Many URLs ask Sanity for auto=format, which picks
  by the browser's Accept header; cached once for all visitors, the first
  visitor's browser would decide for the rest. WebP is what every current
  browser accepts, so that is what is asked for.
*/
export const ACCEPT = 'image/webp,image/*;q=0.9,*/*;q=0.8';

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
  const upstream = `https://cdn.sanity.io/${path}${url.search}`;
  const cf = {cacheEverything: true, cacheTtl: YEAR};

  // A video asks for byte ranges; those go to Cloudflare's own cache, which
  // serves ranges from a cached file.
  const range = request.headers.get('range');
  if (range) {
    const r = await deps.fetch(upstream, {headers: {range, accept: ACCEPT}, cf} as RequestInit);
    return new Response(r.body, {
      status: r.status,
      headers: passHeaders(r.headers, {'cache-control': r.ok ? `public, max-age=${YEAR}` : 'no-store'}),
    });
  }

  const key = new Request(`${url.origin}/img/${path}${url.search}`);
  const hit = await deps.cache.match(key);
  if (hit) return hit;

  const r = await deps.fetch(upstream, {headers: {accept: ACCEPT}, cf} as RequestInit);
  if (!r.ok) {
    // Not kept: a failure (Sanity over quota, say) must not be cached for a year.
    return new Response(r.body, {status: r.status, headers: passHeaders(r.headers, {'cache-control': 'no-store'})});
  }
  const res = new Response(r.body, {
    status: 200,
    headers: passHeaders(r.headers, {'cache-control': `public, max-age=${YEAR}, immutable`}),
  });
  deps.waitUntil(deps.cache.put(key, res.clone()));
  return res;
}
