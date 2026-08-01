import { toHTML } from '@portabletext/to-html';
import { urlFor } from './image';

export function renderPortableText(blocks: unknown): string {
  if (!blocks || !Array.isArray(blocks) || !blocks.length) return '';
  return toHTML(blocks as never, {
    components: {
      types: {
        image: ({ value }) =>
          `<img src="${urlFor(value).width(1200).fit('max').url()}" alt="${value.alt ?? ''}" loading="lazy" />`,
      },
    },
  });
}
