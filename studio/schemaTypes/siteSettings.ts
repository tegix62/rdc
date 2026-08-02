import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    defineField({name: 'siteTitle', type: 'string'}),
    defineField({name: 'tagline', type: 'string'}),
    defineField({
      name: 'portrait',
      title: 'Founder Portrait',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'heroBackground',
      title: 'Homepage Hero Background',
      type: 'image',
      description: 'Full-bleed background behind the RUMEAU DESIGN COMPANY statement.',
      options: {hotspot: true},
    }),
    defineField({
      name: 'navLinks',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'label', type: 'string'},
            {name: 'url', type: 'string'},
          ],
        },
      ],
    }),
    defineField({name: 'footerText', type: 'text', rows: 2}),
    defineField({
      name: 'socialLinks',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'platform', type: 'string'},
            {name: 'url', type: 'url'},
          ],
        },
      ],
    }),
  ],
  preview: {
    prepare() {
      return {title: 'Site Settings'}
    },
  },
})
