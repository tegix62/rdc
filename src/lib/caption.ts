/*
  A caption, whichever shape it is in.

  WHY THERE ARE TWO SHAPES

  Chris wants to link a photographer's name from the caption under a
  picture. A string cannot hold a link, so captions are becoming rich text -
  the same move `summary` made, for the same reason, and with the same
  consequence: documents convert one at a time, so for a while some hold a
  string and some hold blocks. The page has to be right in all three states
  (before, during, after), and it stays tolerant afterwards on purpose.

  Rich text arrives as an array of blocks. A string is escaped rather than
  trusted: it is CMS input going into set:html.

  Both functions treat a caption with nothing in it as no caption. A cleared
  rich-text field is not undefined - Studio leaves one empty block behind -
  and `{caption && <figcaption>}` would draw an empty box under the picture.
*/
import { toHTML } from '@portabletext/to-html';
import { linkMark } from './linkMark';
import { stripStegaKey } from './stega';

export type Caption = string | readonly unknown[] | null | undefined;

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The words alone, no markup. For anything that must be a plain string: an
 * iframe's title attribute, a preview line, a structured-data caption.
 */
export function captionText(caption: Caption): string {
  // Without the preview's zero-width editing markers, which Sanity attaches
  // even to an empty string: a cleared caption must read as empty there too,
  // not as a run of invisible characters that draws an empty box.
  if (typeof caption === 'string') return stripStegaKey(caption);
  if (!Array.isArray(caption)) return '';
  return caption
    .filter((b: any) => b?._type === 'block' && Array.isArray(b.children))
    .map((b: any) =>
      b.children
        .map((span: any) => (typeof span?.text === 'string' ? span.text : ''))
        .join(''),
    )
    .map((line: string) => stripStegaKey(line))
    .filter(Boolean)
    .join(' ');
}

/**
 * The caption as HTML, for set:html. Empty string when there is nothing to
 * show, so the caller's `html && <figcaption>` does the right thing.
 */
export function captionHtml(caption: Caption): string {
  if (!captionText(caption)) return '';
  if (typeof caption === 'string') return escapeHtml(caption.trim());
  return toHTML(caption as never, {
    components: {
      marks: { link: linkMark as never },
      /*
        One line per paragraph, not a <p> per paragraph. A caption sits in a
        <figcaption> or a <p> already, with its own margin and size, and a
        nested <p> would bring a second set of both. A block-level span keeps
        a second paragraph on its own line, which is what pressing Enter in a
        caption means.
      */
      block: {
        normal: ({ children }: { children?: string }) =>
          children ? `<span class="caption__line">${children}</span>` : '',
      } as never,
    },
  });
}
