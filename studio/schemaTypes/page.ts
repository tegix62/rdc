import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

export default defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'heading',
      title: 'On-page Heading',
      type: 'string',
      description:
        'Short H1 text shown on the page itself. The Title field above is the ' +
        '<title> tag / SEO title, which is usually longer - leave this blank to ' +
        'fall back to Title.',
    }),
    imageSpec({
      name: 'heroImage',
      title: 'Hero image — top of this page',
    }),
    /*
      Overlaps with the hero image's own "Alt text" field, which is the same
      information in two places. Kept for now because /about reads this one and
      two pages have it filled; merging means a small content migration rather
      than a schema edit. Labelled so it is at least obvious which one wins.
    */
    defineField({
      name: 'heroAlt',
      title: 'Hero image alt text (overrides the image\'s own Alt text)',
      type: 'string',
    }),
    defineField({
      name: 'body',
      type: 'array',
      of: [{type: 'block'}, imageSpec()],
    }),
    defineField({
      name: 'sections',
      title: 'Page Sections',
      type: 'array',
      description:
        'Freeform layout blocks for this page - mix and reorder full images, ' +
        'split images, media rows and media+text blocks. Same block system as ' +
        'Case Study pages.',
      of: [
        {type: 'fullImageSection'},
        {type: 'twoUpSection'},
        {type: 'threeUpSection'},
        {type: 'imageTextSection'},
        {type: 'videoSection'},
        {type: 'mediaRowSection'},
        {type: 'mediaTextSection'},
      ],
    }),
  ],
})
