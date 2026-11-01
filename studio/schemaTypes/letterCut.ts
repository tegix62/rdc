import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

/*
  A LETTER, cut from Chris's real work - for "type your name in my letters"
  (preview, /next/letters/name). Chris: "We can try number one ... we'll roll
  it back if we need to."

  Made in the Letters tool (tools/LettersTool.tsx): open a scan, click a
  shape, press its letter. The picture is the scan itself with a crop, so
  nothing is uploaded twice and the letter is always the real drawing.

  Rolling back: remove this type from schemaTypes/index.ts and the tool from
  sanity.config.ts, and delete /src/pages/next/letters/.
*/
export default defineType({
  name: 'letterCut',
  title: 'Letter',
  type: 'document',
  fields: [
    defineField({
      name: 'char',
      title: 'Letter',
      type: 'string',
      description: 'The one character it is: A, g, 7, &.',
      validation: (Rule) => Rule.required().max(1),
    }),
    defineField(
      imageSpec({
        name: 'image',
        title: 'Picture',
        description: 'The scan it is cut from; the crop is the letter.',
        validation: (Rule: any) => Rule.required(),
      }) as any,
    ),
    defineField({
      name: 'from',
      title: 'From',
      type: 'reference',
      to: [{type: 'caseStudy'}],
      weak: true,
      description: 'The project the scan belongs to - named under the letters on the site.',
    }),
  ],
  orderings: [{title: 'Letter', name: 'char', by: [{field: 'char', direction: 'asc'}]}],
  preview: {
    select: {char: 'char', from: 'from.title', media: 'image'},
    prepare: ({char, from, media}) => ({title: char || '?', subtitle: from, media}),
  },
})
