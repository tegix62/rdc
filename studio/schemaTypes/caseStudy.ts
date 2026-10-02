import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'
import {VideoUpload} from '../components/VideoUpload'
import {SearchLengthInput} from '../components/CharacterCount'

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
    {name: 'seo', title: 'Search'},
    {name: 'legacy', title: 'Legacy'},
  ],
  /*
    WHAT FOLDS AWAY ON THE PROJECT PAGE TAB.

    Chris's workflow, in his words: open a project, click Project page,
    scroll all the way down to the Page Builder. Everything above it was
    between him and the only field he opens the tab for - so the Page
    Builder is now first and these three panels hold what he passes on the
    way.

    Which fields those are is measured, not assumed
    (scripts/audit-case-study-fields.mjs, across the published case
    studies):

      accessPassword     0 uses
      heroVideoSrc       0        heroVideoFile  0     heroVideoWebm  0
      heroVideoPlayback  0        heroFit        0
      heroVideo          2 (hug-a-mug, two-point-oh)

    So the whole hero-video apparatus is six fields for one occasionally
    used link, and the password is a field nobody has ever filled sitting
    at the very top of the form.

    Collapsed rather than removed, and collapsed rather than conditionally
    hidden: the fields that would reveal the panel are the ones inside it,
    which is the trap videoFields.ts documents at length. A shut panel with
    a clear title is a thing you can open; a hidden one is a thing you
    cannot find.
  */
  fieldsets: [
    {
      name: 'hero',
      title: 'Video at the top of the page',
      options: {collapsible: true, collapsed: true},
      description:
        'Optional, and only for a video. The hero IMAGE is "Main Project ' +
        'Image" on the Tile tab. Anything set here plays instead of it.',
    },
    {
      name: 'heroUploads',
      title: 'Upload the hero through Sanity instead (slow)',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'tileOptions',
      title: 'How this tile sits in the grid',
      options: {collapsible: true, collapsed: true},
      description:
        'Rarely needed. Measured across the 68 grid items: Hero Tile 0, Tile ' +
        'Layout 2, Archive Mark 10 - everything else is inferred or falls back.',
    },
    {
      name: 'access',
      title: 'Password protection',
      options: {collapsible: true, collapsed: true},
      description: 'For NDA work. Leave alone for a public page.',
    },
  ],
  fields: [
    // --- Tile: what every document is, in the order a tile is built -------
    /*
      ORDERED BY WHAT A TILE ACTUALLY USES, measured across the 68 published
      grid items (scripts/audit-grid-item-fields.mjs):

        68  title, slug, pageType      67  thumbnail        63  category
        46  parentBrand                35  assetType        10  archiveMark
         7  mainImage (never as the tile image)              2  tileTreatment
         0  heroTile

      This tab was written when every document was a project, so its order
      was a project's priorities. 67 of the 72 published documents are
      tiles, and this is the order one of them is actually filled in.

      Page Type leads because it decides which other tabs apply at all.
    */
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
      name: 'mainImage',
      title: 'Main Project Image - page hero, and tile fallback',
      group: 'tile',
      tile: true,
      description:
        'The big image at the top of the project page. Also stands in as the ' +
        'grid tile when Grid Thumbnail is empty.',
    }),
    defineField({
      name: 'category',
      title: 'Category - drives the Portfolio filters',
      type: 'string',
      group: 'tile',
      options: {list: CATEGORIES},
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
        'Which Case Study this tile is a piece of - the tile then offers a ' +
        'link through to that project. Optional, and deliberately so: 22 of ' +
        'the 68 tiles are standalone assets rather than part of a documented ' +
        'piece of work, and those simply show the picture with no link.',
    }),

    /*
      In the Tile tab, and NOT hidden on a Grid Item, despite being the project
      page's hero. The grid falls back to it when there is no thumbnail
      (`item.thumbnail || item.mainImage`), so on some Grid Items it is the only
      image there is - hiding it would have taken their tile away.
    */
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
      name: 'heroTile',
      title: 'Hero Tile - spans two columns',
      type: 'boolean',
      group: 'tile',
      fieldset: 'tileOptions',
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
      name: 'tileTreatment',
      title: 'Tile Layout - override how it sits in the grid',
      type: 'string',
      group: 'tile',
      fieldset: 'tileOptions',
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
    imageSpec({
      name: 'archiveMark',
      title: 'Archive Mark - hand-drawn B&W alternate',
      group: 'tile',
      fieldset: 'tileOptions',
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
    // --- Project page: nothing below here exists on a Grid Item -------------
    /*
      The two video fields were the most confusable pair in this schema: both
      took a YouTube or Vimeo link and were called "Hero Video" and "Film
      Embed", which says nothing about the difference. They are now named for
      WHERE they appear, which is the only thing that actually distinguishes
      them.
    */
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
      /*
        A block opens in a dialog rather than the default popover.

        These are not small members. Media + Text carries an image with its own
        alt text and compression panel, a video panel, a position, a heading and
        a paragraph; Achievements carries two images and a rich-text list. A
        popover is a bubble sized to the field it is anchored to, so editing one
        of these meant scrolling a long form inside a small floating box that
        closes on an outside click. A dialog gets the width, and it stays put.

        `width: 'auto'` rather than a number: the tall blocks want the room, and
        Text - a heading and a paragraph - does not.
      */
      options: {modal: {type: 'dialog', width: 'auto'}},
      of: [
        {type: 'fullImageSection'},
        {type: 'mediaRowSection'},
        {type: 'mediaTextSection'},
        {type: 'videoSection'},
        {type: 'textSection'},
        {type: 'statCalloutSection'},
        {type: 'achievementsSection'},
        {type: 'videoHeroSection'},
        {type: 'aestheticRangeSection'},
        {type: 'twoUpSection', title: 'Two Images (use Media Row)'},
        {type: 'threeUpSection', title: 'Three Images (use Media Row)'},
        {type: 'imageTextSection', title: 'Image + Text (use Media + Text)'},
      ],
    }),
    defineField({
      name: 'summary',
      title: 'Project summary - the paragraph under the title',
      /*
        RICH TEXT, for one reason: it can hold a link.

        Chris asked for this directly - "this should have more text
        capabilities like hyperlinking". It was a plain string, so a
        collaborator's name or a client's site in the opening paragraph was
        a name you could read and not a place you could go, while the same
        credit three fields down in Credits was a real link.

        DELIBERATELY NOT THE FULL EDITOR. No headings, no lists, no images,
        no block quotes. This is one paragraph in a coloured band: a heading
        inside it would compete with the h1 directly above, and a list would
        break a shape that is sized and coloured to be prose. Bold, italic
        and a link are what a sentence needs; everything else here would be
        a way to make the band look like something it is not.

        The five summaries already written were converted first, in one
        transaction, with the site already rendering both shapes - see
        scripts/migrate-summary-to-rich-text.mjs for why that order.
      */
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [{title: 'Paragraph', value: 'normal'}],
          lists: [],
          marks: {
            decorators: [
              {title: 'Bold', value: 'strong'},
              {title: 'Italic', value: 'em'},
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [
                  {
                    name: 'href',
                    type: 'url',
                    title: 'URL',
                    validation: (Rule: any) =>
                      Rule.uri({scheme: ['http', 'https', 'mailto']}).required(),
                  },
                ],
              },
            ],
          },
        },
      ],
      group: 'page',
      hidden: onlyOnCaseStudies,
      description:
        'What a visitor reads at the top of the page. Two or three sentences, ' +
        'around 250 characters - which is the length of the ones already ' +
        'written here, not a rule from anywhere else. Select any words and ' +
        'press the link button to link them. The search blurb on the Search ' +
        'tab is a different job: this one is for someone already reading, ' +
        'that one is for a stranger deciding whether to.',
      /*
        The character ceiling has to count differently now.

        Rule.max() on an array counts BLOCKS, not characters - so the old
        max(600) would have silently become "no more than 600 paragraphs",
        which is not a rule, it is a joke. Counting the text out of the
        blocks is the only way to keep saying the thing that was meant.

        Still a warning, and still 600, for the reason it always was: the
        summaries already written run 236 to 508, so a hard limit anywhere
        in that range would reject copy that is on the site right now.
      */
      validation: (Rule) =>
        Rule.custom((blocks: any) => {
          if (!Array.isArray(blocks)) return true
          const length = blocks
            .filter((b) => b?._type === 'block')
            .flatMap((b) => (Array.isArray(b.children) ? b.children : []))
            .map((span: any) => (typeof span?.text === 'string' ? span.text : ''))
            .join(' ').length
          return length <= 600
            ? true
            : `${length} characters. Longer than any summary on the site so far - the band ` +
                'this sits in is sized for two or three sentences, and past that it starts ' +
                'to compete with the work below it.'
        }).warning(),
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
      name: 'heroVideo',
      title: 'Video at the top of the page (replaces Main Image)',
      type: 'url',
      group: 'page',
      fieldset: 'hero',
      hidden: onlyOnCaseStudies,
      description:
        'A YouTube or Vimeo link. When this is set it plays as the page hero ' +
        'INSTEAD of Main Project Image - the image is not shown above it. For a ' +
        'video further down the page, use the field near the bottom of this tab.',
    }),
    /*
      THE SELF-HOSTED HERO, which the template has been reading for months
      from fields that existed in no schema.

      work/[slug].astro reads heroVideoFile, heroVideoWebm and
      heroVideoPlayback, and none of the three was declared anywhere - so a
      hero video set as an uploaded file would render on the page with no
      field in Studio to edit it through. Undeclared is also unsettable, so
      in practice the branch was simply dead.

      heroVideoSrc is new, and it is the one that matters. `heroVideo` above
      is a url, and Video.astro only treats a source as self-hosted when it
      arrives as an uploaded file or through the videoSrc prop - so pasting an
      R2 link into heroVideo produced no video at all: not an embed, because
      it is not YouTube or Vimeo, and not a file, because a url is not one.
      The hero was the only place on the site with no R2 path.

      Same order as a section's video block: the R2 field first as the one to
      reach for, the slow Sanity uploads folded behind it.
    */
    defineField({
      name: 'heroVideoSrc',
      title: 'Or a self-hosted hero video (R2)',
      type: 'url',
      group: 'page',
      fieldset: 'hero',
      hidden: onlyOnCaseStudies,
      components: {input: VideoUpload},
      description:
        'Drop a video or paste a URL. Uploads go straight to R2 - no Sanity ' +
        'upload stalls. Use this for a short silent loop; use the YouTube or ' +
        'Vimeo field above for anything long or with sound.',
    }),
    defineField({
      name: 'heroVideoPlayback',
      title: 'Hero playback',
      type: 'string',
      group: 'page',
      fieldset: 'hero',
      hidden: onlyOnCaseStudies,
      options: {
        list: [
          {title: 'Autoplay, silent, looping (default)', value: 'autoplay'},
          {title: 'Click to play (centered button)', value: 'click'},
          {title: 'Poster with corner play button', value: 'poster'},
        ],
        layout: 'radio',
      },
      initialValue: 'autoplay',
      description:
        'The template already defaults a hero to autoplay, which is what a ' +
        'short silent loop wants. Autoplay only works on a self-hosted file.',
    }),
    /*
      HOW THE HERO IS SHOWN - the one image on the page that had no say.

      Every picture inside the Page Builder can be told what to do with its
      shape: a Full Image has "Plate fit", a Media Row has slots. The hero,
      which is the biggest image on a case study, had nothing. Its CSS was
      fixed at `max-height: 80vh; object-fit: cover`, so it was ALWAYS
      cropped - which is why DumpStat opens on a fragment of the tee cut off
      at both edges instead of the tee.

      Cropping is right for a hero built from a wide detail, and wrong for one
      that is a whole piece of work. That is a judgement about the picture, so
      it belongs to whoever chose the picture.

      The same two words a Full Image uses, deliberately: one vocabulary for
      one question wherever it comes up.
    */
    defineField({
      name: 'heroFit',
      title: 'Hero image fit',
      type: 'string',
      group: 'page',
      fieldset: 'hero',
      hidden: onlyOnCaseStudies,
      options: {
        list: [
          {title: 'Crop to a band across the top (default)', value: 'band'},
          {title: 'Show the whole image', value: 'whole'},
        ],
        layout: 'radio',
      },
      initialValue: 'band',
      description:
        'A band is right when the hero is a wide detail - a crop is what ' +
        'makes it a band. Choose "whole" when the hero IS the work and losing ' +
        'its edges loses the point. A tall image shown whole still stops at ' +
        '80% of the screen and centres, so it cannot run off the bottom.',
    }),
    defineField({
      name: 'heroVideoFile',
      title: 'Or upload the hero via Sanity (MP4) - slow for large files',
      type: 'file',
      group: 'page',
      fieldset: 'heroUploads',
      hidden: onlyOnCaseStudies,
      options: {accept: '.mp4,.mov,.m4v,video/mp4,video/quicktime'},
      description: 'Prefer the R2 field above; this uploads through Sanity and can stall.',
    }),
    defineField({
      name: 'heroVideoWebm',
      title: 'Or upload the hero via Sanity (WebM)',
      type: 'file',
      group: 'page',
      fieldset: 'heroUploads',
      hidden: onlyOnCaseStudies,
      options: {accept: '.webm,video/webm'},
      description: 'Same clip as WebM - usually smaller than MP4.',
    }),
    defineField({
      name: 'accessPassword',
      title: 'Password Protection',
      type: 'string',
      group: 'page',
      fieldset: 'access',
      hidden: onlyOnCaseStudies,
      description:
        'Set a password to gate this case study. Visitors see a prompt before ' +
        'the content. Leave empty for a public page. This is a casual gate ' +
        'for NDA work, not encryption.',
    }),

    // --- Search: written for a stranger, shown on no page ----------------
    defineField({
      name: 'oneLineSummary',
      title: 'Search blurb (one line)',
      type: 'string',
      group: 'seo',
      components: {input: SearchLengthInput},
      hidden: onlyOnCaseStudies,
      /*
        MOVED OFF THE PROJECT PAGE TAB, because it is not on the page.

        Chris said he did not think this showed up anywhere, and the count
        says he is right about every page as it stands: three case studies
        have a blurb and all three also have a summary, which wins. So
        today this field is purely the search and social description.

        It is still a fallback, which is why it moved rather than went: the
        page renders `summary ?? oneLineSummary`, so clearing a summary
        would put this back on the page. The description says so, because a
        field that is usually invisible and occasionally not is exactly the
        kind that gets written carelessly.
      */
      description:
        'Written for a stranger in a search result, not for someone already ' +
        'reading the page. Sanity keeps it off the page as long as the ' +
        'project summary is filled in - clear that and this becomes the ' +
        'paragraph under the title.',
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
      group: 'seo',
      components: {input: SearchLengthInput},
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
