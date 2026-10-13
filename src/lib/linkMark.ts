/*
  LINKS, WRITTEN OUT RATHER THAN LEFT TO THE DEFAULT.

  @portabletext/to-html does render a link annotation without this, as
  a bare <a href>. Things it cannot know:

  rel="noopener noreferrer" on anything leaving the site. A link opened
  with target=_blank hands the new tab a live reference back to this
  one unless told otherwise, and an editor pasting a link into a
  summary is not thinking about window.opener.

  A link with no href at all - an annotation left half-filled in
  the Studio, which happens - renders as an <a> that goes nowhere and
  looks exactly like one that works. The text survives; the anchor
  does not.

  And a scheme the Studio would never offer. The field only accepts
  http, https and mailto, but this runs on whatever is in the dataset,
  and `javascript:` in an href is code. Anything with a scheme that is
  not on that list loses its anchor and keeps its text. The quote is
  escaped for the same reason: the value goes inside an attribute.

  Its own module, not a function in portableText.ts, because that file
  imports the image helpers, which read the site's environment. A caption
  needs only this, and should not have to load the Sanity client to get it.
  Exported once so there is one copy of the rule and not two that drift.
*/
export function linkMark({ value, children }: { value?: { href?: unknown }; children: string }): string {
  const raw = typeof value?.href === 'string' ? value.href.trim() : '';
  if (!raw) return children;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase();
  if (scheme && !['http', 'https', 'mailto'].includes(scheme)) return children;
  const href = raw.replace(/"/g, '&quot;');
  return scheme === 'http' || scheme === 'https'
    ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${children}</a>`
    : `<a href="${href}">${children}</a>`;
}
