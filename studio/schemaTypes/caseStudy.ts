import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

const CATEGORIES = ['Brand Identity', 'Merch & Apparel', 'Typography', 'Illustration', 'Photography']
const ASSET_TYPES = [
  'Identity / Brand Sheet',
  'Apparel',
  'Social Card',
  'Wide Video',
  'Packaging',
  'Vinyl / Record',
]

/*
  ONE DOCUMENT TYPE, TWO JOBS

  Measured across the dataset: 13 documents are Case Studies, which get a page
  at /work/<slug> and can use all 31 fields. 62 are Grid Items - a tile with no
  page of its own - and a tile can only use 11 of them. The other 19 were shown
  on all 62 anyway: 1,426 field slots that were always empty and always on
  screen, which is most of the reason this form felt heavy.

  So anything that can only ever appear on a project page is hidden when there
  isn't one. Nothing is deleted and no content moves - `hidden` is Studio UI
  only, the data and every GROQ query are untouched. Deleting the line puts a
  field back.

  Note which image fields are NOT hidden: `thumbnail`, `mainImage` and
  `archiveMark` all feed the grid. mainImage especially - the tile falls back to
  it when there is no thumbnail (`item.thumbnail || item.mainImage`), so hiding
  it on Grid Items would have taken away the only image some tiles have.
*/
const onlyOnCaseStudies = ({document}: any) => document?.pageType !== 'Case Study'
const onlyOnGridItems = ({document}: any) => document?.pageType === 'Case Study'

