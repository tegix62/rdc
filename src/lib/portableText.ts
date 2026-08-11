import { toHTML } from '@portabletext/to-html';
import { imageUrl } from './image';

export function renderPortableText(blocks: unknown): string {
  if (!blocks || !Array.isArray(blocks) || !blocks.length) return '';
  return toHTML(blocks as never, {
    components: {
      types: {
        /*
          An image block with no file attached renders nothing at all. Emitting
          `<img src="">` instead would ask the browser to fetch the current page
          as an image and draw a broken-image glyph in the middle of the prose -
          worse than the gap it replaces.
        */
        image: ({ value }) => {
          const src = imageUrl(value)?.width(1200).fit('max').url();
          if (!src) return '';
          return `<img src="${src}" alt="${value.alt ?? ''}" loading="lazy" />`;
        },
      },
    },
  });
}
