/*
  THE MONOGRAPH - helpers for the typographic trial at /next/grid (preview
  only). Chris: "I wonder if there are ways to make the site typographically
  gridded and elevated/academic levels of graphic design" - and then "try all
  six in one preview": one type scale, a column grid, a baseline, the
  editorial apparatus (figures, running heads, marginal notes, set
  punctuation), case studies as monographs, and an index of the work.

  These turn what Studio holds into what that page sets: plain text from
  Portable Text, the credits as role and name, quotes and dashes set as a
  typesetter would, Studio's leftover placeholder text kept off the page, and
  a case study's plates in the order its sections show them.
*/
import {stripStegaKey} from './stega';
import {hasAsset} from './image';

const clean = (s: unknown) => stripStegaKey(s).replace(/\s+/g, ' ').trim();

/** Portable Text as plain paragraphs. */
export function paragraphs(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return typeof blocks === 'string' && blocks.trim() ? [clean(blocks)] : [];
  return blocks
    .filter((b: any) => b?._type === 'block')
    .map((b: any) => clean((b.children ?? []).map((c: any) => c?.text ?? '').join('')))
    .filter(Boolean);
}

/*
  Set as a typesetter would: curly quotes and apostrophes, an en dash for a
  spaced hyphen or a range, an ellipsis for three dots. Only ever on plain
  strings this page prints - never on HTML, where a quote may be an
  attribute's.
*/
export function typeset(s: string): string {
  return s
    .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
    .replace(/\s+-{1,2}\s+/g, ' – ')
    .replace(/\.\.\./g, '…')
    .replace(/(^|[\s(\[{—–])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s(\[{—–])'/g, '$1‘')
    .replace(/'/g, '’');
}

/*
  Studio still holds some of the Webflow template's filler - Adelante's
  Client field and two Services Rendered lists are lorem ipsum. The live
  pages show it; the trial leaves it out (and says so in its notes).
*/
export const isPlaceholder = (s: string) => /\b(lorem|ipsum|sed auctor|integer rutrum|vestibulum ante|consectetur adipiscing|faucibus orci)\b/i.test(s);

export type Credit = {role: string; name: string; href?: string};

/** The Credits field's lines - "Photographer - Will Cherry" - as role and name. */
export function credits(blocks: unknown): Credit[] {
  if (!Array.isArray(blocks)) return [];
  const out: Credit[] = [];
  for (const b of blocks as any[]) {
    if (b?._type !== 'block') continue;
    const kids: any[] = b.children ?? [];
    const strong = kids.filter((k) => (k.marks ?? []).includes('strong'));
    const role = clean(strong.map((k) => k.text).join(''));
    const rest = kids.filter((k) => !strong.includes(k));
    const name = clean(rest.map((k) => k.text).join('')).replace(/^[-–—:\s]+/, '');
    const linkKey = rest.flatMap((k) => k.marks ?? []).find((m: string) => (b.markDefs ?? []).some((d: any) => d._key === m && d.href));
    const href = linkKey ? (b.markDefs ?? []).find((d: any) => d._key === linkKey)?.href : undefined;
    if (!role && !name) continue;
    // A line of one part: "Font — FairyTaleJF" in bold, or a name alone.
    if (!name) {
      const [r, ...n] = role.split(/\s+[-–—]\s+/);
      out.push({role: n.length ? r : '', name: n.length ? n.join(' – ') : r, href});
    } else out.push({role, name, href});
  }
  return out.filter((c) => !isPlaceholder(`${c.role} ${c.name}`));
}

/** A Services Rendered list as its lines, filler left out. */
export const services = (blocks: unknown) => paragraphs(blocks).filter((s) => !isPlaceholder(s));

export type Plate = {image: any; caption?: string; group?: string};

/*
  A case study's pictures in the order its page shows them: the main image,
  then each section's (a full image, a pair, an image beside text with the
  text as its caption, a row's pictures under the row's label), then the
  merch, flyer and process grids. Videos are left to the case study itself;
  a monograph's plates are still.
*/
export function plates(cs: any): Plate[] {
  const out: Plate[] = [];
  const add = (image: any, caption?: string, group?: string) => {
    if (hasAsset(image) && !out.some((p) => p.image?.asset?._ref === image.asset._ref)) out.push({image, caption: caption ? clean(caption) : undefined, group});
  };
  add(cs?.mainImage);
  for (const s of cs?.sections ?? []) {
    const label = clean(s?.label) || undefined;
    if (s?._type === 'imageTextSection') add(s.image, typeof s.text === 'string' ? s.text : paragraphs(s.text)[0], label);
    else {
      add(s?.image, undefined, label);
      add(s?.imageLeft, undefined, label);
      add(s?.imageRight, undefined, label);
      for (const it of s?.items ?? []) if (it?._type === 'mediaImage') add(it.image, undefined, label);
    }
  }
  for (const [g, name] of [['merchGrid', 'Merchandise'], ['flyerGrid', 'Flyers'], ['processGrid', 'Process']] as const)
    for (const im of cs?.[g] ?? []) add(im, undefined, name);
  return out;
}

/** "001", "042" - a catalogue number. */
export const catalogueNo = (n: number) => String(n).padStart(3, '0');
