import {defineField, defineType} from 'sanity'

const image = (name: string, title: string) =>
  defineField({name, title, type: 'image', options: {hotspot: true}})

export const fullImageSection = defineType({
  name: 'fullImageSection',
  title: 'Full Image',
  type: 'object',
  fields: [image('image', 'Image')],
  preview: {
    select: {media: 'image'},
    prepare: ({media}) => ({title: 'Full Image', media}),
  },
})

export const twoUpSection = defineType({
  name: 'twoUpSection',
  title: 'Two Images',
  type: 'object',
  fields: [image('imageLeft', 'Left Image'), image('imageRight', 'Right Image')],
  preview: {
    select: {media: 'imageLeft'},
    prepare: ({media}) => ({title: 'Two Images', media}),
  },
})

export const threeUpSection = defineType({
  name: 'threeUpSection',
  title: 'Three Images',
  type: 'object',
  fields: [
    image('imageOne', 'Image One'),
    image('imageTwo', 'Image Two'),
    image('imageThree', 'Image Three'),
  ],
  preview: {
    select: {media: 'imageOne'},
    prepare: ({media}) => ({title: 'Three Images', media}),
  },
})

export const imageTextSection = defineType({
  name: 'imageTextSection',
  title: 'Image + Text',
  type: 'object',
  fields: [
    image('image', 'Image'),
    defineField({
      name: 'imagePosition',
      title: 'Image Position',
      type: 'string',
      options: {list: ['Left', 'Right']},
      initialValue: 'Left',
    }),
    defineField({name: 'heading', type: 'string'}),
    defineField({name: 'text', type: 'text', rows: 4}),
  ],
  preview: {
    select: {title: 'heading', media: 'image'},
    prepare: ({title, media}) => ({title: title || 'Image + Text', media}),
  },
})

export const videoSection = defineType({
  name: 'videoSection',
  title: 'Video Embed',
  type: 'object',
  fields: [
    defineField({
      name: 'url',
      title: 'Video URL',
      type: 'url',
      description: 'YouTube or Vimeo URL.',
    }),
    defineField({name: 'caption', type: 'string'}),
  ],
  preview: {
    select: {subtitle: 'url'},
    prepare: ({subtitle}) => ({title: 'Video Embed', subtitle}),
  },
})

export const caseStudySectionTypes = [
  fullImageSection,
  twoUpSection,
  threeUpSection,
  imageTextSection,
  videoSection,
]
