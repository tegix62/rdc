// Generated rather than a static file, because the preview deployment and
// the real site need different rules: the preview is a public URL and would
// otherwise be crawled and compete with rumeaudesign.co for the same copy.
import type { APIRoute } from 'astro';

const IS_PREVIEW = import.meta.env.PUBLIC_IS_PREVIEW === 'true';

export const GET: APIRoute = ({ site }) => {
  const body = IS_PREVIEW
    ? ['User-agent: *', 'Disallow: /', ''].join('\n')
    : ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('sitemap.xml', site).href}`, ''].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
