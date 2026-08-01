import {defineField, defineType} from 'sanity'

const CATEGORIES = ['Brand Identity', 'Merch & Apparel', 'Typography', 'Illustration', 'Photography']
const ASSET_TYPES = [
  'Identity / Brand Sheet',
  'Apparel',
  'Social Card',
  'Wide Video',
  'Packaging',
  'Vinyl / Record',
]

export default defineType({
  name: 'caseStudy',
  title: 'Case Study',
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
      name: 'pageType',
      title: 'Page Type',
      type: 'string',
      description:
        'Case Study = full project page with SEO copy. Grid Item = thumbnail only, links to parent brand.',
      options: {list: ['Case Study', 'Grid Item']},
      initialValue: 'Case Study',
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: {list: CATEGORIES},
    }),
    defineField({
      name: 'assetType',
      title: 'Asset Type',
      type: 'string',
      description: 'Controls grid tile shape.',
      options: {list: ASSET_TYPES},
    }),
    defineField({
      name: 'parentBrand',
      title: 'Parent Brand',
      type: 'reference',
      to: [{type: 'caseStudy'}],
      description: 'Links a Grid Item to its parent Case Study.',
    }),
    defineField({name: 'featured', title: 'Featured Project?', type: 'boolean'}),
    defineField({
      name: 'heroTile',
      title: 'Hero Tile',
      type: 'boolean',
      description: 'Spans two columns in the homepage grid. Use sparingly.',
    }),
    defineField({name: 'thumbnail', type: 'image', options: {hotspot: true}}),
    defineField({
      name: 'archiveMark',
      title: 'Archive Mark',
      type: 'image',
      description: 'Black and white logomark shown in Archive view.',
    }),
    defineField({name: 'mainImage', title: 'Main Project Image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'headline', type: 'string'}),
    defineField({name: 'subtitle', type: 'string'}),
    defineField({name: 'resultStat', title: 'Result Stat', type: 'string'}),
    defineField({name: 'client', title: 'Client Name', type: 'string'}),
    defineField({name: 'clientLogo', type: 'image', options: {hotspot: true}}),
    defineField({name: 'oneLineSummary', title: 'One Line Summary', type: 'string'}),
    defineField({name: 'summary', title: 'Project Summary', type: 'text', rows: 3}),
    defineField({name: 'principalType', title: 'Principal Type', type: 'string'}),
    defineField({
      name: 'body',
      title: 'Project Details',
      type: 'array',
      of: [{type: 'block'}, {type: 'image', options: {hotspot: true}}],
    }),
    defineField({
      name: 'servicesRendered',
      title: 'Services Rendered',
      type: 'array',
      of: [{type: 'block'}],
    }),
    defineField({
      name: 'merchGrid',
      title: 'Merch Grid',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
    }),
    defineField({
      name: 'flyerGrid',
      title: 'Flyer Grid',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
    }),
    defineField({
      name: 'processGrid',
      title: 'Process Grid',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
    }),
    defineField({name: 'filmEmbed', title: 'Film Embed', type: 'url'}),
  ],
  preview: {
    select: {title: 'title', subtitle: 'client', media: 'thumbnail'},
  },
})
