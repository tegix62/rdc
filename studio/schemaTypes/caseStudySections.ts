import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'
import {videoBehaviourFields} from './videoFields'

/*
  Every image in every section block goes through here, so alt text stays up
  front and the compression toggle stays folded away. Deliberately not passing
  `tile: true`: print mode is a toggle on /portfolio, and nothing inside a
  section block ever renders there, so the print-mode treatment would be a
  question with no consequence.
*/
const image = (name: string, title: string) => defineField(imageSpec({name, title}) as any)

export const fullImageSection = defineType({
  name: 'fullImageSection',
  title: 'Full Image',
  type: 'object',
  fields: [
    image('image', 'Image'),
    defineField({
      name: 'plateFit',
      title: 'Size',
      type: 'string',
      options: {
        list: [
          {title: 'Automatic - fit wide images, fill with tall ones', value: 'auto'},
          {title: 'Always fit the whole image on screen', value: 'fit'},
          {title: 'Always fill the width, even if it runs tall', value: 'fill'},
        ],
        layout: 'radio',
      },
      initialValue: 'auto',
      description:
        'A wide image can span the screen AND be seen whole, so it is capped ' +
        'at 85% of the screen height. A tall one cannot do both - capping its ' +
        'height would shrink it to a narrow strip - so it fills the width and ' +
        'is scrolled instead. Automatic decides from the image’s own shape ' +
        'and is right almost always; the other two are for when it is not.',
    }),
  ],
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
      title: 'Video URL (YouTube or Vimeo)',
      type: 'url',
      description: 'YouTube or Vimeo URL.',
    }),
    defineField({name: 'caption', type: 'string'}),
    ...videoBehaviourFields,
  ],
  preview: {
    select: {subtitle: 'url'},
    prepare: ({subtitle}) => ({title: 'Video', subtitle}),
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
  title: 'Video Hero (full-bleed, can autoplay)',
  type: 'object',
  description:
    'A full-bleed video opener for a case study, with the title along the bottom. ' +
    'Leave the title blank to show the video on its own.',
  fields: [
    defineField({
      name: 'url',
      title: 'Video URL',
      type: 'url',
      description: 'YouTube or Vimeo URL.',
    }),
    defineField({name: 'heading', type: 'string'}),
    ...videoBehaviourFields,
  ],
  preview: {
    select: {title: 'heading', subtitle: 'url'},
    prepare: ({title, subtitle}) => ({title: title || 'Video Hero', subtitle}),
  },
})


/*
  Recovered from the abandoned "Home 2" draft on Webflow, where it existed as
  Section-Trends: a heading beside a row of three "Trend Block" tiles labelled
  Vintage / Minimalist / Collage. One tile had an empty image slot and the other
  two had none, so the iconography was scaffolded and never filled in.

  Rebuilt as a placeable block rather than pinned to one page, because its job -
  showing range across several aesthetics - is useful on the homepage, an about
  page or a services page, and the layout it belongs in is still being decided.

  Two to six tiles rather than exactly three: the original was a triplet, but
  the point is breadth and that shouldn't be capped by the draft.
*/
export const aestheticRangeSection = defineType({
  name: 'aestheticRangeSection',
  title: 'Aesthetic Range (icon tray)',
  type: 'object',
  fields: [
    defineField({
      name: 'heading',
      type: 'string',
      description: 'The original draft read "What styles are trending now?".',
    }),
    defineField({
      name: 'intro',
      title: 'Supporting line',
      type: 'text',
      rows: 2,
      description: 'Optional. Sits under the heading.',
    }),
    defineField({
      name: 'items',
      title: 'Aesthetics',
      type: 'array',
      validation: (Rule) => Rule.min(2).max(6),
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'label', type: 'string', validation: (Rule) => Rule.required()}),
            image('icon', 'Icon'),
            defineField({
              name: 'iconAlt',
              title: 'Icon alt text',
              type: 'string',
              description:
                'Leave empty if the icon only repeats the label - a screen reader ' +
                'would otherwise read the same word twice.',
            }),
            defineField({
              name: 'href',
              title: 'Link (optional)',
              type: 'string',
              description: 'e.g. /portfolio or a case study path, if this aesthetic has work behind it.',
            }),
          ],
          preview: {select: {title: 'label', media: 'icon'}},
        },
      ],
    }),
  ],
  preview: {
    select: {title: 'heading'},
    prepare: ({title}) => ({title: title || 'Aesthetic Range', subtitle: 'Icon tray'}),
  },
})

