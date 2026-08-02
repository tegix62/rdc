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

export const statCalloutSection = defineType({
  name: 'statCalloutSection',
  title: 'Stat Callout',
  type: 'object',
  description: 'A short services/checklist list paired with one big stat, e.g. "+22% Increase in Yearly Revenue".',
  fields: [
    defineField({name: 'heading', type: 'string'}),
    defineField({
      name: 'checklist',
      title: 'Checklist',
      type: 'array',
      of: [{type: 'string'}],
    }),
    defineField({name: 'statValue', title: 'Stat Value', type: 'string', description: 'e.g. "+22%"'}),
    defineField({
      name: 'statLabel',
      title: 'Stat Label',
      type: 'string',
      description: 'e.g. "Increase in Yearly Revenue"',
    }),
  ],
  preview: {
    select: {title: 'heading', subtitle: 'statValue'},
    prepare: ({title, subtitle}) => ({title: title || 'Stat Callout', subtitle}),
  },
})

export const textSection = defineType({
  name: 'textSection',
  title: 'Text',
  type: 'object',
  description: 'A heading and/or a paragraph of rich text, no image - for Challenge/Strategy/testimonial-style blocks.',
  fields: [
    defineField({name: 'heading', type: 'string'}),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [{type: 'block'}],
    }),
  ],
  preview: {
    select: {title: 'heading'},
    prepare: ({title}) => ({title: title || 'Text'}),
  },
})

export const achievementsSection = defineType({
  name: 'achievementsSection',
  title: 'Achievements',
  type: 'object',
  description: 'Two images paired with a short bulleted list of results/achievements.',
  fields: [
    image('imageLeft', 'Left Image'),
    image('imageRight', 'Right Image'),
    defineField({
      name: 'items',
      title: 'Achievements',
      type: 'array',
      of: [{type: 'block'}],
    }),
  ],
  preview: {
    select: {media: 'imageLeft'},
    prepare: ({media}) => ({title: 'Achievements', media}),
  },
})

export const videoHeroSection = defineType({
  name: 'videoHeroSection',
  title: 'Video Hero',
  type: 'object',
  description: 'A full-bleed background video with an overlaid title and logo, for a case study opener.',
  fields: [
    defineField({
      name: 'url',
      title: 'Video URL',
      type: 'url',
      description: 'YouTube or Vimeo URL.',
    }),
    defineField({name: 'heading', type: 'string'}),
    image('logo', 'Logo'),
  ],
  preview: {
    select: {title: 'heading', media: 'logo'},
    prepare: ({title, media}) => ({title: title || 'Video Hero', media}),
  },
})

export const caseStudySectionTypes = [
  fullImageSection,
  twoUpSection,
  threeUpSection,
  imageTextSection,
  videoSection,
  statCalloutSection,
  textSection,
  achievementsSection,
  videoHeroSection,
]
