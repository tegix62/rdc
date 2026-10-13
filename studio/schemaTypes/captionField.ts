import {defineField} from 'sanity'

/*
  A caption that can hold a link.

  Chris asked for this directly: the pictures in a Media Row are often
  someone else's photography, and "Photography by Luke Ivanovich" was text
  you could read and not a place you could go. A string cannot hold a link,
  so the field is rich text - the same move `summary` made on a case study.

  DELIBERATELY NOT THE FULL EDITOR. No headings, no lists, no bold or
  italic. A caption is one quiet line under a picture; every formatting
  option is a way to make it louder than the work it describes. A link is
  the one thing a caption needs that a plain string cannot do.

  LINKS ARE LIMITED TO http, https AND mailto. A photographer's site, or an
  email address to ask about licensing. The site refuses any other scheme
  when it renders, but the field should not offer what the page will drop.

  CONVERTING EXISTING CAPTIONS. Five were plain strings. They were converted
  in one transaction, with the site already rendering both shapes - see
  scripts/migrate-captions-to-rich-text.mjs for why that order.
*/
export function captionField(
  description = 'Optional line under this item. Select any words and press the link ' +
    'button to link them - a photographer’s website, say.',
) {
  return defineField({
    name: 'caption',
    title: 'Caption',
    type: 'array',
    of: [
      {
        type: 'block',
        styles: [{title: 'Normal', value: 'normal'}],
        lists: [],
        marks: {
          decorators: [],
          annotations: [
            {
              name: 'link',
              type: 'object',
              title: 'Link',
              fields: [
                {
                  name: 'href',
                  type: 'url',
                  title: 'URL',
                  validation: (Rule: any) =>
                    Rule.uri({scheme: ['http', 'https', 'mailto']}).required(),
                },
              ],
            },
          ],
        },
      },
    ],
    description,
    /*
      A warning, not a limit. A caption is a line; past about 160
      characters it has stopped being one and become a paragraph sitting
      under a picture. Counted from the text, because Rule.max on an array
      counts blocks, which is not what anyone means.
    */
    validation: (Rule) =>
      Rule.custom((blocks: any) => {
        const length = captionPlain(blocks).length
        return length <= 160
          ? true
          : `${length} characters. A caption is one quiet line; this is long enough to read as a paragraph under the picture.`
      }).warning(),
  })
}

/*
  The words alone, for a Studio preview row (which must be a plain string)
  and for the length check above. Also tolerates the old string, so a
  caption that has not been converted yet still previews.
*/
export function captionPlain(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value
    .filter((b: any) => b?._type === 'block' && Array.isArray(b.children))
    .map((b: any) =>
      b.children.map((s: any) => (typeof s?.text === 'string' ? s.text : '')).join('').trim(),
    )
    .filter(Boolean)
    .join(' ')
}
