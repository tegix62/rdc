import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'blogPost',
  title: 'Blog Post',
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
    defineField({name: 'excerpt', type: 'text', rows: 3}),
    defineField({name: 'mainImage', title: 'Main Image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'thumbnailImage', title: 'Thumbnail Image', type: 'image', options: {hotspot: true}}),
    defineField({
      name: 'body',
      type: 'array',
      of: [{type: 'block'}, {type: 'image', options: {hotspot: true}}],
    }),
    defineField({name: 'featured', title: 'Featured?', type: 'boolean'}),
    defineField({name: 'color', type: 'string'}),
    defineField({name: 'publishedAt', title: 'Date', type: 'datetime'}),
    defineField({name: 'author', type: 'string'}),
    defineField({name: 'length', title: 'Read Length', type: 'string'}),
    defineField({name: 'metaDescription', title: 'Meta Description', type: 'string'}),
  ],
  preview: {
    select: {title: 'title', media: 'thumbnailImage'},
  },
})
