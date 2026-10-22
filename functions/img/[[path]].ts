/*
  PICTURES THROUGH CLOUDFLARE, SO SANITY SERVES EACH ONE ONCE.

  Every picture on the site used to load straight from cdn.sanity.io, so
  every view of every page - a visitor's, or an automated test's - was
  counted against the Sanity plan's monthly bandwidth. In October 2026 that
  ran out ("Additional API, APICDN, and bandwidth usage is now blocked"):
  the site is light, but a month of browser tests reloading the portfolio
  had downloaded its pictures thousands of times.

  Now the built pages ask for /img/<the same path and query> on the site's
  own address (scripts/proxy-images.mjs rewrites them at the end of the
  build), and this asks Sanity for each distinct picture once, keeps it in
  Cloudflare's cache for a year, and serves every later request from there.
  Safe to keep that long: a Sanity asset's path is its content hash and the
  query is the transform, so a URL always means the same bytes.

  Only this project's own assets are passed through - an open proxy to any
  URL would be a gift to anyone who found it.

  The logic is in src/lib/imageProxy.ts, tested by
  scripts/test-image-proxy.mjs with stand-ins for fetch and the cache.
  caches.default and the `cf` fetch options are Cloudflare runtime
  features, not available in plain Node, so the caching itself is reasoned
  from Cloudflare's documentation rather than tested here.
*/
import {proxyImage} from '../../src/lib/imageProxy';

interface Ctx {
  request: Request;
  params: {path?: string | string[]};
  waitUntil(p: Promise<unknown>): void;
}

// Hand-written, like the other functions here, rather than pulling in
// @cloudflare/workers-types for one global.
declare const caches: {default: Cache};

export const onRequestGet = ({request, params, waitUntil}: Ctx): Promise<Response> =>
  proxyImage(request, params, {
    fetch: (url, init) => fetch(url, init),
    cache: caches.default,
    waitUntil,
  });
