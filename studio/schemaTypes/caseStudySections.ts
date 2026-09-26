import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'
import {VIDEO_FIELDSET, videoBehaviourFields, videoFieldsets} from './videoFields'

/*
  Every image in every section block goes through here, so alt text stays up
  front and the compression toggle stays folded away. Deliberately not passing
  `tile: true`: print mode is a toggle on /portfolio, and nothing inside a
  section block ever renders there, so the print-mode treatment would be a
  question with no consequence.
*/
const image = (name: string, title: string) => defineField(imageSpec({name, title}) as any)

/*
  NAMING A BLOCK IN THE PAGE BUILDER.

  The list showed each block by its TYPE - "Full Image", "Full Image", "Full
  Image" - so a page with three of them offered three identical rows and no
  way to tell which was the band photo. Adelante has exactly that. Finding a
  block meant opening them one at a time.

  Title and subtitle were the wrong way round. The type is the least
  distinguishing thing about a block, because every block of that type shares
  it; what separates them is what is IN them. So the title is now what the
  block is about and the subtitle is what kind of block it is - which also
  keeps the type visible, since it was worth showing, just not first.

  Two ways to get a title, in order:

    1. A label, typed by hand. Last in the form and never rendered - it exists
       for this list and says so.
    2. Failing that, whatever the block already knows: its heading, or its
       image's alt text. Most blocks name themselves this way with nothing
       typed, which is the point - a naming scheme that needs work to be
       useful does not get used.
*/
const labelField = () =>
  defineField({
    name: 'label',
    title: 'Label for the Page Builder list',
    type: 'string',
    description:
      'Optional, and never appears on the site. Only for telling this block ' +
      'apart from its neighbours in the list above - useful when a page has ' +
      'several of the same kind.',
  })

/*
  title = what this block is about, subtitle = what kind it is, plus whatever
  detail the block already reported. Undefined rather than an empty string, so
  Studio renders no subtitle at all instead of a blank line.
*/
const describe = (
  kind: string,
  name?: string,
  ...details: (string | undefined | null)[]
): {title: string; subtitle?: string} => {
  const detail = details.filter(Boolean).join(' · ')
  const subtitle = [name ? kind : null, detail || null].filter(Boolean).join(' · ')
  return {title: name || kind, subtitle: subtitle || undefined}
}

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
          {title: 'Fit the whole image on screen', value: 'fit'},
          {title: 'Fill the width, even if it runs taller than the screen', value: 'fill'},
        ],
        layout: 'radio',
      },
      initialValue: 'fit',
      description:
        'Fit keeps the image under 85% of the screen height, so it is taken ' +
        'in at once - a wide image still spans the full width, a tall one ' +
        'sits narrower. Fill is the opt-out for a plate worth scrolling ' +
        'through, like a large detailed drawing; be aware a square image at ' +
        'full width runs about three screens tall on a desktop.',
    }),
    labelField(),
  ],
  preview: {
    select: {label: 'label', alt: 'image.alt', assetAlt: 'image.asset.altText', media: 'image'},
    prepare: ({label, alt, assetAlt, media}) => ({
      ...describe('Full Image', label || alt || assetAlt),
      media,
    }),
  },
})

