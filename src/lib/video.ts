/*
  Turns a YouTube or Vimeo watch URL into an embeddable one.

  Lifted out of Sections.astro so the case-study hero and the video block use
  the same implementation - two copies would drift, and this already carries a
  fix for a real malformed URL in the migrated content.
*/
export function embedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      // Take the path segment for youtu.be, else the v param. Webflow stored
      // at least one URL as `watch?v=ID?si=...` (a second `?` instead of `&`),
      // which makes the whole tail land in the `v` value — so trim at any
      // stray separator rather than trusting the param verbatim.
      const raw = u.hostname.includes('youtu.be')
        ? u.pathname.slice(1)
        : (u.searchParams.get('v') ?? '');
      const id = raw.split(/[?&/]/)[0];
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : url;
    }
    return url;
  } catch {
    return url;
  }
}
