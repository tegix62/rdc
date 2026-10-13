/*
  A case study's credits, as one rich text field.

  WHY

  The panel beside a project title was three kinds of input: a list of
  collaborator objects (name, role, link, each its own little form), plus a
  Principal Type string, plus a Principal Type URL. Chris: "I really just
  need a rich text on the right side that I can hyperlink myself rather than
  the many different options." So it is now one field, `creditsText`, where
  he types the panel the way it reads:

    **Producer** - Henry Heissenbuttel
    **Audio Engineer** - [Adam Cichocki](https://...)
                                               <- an empty line starts a group
    **Principal Type** - [Forevs by OhNo Type Co](https://...)

  WHAT STRUCTURE IS STILL READ OUT OF IT

  The old fields were not only the panel. The collaborators went into the
  page's structured data as `contributor` Person nodes - Chris credits people
  partly so the credit is worth something to them in search - and Principal
  Type feeds the derived meta description. Free text would quietly drop both.
  So the lines are parsed back: a bold run is the role, a linked run is a
  person with their URL, otherwise the rest of the line is the name. That is
  exactly how the text reads to a person, so nothing new has to be learned to
  keep the SEO.

  BOTH SHAPES, FOR GOOD

  Documents move to the new field one migration at a time, and the page must
  be right before, during and after - the same rule captions and the summary
  follow. Every function here takes the whole study and answers from
  `creditsText` when it holds anything, the old fields otherwise.
*/
import { toHTML } from '@portabletext/to-html';
import { linkMark } from './linkMark';

export interface Credit {
  role?: string;
  name: string;
  url?: string;
}

type Block = {
  _type?: string;
  children?: Array<{ _type?: string; text?: unknown; marks?: string[] }>;
  markDefs?: Array<{ _key?: string; _type?: string; href?: unknown }>;
};

const blocksOf = (value: unknown): Block[] =>
  Array.isArray(value) ? (value as Block[]).filter((b) => b?._type === 'block') : [];

const textOf = (b: Block) =>
  (b.children ?? []).map((s) => (typeof s?.text === 'string' ? s.text : '')).join('');

/** True when the rich field holds any words at all. A cleared field may be [] or one empty block. */
export function hasCreditsText(study: { creditsText?: unknown } | null | undefined): boolean {
  return blocksOf(study?.creditsText).some((b) => textOf(b).trim());
}

/*
  Separators people type between a role and a name. Stripped from the ends of
  both, so "Producer -", "Producer:" and "Producer –" all give "Producer".
*/
const SEP = /^[\s\-–—:|,]+|[\s\-–—:|,]+$/g;
const tidy = (s: string) => s.replace(SEP, '').replace(/\s+/g, ' ').trim();

/**
 * One entry per credited person. A line with two linked names ("Photography -
 * A and B") gives two people with the same role. A line with no link gives one
 * person whose name is everything that is not the bold role.
 */
export function parseCreditLines(value: unknown): Credit[] {
  const out: Credit[] = [];
  for (const b of blocksOf(value)) {
    const links = new Map(
      (b.markDefs ?? [])
        .filter((d) => d?._type === 'link' && typeof d.href === 'string' && d.href.trim())
        .map((d) => [d._key, (d.href as string).trim()] as const),
    );
    let role = '';
    let rest = '';
    const people: Credit[] = [];
    let current: { key: string; text: string } | null = null;
    const flush = () => {
      if (current && tidy(current.text)) people.push({ name: tidy(current.text), url: links.get(current.key) });
      current = null;
    };
    for (const span of b.children ?? []) {
      const text = typeof span?.text === 'string' ? span.text : '';
      const marks = span?.marks ?? [];
      const linkKey = marks.find((m) => links.has(m));
      if (marks.includes('strong') && !linkKey) {
        flush();
        role += text;
      } else if (linkKey) {
        // Adjacent spans under the same link are one name (a bold word inside a link, say).
        if (current?.key !== linkKey) flush();
        current = current ?? { key: linkKey, text: '' };
        current.text += text;
      } else {
        flush();
        rest += text;
      }
    }
    flush();
    const r = tidy(role) || undefined;
    if (people.length) {
      for (const p of people) out.push({ role: r, name: p.name, ...(p.url ? { url: p.url } : {}) });
    } else if (tidy(rest)) {
      out.push({ role: r, name: tidy(rest) });
    }
  }
  return out;
}

const isTypeCredit = (c: Credit) => /^principal\s+type/i.test(c.role ?? '');

/** Collaborators for the structured data: everyone except the typeface credit. */
export function contributorsOf(study: Record<string, any> | null | undefined): Credit[] {
  if (hasCreditsText(study ?? undefined)) {
    return parseCreditLines(study!.creditsText).filter((c) => !isTypeCredit(c));
  }
  return (Array.isArray(study?.credits) ? study!.credits : [])
    .filter((c: any) => typeof c?.name === 'string' && c.name.trim())
    .map((c: any) => ({
      name: c.name.trim(),
      ...(typeof c.role === 'string' && c.role.trim() ? { role: c.role.trim() } : {}),
      ...(typeof c.url === 'string' && c.url.trim() ? { url: c.url.trim() } : {}),
    }));
}

/** The typeface credit as plain text, for the derived meta description. */
export function principalTypeOf(study: Record<string, any> | null | undefined): string | undefined {
  if (hasCreditsText(study ?? undefined)) {
    const names = parseCreditLines(study!.creditsText).filter(isTypeCredit).map((c) => c.name);
    return names.length ? names.join(', ') : undefined;
  }
  return typeof study?.principalType === 'string' && study.principalType.trim()
    ? study.principalType
    : undefined;
}

/**
 * The panel as HTML. A line per paragraph; an EMPTY paragraph is a gap
 * between groups - pressing Enter twice is the whole interface for that.
 */
export function creditsHtml(value: unknown): string {
  const blocks = blocksOf(value);
  if (!blocks.some((b) => textOf(b).trim())) return '';
  // Gaps at the very start or end would only push the panel about.
  let first = 0;
  let last = blocks.length - 1;
  while (first <= last && !textOf(blocks[first]).trim()) first++;
  while (last >= first && !textOf(blocks[last]).trim()) last--;
  return toHTML(blocks.slice(first, last + 1) as never, {
    components: {
      marks: { link: linkMark as never },
      block: {
        normal: ({ children }: { children?: string }) =>
          children && children.replace(/<[^>]*>/g, '').trim()
            ? `<p>${children}</p>`
            : '<p class="credits__gap" aria-hidden="true"></p>',
      } as never,
    },
  });
}
