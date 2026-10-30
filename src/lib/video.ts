/*
  Turns a YouTube or Vimeo watch URL into an embeddable one.

  Lifted out of Sections.astro so the case-study hero and the video block use
  the same implementation - two copies would drift, and this already carries a
  fix for a real malformed URL in the migrated content.
*/
/**
 * A YouTube/Vimeo embed URL, or null if the input cannot produce one.
 *
 * Returning `string | null` rather than echoing the input back is the whole
 * point. This used to `return url` from its catch block, which quietly handed
 * back whatever it was given - and when one migrated document held a non-string
 * in a url field, that object travelled onward until something called
 * `.includes` on it and the entire build died with "embed?.includes is not a
 * function". The build then stayed broken for three commits while the audit
 * kept measuring the last good deploy.
 *
 * Nothing downstream can now receive something that isn't a usable URL.
 */
import {stripStegaKey} from './stega';

export function embedUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
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
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    // A link to something that is neither provider. Handing it to an iframe
    // would embed an arbitrary page, so it is not an embed.
    return null;
  } catch {
    return null;
  }
}

/*
  What a piece plays, from a grid item's video fields (Studio's "Video"
  group, shown on Grid Items): a YouTube or Vimeo link, played through the
  embed (YouTube's no-cookie one), or a self-hosted file (R2) played by the
  browser. `yt` is the YouTube id, for its poster. Shared by the All view
  and the grids, so both play the same thing.
*/
export type Play = {src: string; kind: 'embed' | 'file'; yt: string | null};
export function playOf(v: any): Play | null {
  const embed = embedUrl(stripStegaKey(v?.heroVideo ?? v?.url));
  if (embed) {
    const yt = embed.includes('youtube.com/embed/') ? embed.split('/').pop()! : null;
    return {src: yt ? `https://www.youtube-nocookie.com/embed/${yt}` : embed, kind: 'embed', yt};
  }
  const file = stripStegaKey(v?.heroVideoSrc);
  return file && /^https:\/\//.test(file) ? {src: file, kind: 'file', yt: null} : null;
}
