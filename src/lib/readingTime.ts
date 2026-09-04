import { stripStega } from './stega';

const WORDS_PER_MINUTE = 200;

export function readingTime(blocks: unknown): string | null {
  if (!blocks || !Array.isArray(blocks) || !blocks.length) return null;
  let words = 0;
  for (const block of blocks) {
    if (block._type !== 'block' || !Array.isArray(block.children)) continue;
    /*
      Join the children BEFORE splitting, rather than counting each one.

      Portable Text splits a paragraph at every mark boundary, so one
      sentence arrives as several children - and a mark that starts or ends
      mid-word splits the word itself:

        [{text: 'Hel'}, {text: 'lo world'}]   is "Hello world", two words

      Counted child by child that is three, because each fragment is split on
      whitespace in isolation and 'Hel' counts as a word of its own. Joining
      first counts the sentence the reader actually sees.
    */
    const joined = block.children
      .map((child: any) => (typeof child.text === 'string' ? child.text : ''))
      .join('');
    /*
      STRIP STEGA BEFORE COUNTING, or the invisible characters are the count.

      Visual editing hides a mapping payload inside every string it returns,
      and its alphabet includes U+FEFF - which JavaScript's \s matches, because
      ECMAScript counts <ZWNBSP> as whitespace. So splitting on /\s+/ splits
      inside the payload, and every U+FEFF in it becomes a word boundary.

      Measured: a 240-character payload carries 30 of them, so a four-word
      sentence counts as 33 words. Chris saw the result of that compounding
      over a whole article - "96 min read" and "170 min read", which would be
      19,000 and 34,000 words.

      It only bites on the preview build, since stega is off in production
      (see VISUAL_EDITING in lib/sanity.ts) - so the numbers were wrong
      exactly where they were being looked at.

      This is the hazard lib/stega.ts warns about in general terms: "the
      string is no longer the string, so a comparison fails, a lookup misses,
      or a parse returns garbage". Counting is a parse.
    */
    const text = stripStega(joined) ?? '';
    words += text.split(/\s+/).filter(Boolean).length;
  }
  if (words === 0) return null;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}