/*
  Media Row, and the two item types it holds.

  Replaces the need for a separate "Two Videos" and "Three Videos" block: a row
  is a list of slots, and each slot is independently an image or a video. Three
  animated GIFs across, two videos side by side, a video next to a mockup - all
  the same block, and the layout adapts to how many items are in it.

  Two named member types rather than one object with both an image and a URL
  field, because Sanity then offers a straight "Image or Video?" choice when you
  add an item, instead of an object with half its fields left blank.

  Two Images and Three Images are kept, not removed: existing case studies use
  them, and there is no reason to break working content.
*/
export const mediaImage = defineType({
  name: 'mediaImage',
  title: 'Image',
  type: 'object',
  fields: [
    image('image', 'Image'),
    defineField({
      name: 'caption',
      type: 'string',
      description: 'Optional line under this item.',
    }),
  ],
  preview: {
    select: {media: 'image', title: 'caption', alt: 'image.alt'},
    prepare: ({media, title, alt}) => ({title: title || alt || 'Image', media}),
  },
})

export const mediaVideo = defineType({
  name: 'mediaVideo',
  title: 'Video',
  type: 'object',
  fields: [
    ...videoBehaviourFields,
    defineField({
      name: 'url',
      title: 'Video URL (YouTube or Vimeo)',
      type: 'url',
      description:
        'For long or sound-on videos only. Leave empty when uploading a file ' +
        'above. An upload wins if both are filled in.',
    }),
    defineField({
      name: 'caption',
      type: 'string',
      description: 'Optional line under this item.',
    }),
  ],
  preview: {
    select: {title: 'caption', subtitle: 'url'},
    prepare: ({title, subtitle}) => ({title: title || 'Video', subtitle}),
  },
})

export const mediaRowSection = defineType({
  name: 'mediaRowSection',
  title: 'Media Row (images and/or videos across)',
  type: 'object',
  fields: [
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      of: [{type: 'mediaImage'}, {type: 'mediaVideo'}],
      description:
        'Two or three reads best. Four still works. On a phone they stack ' +
        'vertically whatever you choose, because three things side by side on ' +
        'a 390px screen is unreadable.',
      validation: (Rule) => Rule.min(1).max(4),
    }),
    defineField({
      name: 'heading',
      type: 'string',
      description: 'Optional heading above the row.',
    }),
  ],
  preview: {
    select: {heading: 'heading', items: 'items'},
    prepare: ({heading, items}) => ({
      title: heading || 'Media Row',
      subtitle: `${items?.length ?? 0} item(s)`,
    }),
  },
})

/*
  Media + Text - Image + Text, generalised so the media half can be a video.

  The image and the video are separate fields rather than a one-item list,
  matching how a case study hero already works: fill in the video and it plays
  instead of the image. That pattern is already on this site, so it is one less
  thing to learn.
*/
export const mediaTextSection = defineType({
  name: 'mediaTextSection',
  title: 'Media + Text',
  type: 'object',
  fields: [
    image('image', 'Image'),
    defineField({
      name: 'videoUrl',
      title: 'Video URL (optional)',
      type: 'url',
      description:
        'A YouTube or Vimeo link. When set, this plays INSTEAD of the image ' +
        'above - the image is not shown. Leave empty for an image.',
    }),
    ...videoBehaviourFields,
    defineField({
      name: 'mediaPosition',
      title: 'Media Position',
      type: 'string',
      options: {list: ['Left', 'Right'], layout: 'radio'},
      initialValue: 'Left',
    }),
    defineField({name: 'heading', type: 'string'}),
    defineField({name: 'text', type: 'text', rows: 4}),
  ],
  preview: {
    select: {title: 'heading', media: 'image', subtitle: 'videoUrl'},
    prepare: ({title, media, subtitle}) => ({
      title: title || 'Media + Text',
      subtitle: subtitle ? 'video' : undefined,
      media,
    }),
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
  aestheticRangeSection,
  // The two item types are registered too, because an array member type has to
  // exist in the schema even though nothing places it directly on a page.
  mediaImage,
  mediaVideo,
  mediaRowSection,
  mediaTextSection,
]