export const twoUpSection = defineType({
  name: 'twoUpSection',
  title: 'Two Images',
  type: 'object',
  fields: [image('imageLeft', 'Left Image'), image('imageRight', 'Right Image'), labelField()],
  preview: {
    select: {label: 'label', alt: 'imageLeft.alt', assetAlt: 'imageLeft.asset.altText', media: 'imageLeft'},
    prepare: ({label, alt, assetAlt, media}) => ({
      ...describe('Two Images', label || alt || assetAlt),
      media,
    }),
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
    labelField(),
  ],
  preview: {
    select: {label: 'label', alt: 'imageOne.alt', assetAlt: 'imageOne.asset.altText', media: 'imageOne'},
    prepare: ({label, alt, assetAlt, media}) => ({
      ...describe('Three Images', label || alt || assetAlt),
      media,
    }),
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
    labelField(),
  ],
  preview: {
    select: {
      label: 'label',
      heading: 'heading',
      alt: 'image.alt',
      assetAlt: 'image.asset.altText',
      media: 'image',
    },
    prepare: ({label, heading, alt, assetAlt, media}) => ({
      ...describe('Image + Text', label || heading || alt || assetAlt),
      media,
    }),
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
    ...videoBehaviourFields('primary'),
    labelField(),
  ],
  fieldsets: videoFieldsets('primary'),
  preview: {
    select: {label: 'label', caption: 'caption', url: 'url'},
    prepare: ({label, caption, url}) => describe('Video Embed', label || caption, url),
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
    labelField(),
  ],
  preview: {
    select: {label: 'label', heading: 'heading', stat: 'statValue'},
    prepare: ({label, heading, stat}) => describe('Stat Callout', label || heading, stat),
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
    labelField(),
  ],
  preview: {
    select: {label: 'label', heading: 'heading'},
    prepare: ({label, heading}) => describe('Text', label || heading),
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
    labelField(),
  ],
  preview: {
    select: {label: 'label', alt: 'imageLeft.alt', assetAlt: 'imageLeft.asset.altText', media: 'imageLeft'},
    prepare: ({label, alt, assetAlt, media}) => ({
      ...describe('Achievements', label || alt || assetAlt),
      media,
    }),
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
    ...videoBehaviourFields('primary'),
    labelField(),
  ],
  fieldsets: videoFieldsets('primary'),
  preview: {
    select: {label: 'label', heading: 'heading', url: 'url'},
    prepare: ({label, heading, url}) => describe('Video Hero', label || heading, url),
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
    labelField(),
  ],
  preview: {
    select: {label: 'label', heading: 'heading'},
    prepare: ({label, heading}) => describe('Aesthetic Range', label || heading, 'Icon tray'),
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
    /*
      The URL is first now. It used to sit under all seven behaviour fields,
      under a description that said "leave empty when uploading a file above" -
      pointing at fields that are now folded away. The two ways to name a video
      belong next to each other.
    */
    defineField({
      name: 'url',
      title: 'Video URL (YouTube or Vimeo)',
      type: 'url',
      description:
        'For long or sound-on videos only. Leave empty when uploading a file ' +
        'instead. An upload wins if both are filled in.',
    }),
    ...videoBehaviourFields('primary'),
    defineField({
      name: 'caption',
      type: 'string',
      description: 'Optional line under this item.',
    }),
  ],
  fieldsets: videoFieldsets('primary'),
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
      // Same reason as the Page Builder array in caseStudy.ts: a Video item is
      // a URL, a poster with its own alt text, and two collapsed panels. That
      // is not a popover's worth of form.
      options: {modal: {type: 'dialog', width: 'auto'}},
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
    /*
      HOW THE ROW DIVIDES ITS WIDTH.

      By default each item's width comes from its own shape, so a wide photo
      beside a tall one splits the row 69/31, and a row of tall items pulls in
      narrower than a row of wide ones. Nothing is ever cropped, which is the
      right default for work whose edges matter - a mark, a flyer, a poster.

      Equal slots is the other discipline, and it is what makes a page of
      loose images read as a grid: every slot the same width, every row the
      same width, whatever is in them. The cost is that an item whose shape
      differs from the slot has to either be cropped or sit inside with space
      around it - so that choice is the same field.
    */
    defineField({
      name: 'rowLayout',
      title: 'Layout',
      type: 'string',
      options: {
        list: [
          {title: 'Sized by shape - widths follow each image, never cropped', value: 'shape'},
          {title: 'Equal slots - images sit inside, never cropped', value: 'fit'},
          {title: 'Equal slots - images fill the slot and are cropped', value: 'fill'},
        ],
        layout: 'radio',
      },
      initialValue: 'shape',
      description:
        'Equal slots keeps every row the same width, which reads as a grid ' +
        'rather than a stack of rows. Use "fill" for photography that can ' +
        'take a crop, and "sit inside" for artwork whose edges matter.',
    }),
    defineField({
      name: 'cellShape',
      title: 'Slot shape',
      type: 'string',
      // Meaningless while widths come from the images themselves.
      hidden: ({parent}: any) => !parent?.rowLayout || parent.rowLayout === 'shape',
      options: {
        list: [
          {title: 'Automatic - the shape of the widest image in this row', value: 'auto'},
          {title: 'Wide (2:1)', value: '2 / 1'},
          {title: 'Landscape (3:2)', value: '3 / 2'},
          /*
            5:4 and 2:3 were added when the house shapes were settled: a pair
            fills the measure from 1.16:1 up, so 5:4 is the most portrait
            landscape that still fills one, and 4:5 is the same rectangle
            turned for a row of three. 2:3 is there for a row of four, and
            because it is what a 35mm frame and most poster stock already are.
          */
          {title: 'Portrait-ish landscape (5:4) - the house pair shape', value: '5 / 4'},
          {title: 'Square (1:1)', value: '1 / 1'},
          {title: 'Tall (4:5) - the house shape for a row of three', value: '4 / 5'},
          {title: 'Taller (2:3)', value: '2 / 3'},
        ],
        layout: 'radio',
      },
      initialValue: 'auto',
      description:
        'Automatic is right nearly always: the slots take the shape of the ' +
        'widest image here, so nothing is made smaller than the row and the ' +
        'only space added is beside the narrower ones. Pick a shape when you ' +
        'want one imposed - Tall for a row of phone-shaped video, Landscape ' +
        'across several rows of photography that should all match.',
    }),
    labelField(),
  ],
  /*
    Counts the videos, because "3 item(s)" does not tell you a row contains
    one - and a Media Row is one of the four blocks that can put a video on the
    page while being listed under a name that does not say so.
  */
  preview: {
    select: {label: 'label', heading: 'heading', items: 'items'},
    prepare: ({label, heading, items}) => {
      const n = items?.length ?? 0
      const videos = (items ?? []).filter((i: any) => i?._type === 'mediaVideo').length
      const count = `${n} item${n === 1 ? '' : 's'}`
      const clips = videos ? `${videos} video${videos === 1 ? '' : 's'}` : undefined
      return describe('Media Row', label || heading, count, clips)
    },
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
      name: 'mediaPosition',
      title: 'Media Position',
      type: 'string',
      options: {list: ['Left', 'Right'], layout: 'radio'},
      initialValue: 'Left',
    }),
    defineField({name: 'heading', type: 'string'}),
    defineField({name: 'text', type: 'text', rows: 4}),
    /*
      Everything video, last and folded away - including this URL, which is why
      it carries the fieldset the shared fields carry. The block's ordinary use
      is an image beside a paragraph; the video is the exception, and it was
      sitting between the image and the copy that goes with it.
    */
    defineField({
      name: 'videoUrl',
      title: 'Video URL (optional)',
      type: 'url',
      description:
        'A YouTube or Vimeo link. When set, this plays INSTEAD of the image ' +
        'above - the image is not shown. Leave empty for an image.',
    }),
    ...videoBehaviourFields('optional'),
    labelField(),
  ],
  fieldsets: videoFieldsets('optional'),
  /*
    Says "Video" for a video from ANY source, not just a pasted link.

    It used to key on `videoUrl` alone, so a block playing an uploaded file -
    the R2 field, or either Sanity upload - looked identical in the list to a
    block that was only an image. That is half of how a video on this page
    became impossible to find: the form hid it, and the list did not mention
    it either.
  */
  preview: {
    select: {
      label: 'label',
      heading: 'heading',
      alt: 'image.alt',
      assetAlt: 'image.asset.altText',
      media: 'image',
      url: 'videoUrl',
      src: 'videoSrc',
      file: 'videoFile.asset._ref',
      webm: 'videoWebm.asset._ref',
    },
    prepare: ({label, heading, alt, assetAlt, media, url, src, file, webm}) => ({
      ...describe(
        'Media + Text',
        label || heading || alt || assetAlt,
        url || src || file || webm ? 'video plays instead of the image' : undefined,
      ),
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