export default defineType({
  name: 'caseStudy',
  title: 'Case Study',
  type: 'document',
  /*
    Tabs, because 31 fields in one scroll is a scroll, not a form. "Tile" holds
    what every document needs and opens first; the other three only apply to a
    project page and go quiet on a Grid Item along with their fields.
  */
  groups: [
    {name: 'tile', title: 'Tile', default: true},
    {name: 'page', title: 'Project page'},
    {name: 'credits', title: 'Credits'},
    {name: 'legacy', title: 'Legacy'},
  ],
  fields: [
    // --- Tile: what every one of the 75 documents needs ---------------------
    defineField({
      name: 'title',
      type: 'string',
      group: 'tile',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'tile',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'pageType',
      title: 'Page Type',
      type: 'string',
      group: 'tile',
      description:
        'Case Study = a full project page at /work/… Grid Item = a tile only, ' +
        'which links to its parent brand. This choice decides which tabs above ' +
        'apply: a Grid Item has no page, so the page-only fields are hidden.',
      options: {list: ['Case Study', 'Grid Item']},
      initialValue: 'Case Study',
    }),
    defineField({
      name: 'category',
      title: 'Category - drives the Portfolio filters',
      type: 'string',
      group: 'tile',
      options: {list: CATEGORIES},
    }),
    imageSpec({
      name: 'thumbnail',
      title: 'Grid Thumbnail - the tile image',
      group: 'tile',
      tile: true,
      description:
        'The image this piece shows as a tile on the Portfolio and homepage ' +
        'grids. If you leave it empty the grid falls back to Main Project Image.',
    }),
    imageSpec({
      name: 'archiveMark',
      title: 'Archive Mark - hand-drawn B&W alternate',
      group: 'tile',
      description:
        'A hand-thresholded black-and-white version of this tile, shown instead ' +
        'of the colour image whenever a visitor switches the Portfolio grid to ' +
        'print mode. This beats anything a filter can do - a computed threshold ' +
        'flattens midtones, yours are drawn. Optional per project: anything ' +
        'without one falls back to the automatic threshold, so the archive gets ' +
        'better as you make more.',
    }),
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
      title: 'Hero Tile - spans two columns',
      type: 'boolean',
      group: 'tile',
      description:
        'Spans two columns AND crops to landscape, so it reads as a spread ' +
        'among the usual vertical tiles. Works on the Portfolio grid and the ' +
        'homepage grid alike. Clicking it does not grow it further. ' +
        'IMPORTANT: set the hotspot on the thumbnail, and turn Compression OFF ' +
        'on it - cropping needs the CDN, so a pass-through image ignores the ' +
        'crop and keeps its own shape. Without a hotspot Sanity crops from the ' +
        'centre, which cuts the top off a logo or a face. Use sparingly; one or ' +
        'two per screenful is what makes them work.',
    }),
    defineField({
      name: 'assetType',
      title: 'Asset Type - what kind of artefact',
      type: 'string',
      group: 'tile',
      description:
        'What this piece physically is. Also the fallback for Tile Layout ' +
        'below when that is left empty: Identity / Brand Sheet and Vinyl / ' +
        'Record are treated as logomarks, everything else fills its tile.',
      options: {list: ASSET_TYPES},
    }),
    /*
      Tile treatment, which is the idea Chris's Adobe Portfolio gallery is built
      on: a logomark strong enough to speak for itself gets room and no caption,
      while a photograph or poster fills its frame. It is a presentation choice,
      not a subject taxonomy, which is why it has two values rather than six.
    */
    defineField({
      name: 'tileTreatment',
      title: 'Tile Layout - override how it sits in the grid',
      type: 'string',
      group: 'tile',
      options: {
        list: [
          {title: 'Logomark - floats, with air around it', value: 'mark'},
          {title: 'Image - fills the tile edge to edge', value: 'bleed'},
        ],
        layout: 'radio',
      },
      description:
        'Only needed when Asset Type above gets it wrong. A logomark gets ' +
        'padding so the mark reads on its own; an image or poster is cropped to ' +
        'fill. Left empty it is inferred, so work already tagged with an Asset ' +
        'Type needs no re-entry.',
    }),
    defineField({
      name: 'parentBrand',
      title: 'Parent Brand - the project this belongs to',
      type: 'reference',
      to: [{type: 'caseStudy'}],
      group: 'tile',
      // The inverse condition: a Case Study IS the parent, so it has none.
      hidden: onlyOnGridItems,
      description:
        'Which Case Study this tile is a piece of. Clicking the tile takes a ' +
        'visitor to that project. Grid Items only.',
    }),

    /*
      In the Tile tab, and NOT hidden on a Grid Item, despite being the project
      page's hero. The grid falls back to it when there is no thumbnail
      (`item.thumbnail || item.mainImage`), so on some Grid Items it is the only
      image there is - hiding it would have taken their tile away.
    */
    imageSpec({
      name: 'mainImage',
      title: 'Main Project Image - page hero, and tile fallback',
      group: 'tile',
      tile: true,
      description:
        'The big image at the top of the project page. Also stands in as the ' +
        'grid tile when Grid Thumbnail is empty.',
    }),

    // --- Project page: nothing below here exists on a Grid Item -------------
    /*
      The two video fields were the most confusable pair in this schema: both
      took a YouTube or Vimeo link and were called "Hero Video" and "Film
      Embed", which says nothing about the difference. They are now named for
      WHERE they appear, which is the only thing that actually distinguishes
      them.
    */
    defineField({
      name: 'accessPassword',
      title: 'Password Protection',
      type: 'string',
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'Set a password to gate this case study. Visitors see a prompt before ' +
        'the content. Leave empty for a public page. This is a casual gate ' +
        'for NDA work, not encryption.',
    }),
    defineField({
      name: 'heroVideo',
      title: 'Video at the top of the page (replaces Main Image)',
      type: 'url',
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'A YouTube or Vimeo link. When this is set it plays as the page hero ' +
        'INSTEAD of Main Project Image - the image is not shown above it. For a ' +
        'video further down the page, use the field near the bottom of this tab.',
    }),
    defineField({
      name: 'headline',
      title: 'Display Headline - overrides Title in the big heading',
      type: 'string',
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'Only if the project needs a different heading on its page than the ' +
        'name it goes by everywhere else. Left empty, Title is used.',
    }),
    defineField({
      name: 'subtitle',
      title: 'Kicker - small line ABOVE the heading',
      type: 'string',
      group: 'page',
      hidden: onlyOnCaseStudies,
    }),
    defineField({
      name: 'oneLineSummary',
      title: 'Short blurb (one line) - also the page meta description',
      type: 'string',
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'One sentence. Doubles as the search-result and social-share ' +
        'description for this page, so write it for a stranger. Overlaps with ' +
        'Full Summary below - these two are due to be merged into one field.',
    }),
    /*
      The search-result line, when it should differ from anything on the page.

      Every other description on a project page is page copy doing double duty:
      the short blurb and the full summary both APPEAR, so rewriting one to read
      better in Google changes the design. This field appears nowhere. It exists
      for the case where the honest thing to show a visitor who already clicked
      and the honest thing to show a stranger deciding whether to are not the
      same sentence.

      Left empty, the page falls back to the blurb, then the summary, then a
      line assembled from category and client - see caseStudyDescription in
      src/lib/meta.ts. So this is an override, never a requirement.
    */
    defineField({
      name: 'seoDescription',
      title: 'Search description (optional) - shown in Google, not on the page',
      type: 'text',
      rows: 2,
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'Leave empty and the short blurb is used. Fill it in when the line ' +
        'that should pull a stranger in differs from the line that belongs on ' +
        'the page. Around 150 characters is what Google shows; longer is ' +
        'trimmed at a word boundary.',
      validation: (Rule) =>
        Rule.max(300).warning(
          'Google renders about 150 characters. This will be cut off - which is ' +
            'fine if the first 150 stand on their own.',
        ),
    }),
    defineField({
      name: 'summary',
      title: 'Full Summary (paragraph) - wins over the short blurb on the page',
      type: 'text',
      rows: 3,
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'A longer version shown at the top of the project page. When this is ' +
        'filled the short blurb above is still used for search and sharing, ' +
        'but this is what visitors read.',
    }),
    defineField({
      name: 'resultStat',
      title: 'Result Stat - the one number a client scans for',
      type: 'string',
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'One headline number for this project, e.g. "3x merch sell-through in ' +
        'the first week". Shown on its own line under the summary.',
    }),
    defineField({
      name: 'client',
      title: 'Client Name',
      type: 'string',
      group: 'page',
      hidden: onlyOnCaseStudies,
    }),
    imageSpec({
      name: 'clientLogo',
      title: "Client's Logo - shown beside the project intro",
      group: 'page',
      hidden: onlyOnCaseStudies,
    }),
    defineField({
      name: 'sections',
      title: 'Page Builder - the body of the project page',
      type: 'array',
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'The layout blocks that make up this page. Full Image for a hero shot, ' +
        'Media Row for two to four images/videos across, Media + Text for ' +
        'media beside copy, Text for a heading and paragraph, and the specialty ' +
        'blocks for stats, achievements, and video heroes.',
      of: [
        {type: 'fullImageSection'},
        {type: 'mediaRowSection'},
        {type: 'mediaTextSection'},
        {type: 'videoSection'},
        {type: 'textSection'},
        {type: 'statCalloutSection'},
        {type: 'achievementsSection'},
        {type: 'videoHeroSection'},
        {type: 'twoUpSection', title: 'Two Images (use Media Row)'},
        {type: 'threeUpSection', title: 'Three Images (use Media Row)'},
        {type: 'imageTextSection', title: 'Image + Text (use Media + Text)'},
      ],
    }),

    // --- Credits -----------------------------------------------------------
    defineField({
      name: 'principalType',
      title: 'Principal Type - the typeface this is built on',
      type: 'string',
      group: 'credits',
      hidden: onlyOnCaseStudies,
      description:
        'Credited the way a typography book lists the principal type used - ' +
        'e.g. "Söhne, Klim Type Foundry" or "Cooper Black, Oswald Cooper". ' +
        'Credit the people you borrowed from whether or not they know you: it ' +
        'is the kind of detail that tells a client how you think.',
    }),
    defineField({
      name: 'principalTypeUrl',
      title: 'Principal Type - link to the foundry',
      type: 'url',
      group: 'credits',
      hidden: onlyOnCaseStudies,
      description:
        'Optional. Makes the typeface credit above a real link. Left empty it ' +
        'just reads as text.',
    }),
    defineField({
      name: 'credits',
      title: 'Collaborators',
      type: 'array',
      group: 'credits',
      hidden: onlyOnCaseStudies,
      description:
        'Everyone else who worked on this. Add a link and the name becomes a ' +
        'real link to their work: good manners, and the credit also goes into ' +
        "the page's structured data so search engines read them as " +
        'contributors rather than as decoration.',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'name', type: 'string'},
            {name: 'role', title: 'Role on this project', type: 'string'},
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

    // --- Legacy ------------------------------------------------------------
    /*
      The pre-Page-Builder way of building a case study, inherited from Webflow.
      The template still honours it - `sections` if present, otherwise these -
      and five case studies still render from here, so it cannot be deleted yet.

      Grouped and labelled as legacy so it stops competing with the Page Builder
      for attention. Retiring it means moving those five projects across, which
      is content work rather than a schema edit.
    */
    defineField({
      name: 'body',
      title: 'Project Details (legacy - prefer Page Builder)',
      type: 'array',
      group: 'legacy',
      hidden: onlyOnCaseStudies,
      of: [{type: 'block'}, imageSpec()],
    }),
    defineField({
      name: 'servicesRendered',
      title: 'Services Rendered (legacy)',
      type: 'array',
      group: 'legacy',
      hidden: onlyOnCaseStudies,
      of: [{type: 'block'}],
    }),
    defineField({
      name: 'merchGrid',
      title: 'Merch Grid (legacy)',
      type: 'array',
      group: 'legacy',
      hidden: onlyOnCaseStudies,
      of: [imageSpec()],
    }),
    defineField({
      name: 'flyerGrid',
      title: 'Flyer Grid (legacy)',
      type: 'array',
      group: 'legacy',
      hidden: onlyOnCaseStudies,
      of: [imageSpec()],
    }),
    defineField({
      name: 'processGrid',
      title: 'Process Grid (legacy)',
      type: 'array',
      group: 'legacy',
      hidden: onlyOnCaseStudies,
      of: [imageSpec()],
    }),
    defineField({
      name: 'filmEmbed',
      title: 'Video further down the page (below the intro)',
      type: 'url',
      group: 'legacy',
      hidden: onlyOnCaseStudies,
      description:
        'A YouTube or Vimeo link, embedded below the project intro. Distinct ' +
        'from the top-of-page video on the Project page tab, which replaces the ' +
        'hero image. For anything new, a Video block in the Page Builder gives ' +
        'you the same thing with control over where it sits.',
    }),
    defineField({
      name: 'accentColor',
      title: 'Accent Colour - background of the page-builder band',
      type: 'string',
      group: 'legacy',
      hidden: onlyOnCaseStudies,
      description:
        "Background colour for this project's section band (hex, e.g. " +
        '#2f5233). Leave blank for white. Text colour is worked out from it ' +
        'automatically, so a dark band gets light type without you setting it.',
    }),
  ],
  /*
    `featured` used to sit here - a boolean set on 74 of 75 documents that
    nothing in src/ has ever read. It was migration noise wearing the costume of
    a setting. Removed; the stored values are cleared by
    studio/migration/unset-dead-fields.mjs so Studio does not report them as
    unknown fields on 74 documents.
  */
  preview: {
    select: {title: 'title', subtitle: 'pageType', media: 'thumbnail'},
  },
})
