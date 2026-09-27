import { toHTML } from '@portabletext/to-html';
import { imageUrl } from './image';

export function renderPortableText(blocks: unknown): string {
  if (!blocks || !Array.isArray(blocks) || !blocks.length) return '';
  return toHTML(blocks as never, {
    components: {
      /*
        LINKS, WRITTEN OUT RATHER THAN LEFT TO THE DEFAULT.

        @portabletext/to-html does render a link annotation without this, as
        a bare <a href>. Two things it cannot know:

        rel="noopener noreferrer" on anything leaving the site. A link opened
        with target=_blank hands the new tab a live reference back to this
        one unless told otherwise, and an editor pasting a link into a
        summary is not thinking about window.opener.

        And a link with no href at all - an annotation left half-filled in
        the Studio, which happens - renders as an <a> that goes nowhere and
        looks exactly like one that works. The text survives; the anchor
        does not.
      */
      marks: {
        link: ({value, children}) => {
          const href = typeof value?.href === 'string' ? value.href.trim() : '';
          if (!href) return children;
          const external = /^https?:\/\//i.test(href);
          return external
            ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${children}</a>`
            : `<a href="${href}">${children}</a>`;
        },
      },
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
