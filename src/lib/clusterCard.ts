/*
  The words on a project's block above its cluster.

  Chris: "the cluster with type, the main clickable block above it, and
  maybe a result block". In the Merch & Apparel view, opening a shirt turns
  its case study's own tile into a block of type sitting on top of the shirt:
  the project's name, who it was for, one line about it, the result if there
  is one, and the way into the project.

  Built only from fields that already exist, so it fills itself in for every
  project and nothing new has to be written in Studio for it to work:

    kicker   `subtitle`, the small line above the heading on the project page
    title    `headline` if he set one for the page, else the title
    client   `client`
    line     the first sentence of the summary - the summaries run 257-508
             characters, which is a paragraph, and the block has room for a
             line. A sentence ends where one ends; a summary with no early full
             stop is cut at a word near LINE_MAX instead.
    result   `resultStat`, "the one number a client scans for". Only one
             project has one so far, so the result is optional by design: no
             stat, no result line, and the block is simply shorter.

  Every string goes through stripStega: on the preview Sanity hides editing
  markers in each one, and a marker in the middle of a sentence would split
  it in the wrong place.
*/
import {stripStega} from './stega';

export interface ClusterCard {
  kicker?: string;
  title: string;
  client?: string;
  line?: string;
  result?: string;
}

export const LINE_MAX = 150;

const clean = (s: unknown) => (stripStega(s) ?? '').replace(/\s+/g, ' ').trim();

/** The first sentence, or the text cut at a word before LINE_MAX with an ellipsis. */
export function firstLine(text: unknown, max = LINE_MAX): string | undefined {
  const t = clean(text);
  if (!t) return undefined;
  // A sentence ends at . ! or ? followed by a space and a capital, quote or
  // digit - so "v2.0" or "e.g. this" do not end it. An abbreviation before a
  // capital still would, and then the line is merely shorter: the safe way
  // to be wrong.
  const m = t.match(/^(.+?[.!?])(?=\s+["“'‘(A-Z0-9])/);
  const sentence = m ? m[1] : t;
  if (sentence.length <= max) return sentence;
  const cut = t.slice(0, max + 1);
  const atWord = cut.slice(0, cut.lastIndexOf(' '));
  return `${(atWord || cut.slice(0, max)).replace(/[\s,;:–—-]+$/, '')}…`;
}

export function clusterCard(item: Record<string, any>): ClusterCard | null {
  const title = clean(item?.headline) || clean(item?.title);
  if (!title) return null;
  const opt = (s: unknown) => clean(s) || undefined;
  return {
    kicker: opt(item.subtitle),
    title,
    client: opt(item.client),
    line: firstLine(item.summaryText),
    result: opt(item.resultStat),
  };
}
