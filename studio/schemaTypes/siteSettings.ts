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
    defineField({
      name: 'contactUrl',
      title: 'Contact Form URL',
      type: 'url',
      description: 'Used by every "Let\'s Work" / "Get in Touch" button and the nav Contact button site-wide.',
    }),
    defineField({
      name: 'bioText',
      title: 'Homepage Bio Text',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'checklist',
      title: 'Homepage Checklist',
      type: 'array',
      description: 'The 3 checkmark items under the proof/metrics row.',
      of: [{type: 'string'}],
    }),
    defineField({
      name: 'proofStats',
      title: 'Homepage Proof Stats',
      type: 'array',
      description: 'The 3 metric cards on the homepage (revenue/listeners/etc). Each links to a case study.',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'stat', title: 'Stat (bolded lead-in)', type: 'string'},
            {name: 'rest', title: 'Rest of the sentence', type: 'string'},
            {name: 'name', type: 'string'},
            {name: 'org', title: 'Organization', type: 'string'},
            {name: 'href', title: 'Link (e.g. /work/hug-a-mug)', type: 'string'},
          ],
        },
      ],
    }),
    defineField({
      name: 'closerPrefix',
      title: 'Homepage Closer - Prefix',
      type: 'text',
      rows: 2,
      description: 'Text before the bolded phrase in the closer/CTA card.',
    }),
    defineField({
      name: 'closerBold',
      title: 'Homepage Closer - Bolded Phrase',
      type: 'string',
    }),
    defineField({
      name: 'closerSuffix',
      title: 'Homepage Closer - Suffix',
      type: 'text',
      rows: 2,
      description: 'Text after the bolded phrase in the closer/CTA card.',
    }),
    defineField({
      name: 'finalCtaHeading',
      title: 'Final CTA Heading',
      type: 'string',
    }),
  ],
  preview: {
    prepare() {
      return {title: 'Site Settings'}
    },
  },
})
