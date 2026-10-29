/*
  PLAIN - the preview without the habits that read as machine-made.
  Chris: "eyebrow headers are a telltale sign of Claude work", then, of the
  rest of the list - arrows after every link, middle dots between
  everything, soft shadows and rounded pills, result cards as navy blocks -
  "do all of it on preview". So on the preview <html data-plain> is set
  (Layout.astro), the styles hang off :root[data-plain] in global.css
  (PLAIN), and the few words that carry a dot or an arrow ask PLAIN here.
  Production is untouched; to roll back, drop the attribute in Layout.
*/
export const PLAIN = import.meta.env.PUBLIC_IS_PREVIEW === 'true';

/* Chris's own separator, a slash, in place of the middle dot. */
export const SEP = PLAIN ? ' / ' : ' · ';
export const DOT = PLAIN ? '/' : '·';

/* "Next →" as "Next": a label that is already a button needs no arrow after it. */
export const bare = (s: string) => (PLAIN ? s.replace(/\s*(?:→|&rarr;)\s*$/, '').replace(/^\s*(?:←|&larr;)\s*/, '') : s);
