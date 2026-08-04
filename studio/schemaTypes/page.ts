import {defineField, defineType} from 'sanity'
import {imageBehaviourFields} from './imageFields'

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
    defineField({
      name: 'heroImage',
      type: 'image',
      fields: imageBehaviourFields,
      options: {hotspot: true},
    }),
    defineField({name: 'heroAlt', title: 'Hero Image Alt Text', type: 'string'}),
    defineField({
      name: 'body',
      type: 'array',
      of: [{type: 'block'}, {type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}],
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
