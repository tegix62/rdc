import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

export default defineType({
  name: 'page',
  title: 'Page',
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
      name: 'seoDescription',
      title: 'SEO Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'heading',
      title: 'On-page Heading',
      type: 'string',
      description:
        'Short H1 text shown on the page itself. The Title field above is the ' +
        '<title> tag / SEO title, which is usually longer - leave this blank to ' +
        'fall back to Title.',
    }),
    imageSpec({
      name: 'heroImage',
      title: 'Hero image - top of this page',
    }),
    /*
      Overlaps with the hero image's own "Alt text" field, which is the same
      information in two places. Kept for now because /about reads this one and
      two pages have it filled; merging means a small content migration rather
      than a schema edit. Labelled so it is at least obvious which one wins.
    */
    defineField({
      name: 'heroAlt',
      title: 'Hero image alt text (overrides the image\'s own Alt text)',
      type: 'string',
    }),
    defineField({
      name: 'body',
      type: 'array',
      of: [{type: 'block'}, imageSpec()],
    }),
    /*
      THE COLLAGE ON ABOUT.

      Chris, on the collages: they are "my truest tone of voice ... as a
      graphic designer", and About is the one page about how he sees. So
      one collage sits under the bio there, under the magnifier (see
      components/Loupe.astro) when it has a Full-resolution scan. Which one
      is his to choose; nothing shows until he does. Only About reads this,
      so it hides itself everywhere else.
    */
    defineField({
      name: 'collage',
      title: 'Collage shown under the bio',
      type: 'reference',
      to: [{type: 'caseStudy'}],
      options: {
        filter: 'category == "Collage" || slug.current match "collage-*"',
      },
      hidden: ({document}: any) => document?.slug?.current !== 'about',
      description:
        'One collage, shown whole under the bio - under the magnifier if it ' +
        'has a Full-resolution scan. Leave empty to show none.',
    }),
    defineField({
      name: 'sections',
      title: 'Page Sections',
      type: 'array',
      description:
        'Freeform layout blocks for this page - mix and reorder video heroes, ' +
        'full images, split images, media rows, text and media+text blocks. ' +
        'The same block system as Case Study pages, with the same blocks.',
      /*
        THE SAME MENU AS A CASE STUDY, NOT A SUBSET OF IT.

        Chris, about /video: "if it can function essentially like a Case
        Study page so I can plop stuff in, great." It already renders
        through the same Sections component - what it did not have was the
        full set of blocks to choose from.

        Four were missing here and nowhere else: videoHeroSection,
        textSection, statCalloutSection and achievementsSection. All four
        have had working renderers in Sections.astro the whole time; they
        were simply absent from this array, so they could be built but not
        placed. The video hero is the one that matters for /video - a
        full-bleed autoplay clip is the obvious way to open that page.

        Listed explicitly rather than spread from caseStudySectionTypes
        because that array also carries mediaImage and mediaVideo, which are
        the item types INSIDE a media row and must not appear as things you
        can drop straight onto a page.
      */
      of: [
        {type: 'videoHeroSection'},
        {type: 'fullImageSection'},
        {type: 'twoUpSection'},
        {type: 'threeUpSection'},
        {type: 'imageTextSection'},
        {type: 'videoSection'},
        {type: 'mediaRowSection'},
        {type: 'mediaTextSection'},
        {type: 'textSection'},
        {type: 'statCalloutSection'},
        {type: 'achievementsSection'},
        {type: 'aestheticRangeSection'},
      ],
    }),
  ],
  /*
    THE LIST SHOWS WHICH PAGE THIS IS, NOT JUST WHAT IT IS CALLED.

    Chris: "I don't have access to the video page on Sanity, I don't
    think. I don't really have any option to customize it."

    He did have access. The page exists, has body copy and a video
    section on it already. What he did not have was any way to FIND it:
    with no preview defined, Sanity lists these documents by their
    `title` field, which is the SEO title - so the Video page appears as
    "Process | Rumeau Design Co". The nav calls it Video, the list calls
    it Process, and nothing on screen connects the two.

    The route is the thing a person actually navigates by, so it goes in
    the subtitle. "Process | Rumeau Design Co" over "/video" is findable;
    the title alone is not. Fixes it for every page at once rather than
    renaming this one document, because the next page with a title that
    differs from its nav label would have exactly the same problem.
  */
  preview: {
    select: {title: 'title', slug: 'slug.current', heading: 'heading'},
    prepare({title, slug, heading}: {title?: string; slug?: string; heading?: string}) {
      return {
        title: title || heading || 'Untitled page',
        // The leading slash matters: it reads as a URL rather than as a
        // second name, which is the whole point of putting it here.
        subtitle: slug ? `/${slug}` : 'no slug - this page is not routable',
      };
    },
  },
})
