/*
  The form of a page's path that the host actually serves with a 200.

  Astro's directory build format writes /about as dist/about/index.html, and
  Cloudflare Pages serves a directory index at the SLASHED address: /about/ is
  200 and /about is a 308 to it. Checked against the live domain on
  25 Nov 2026 (/portfolio -> 308 -> /portfolio/).

  The canonical, the sitemap and the JSON-LD used to strip the slash, which put
  every one of them on an address that redirects. A canonical that points at a
  redirect is a contradiction Google may resolve by ignoring the canonical, and
  Search Console was already reporting /portfolio and /portfolio/ as two pages.

  The exceptions are pages Astro writes as a FILE rather than a directory -
  404.astro becomes dist/404.html, served at /404 - and anything with an
  extension (/rss.xml).
*/
const FILE_ROUTES = new Set(['/404']);

export const servedPath = (pathname: string): string => {
  const bare = pathname.replace(/\/+$/, '');
  if (bare === '') return '/';
  if (FILE_ROUTES.has(bare)) return bare;
  const last = bare.slice(bare.lastIndexOf('/') + 1);
  if (last.includes('.')) return bare;
  return `${bare}/`;
};
