import {defineField, defineType} from 'sanity'
import {imageBehaviourFields} from './imageFields'

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
    /*
      Tile treatment, which is the idea Chris's Adobe Portfolio gallery is built
      on: a logomark strong enough to speak for itself gets room and no caption,
      while a photograph or poster fills its frame. It is a presentation choice,
      not a subject taxonomy, which is why it has two values rather than six.
    */
    defineField({
      name: 'tileTreatment',
      title: 'Tile Treatment',
      type: 'string',
      options: {
        list: [
          {title: 'Logomark - floats, with air around it', value: 'mark'},
          {title: 'Image - fills the tile edge to edge', value: 'bleed'},
        ],
        layout: 'radio',
      },
      description:
        'How this tile sits in the portfolio grid. A logomark gets padding and ' +
        'space so the mark reads on its own; an image or poster is cropped to ' +
        'fill. Left empty, it is inferred from Asset Type below - so the work ' +
        'already tagged there needs no re-entry.',
    }),
    defineField({
      name: 'assetType',
      title: 'Asset Type',
      type: 'string',
      description:
        'What kind of artefact this is. Now used as the fallback for Tile ' +
        'Treatment above when that is left empty: Identity / Brand Sheet and ' +
        'Vinyl / Record are treated as logomarks, everything else fills its ' +
        'tile. Set Tile Treatment directly to override.',
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
    /*
      Chris ticked this on Chateau Seven, saw nothing widen, and reasonably
      concluded it was broken. It was not: at the time the Portfolio grid
      rendered only "Grid Item" documents, so a Case Study could not be widened
      there because it was not there at all.

      That turned out to be the real fault, and the grid now includes case
      studies. The flag works on both types everywhere it is read, so there is
      nothing left to warn about - only the crop to explain, which is the part
      that still catches people out.
    */
    defineField({
      name: 'heroTile',
      title: 'Hero Tile',
      type: 'boolean',
      description:
        'Spans two columns AND crops to a 3:2 landscape, so it reads as a ' +
        'spread among the usual vertical tiles. Works on the Portfolio grid and ' +
        'the homepage grid alike. Clicking it does not grow it further. ' +
        'IMPORTANT: set the hotspot on the thumbnail, because cropping a ' +
        'portrait image to 3:2 throws away most of its height and without one ' +
        'Sanity crops from the centre, which cuts the top off a logo or a face. ' +
        'Use sparingly; one or two per screenful is what makes them work.',
    }),
    defineField({name: 'thumbnail', type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}),
    defineField({
      name: 'archiveMark',
      title: 'Archive Mark',
      type: 'image',
      fields: imageBehaviourFields,
      description:
        'A hand-thresholded black-and-white version of this tile, shown instead ' +
        'of the colour image whenever a visitor switches the site to print mode. ' +
        'This beats anything a filter can do - a computed threshold flattens ' +
        'midtones, yours are drawn. Optional per project: anything without one ' +
        'falls back to the automatic threshold, so the archive gets better as ' +
        'you make more.',
    }),
    defineField({name: 'mainImage', title: 'Main Project Image', type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}),
    defineField({
      name: 'heroVideo',
      title: 'Hero Video (optional)',
      type: 'url',
      description:
        'A YouTube or Vimeo link. When set, this plays as the page hero INSTEAD ' +
        'of the Main Project Image - the image is not shown above it. Leave ' +
        'empty for a normal image hero.',
    }),
    defineField({name: 'headline', type: 'string'}),
    defineField({name: 'subtitle', type: 'string'}),
    defineField({
      name: 'resultStat',
      title: 'Result Stat',
      type: 'string',
      description:
        'One headline number for this project, e.g. "3x merch sell-through in ' +
        'the first week". Shown under the summary at the top of the case study.',
    }),
    defineField({name: 'client', title: 'Client Name', type: 'string'}),
    defineField({name: 'clientLogo', type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}),
    defineField({name: 'oneLineSummary', title: 'One Line Summary', type: 'string'}),
    defineField({name: 'summary', title: 'Project Summary', type: 'text', rows: 3}),
    defineField({
      name: 'principalType',
      title: 'Principal Type',
      type: 'string',
      description:
        'The typeface this project is built on, credited the way a typography ' +
        'book lists the principal type used - e.g. "Söhne, Klim Type Foundry" ' +
        'or "Cooper Black, Oswald Cooper". Shown as a credit in the project ' +
        'header. Credit the people you borrowed from whether or not they know ' +
        'you: it is the kind of detail that tells a client how you think.',
    }),
    defineField({
      name: 'principalTypeUrl',
      title: 'Principal Type - link',
      type: 'url',
      description:
        'Optional. The foundry or designer, so the credit is a real link rather ' +
        'than a name. Left empty it just reads as text.',
    }),
    defineField({
      name: 'body',
      title: 'Project Details',
      type: 'array',
      of: [{type: 'block'}, {type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}],
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
      of: [{type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}],
    }),
    defineField({
      name: 'flyerGrid',
      title: 'Flyer Grid',
      type: 'array',
      of: [{type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}],
    }),
    defineField({
      name: 'processGrid',
      title: 'Process Grid',
      type: 'array',
      of: [{type: 'image', fields: imageBehaviourFields, options: {hotspot: true}}],
    }),
    defineField({
      name: 'filmEmbed',
      title: 'Film Embed',
      type: 'url',
      description:
        'A YouTube or Vimeo link, embedded below the project intro. For a ' +
        'video at the very top of the page instead, use Hero Video above.',
    }),
    defineField({
      name: 'accentColor',
      title: 'Accent Color',
      type: 'string',
      description:
        'Background color for this project\'s section band (hex, e.g. #2f5233). Leave blank for white.',
    }),
    defineField({
      name: 'credits',
      title: 'Credits',
      type: 'array',
      description:
        'Everyone who worked on this, e.g. "Photography — Jane Doe". Add a link ' +
        'and the name becomes a real link to their work: good manners, and the ' +
        'credit also goes into the page\'s structured data so search engines ' +
        'read them as contributors rather than as decoration.',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'role', type: 'string'},
            {name: 'name', type: 'string'},
            /*
              Named `url` rather than `link` so lib/sanity.ts excludes it from
              stega without another entry in NON_TEXT_FIELDS - a URL with
              zero-width characters in it is a broken link, and that list is
              keyed on field name.
            */
            {
              name: 'url',
              title: 'Link to their work',
              type: 'url',
              description: 'Optional. Left empty the name is just text.',
            },
          ],
          preview: {
            select: {title: 'name', subtitle: 'role'},
          },
        },
      ],
    }),
    defineField({
      name: 'sections',
      title: 'Case Study Sections',
      type: 'array',
      description:
        'Freeform layout blocks for the case study page. Media Row takes two to ' +
        'four items across and each one is independently an image or a video, so ' +
        'three animated GIFs, two videos side by side, or a video next to a ' +
        'mockup are all the same block. Media + Text is the same idea with copy ' +
        'beside it.',
      of: [
        {type: 'fullImageSection'},
        {type: 'twoUpSection'},
        {type: 'threeUpSection'},
        {type: 'imageTextSection'},
        {type: 'videoSection'},
        {type: 'statCalloutSection'},
        {type: 'textSection'},
        {type: 'achievementsSection'},
        {type: 'videoHeroSection'},
        {type: 'mediaRowSection'},
        {type: 'mediaTextSection'},
      ],
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'client', media: 'thumbnail'},
  },
})
