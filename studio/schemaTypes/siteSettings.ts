import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    defineField({name: 'siteTitle', type: 'string'}),
    defineField({name: 'tagline', type: 'string'}),
    defineField({
      name: 'logo',
      title: 'Nav Logo',
      type: 'image',
      description: 'The stacked "Rumeau Design" wordmark used in the site nav.',
    }),
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
      name: 'proofBandBackground',
      title: 'Proof Band Background Texture',
      type: 'image',
      description: 'Faint tiled sketch texture behind the metrics/closer/checklist band.',
    }),
    defineField({
      name: 'clientLogos',
      title: 'Client Logo Strip',
      type: 'array',
      description: 'Logos shown in the dark navy strip on the homepage.',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'logo', type: 'image', options: {hotspot: true}},
            {name: 'alt', type: 'string'},
            {name: 'href', type: 'string'},
          ],
        },
      ],
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
