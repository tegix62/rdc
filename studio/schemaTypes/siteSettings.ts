import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

/*
  21 fields in one flat scroll, covering three unrelated jobs: the brand marks,
  the homepage composition, and the footer. Tabs split them, and every label now
  says which surface it affects - "Homepage Closer - Prefix" meant nothing
  without already knowing what the closer was.
*/
export default defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  groups: [
    {name: 'brand', title: 'Brand & contact', default: true},
    {name: 'homepage', title: 'Homepage'},
    {name: 'footer', title: 'Footer'},
    {name: 'seo', title: 'Search'},
  ],
  fields: [
    // --- Brand & contact ---------------------------------------------------
    defineField({
      name: 'siteTitle',
      title: 'Site name - browser tabs, social cards, footer',
      type: 'string',
      group: 'brand',
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline - the line under RUMEAU DESIGN COMPANY',
      type: 'string',
      group: 'brand',
    }),
    imageSpec({
      name: 'logo',
      title: 'Wordmark - nav and footer',
      group: 'brand',
      description: 'The stacked "Rumeau Design" wordmark used in the site nav.',
    }),
    /*
      No imageSpec: a favicon is displayed at ~32px by the browser, never by the
      site's own image pipeline, so neither the compression toggle nor a hotspot
      means anything here.
    */
    defineField({
      name: 'favicon',
      title: 'Favicon - the browser-tab icon',
      type: 'image',
      group: 'brand',
      description:
        'Square works best, and it is shown at about 32px, so anything with ' +
        'fine detail will disappear. Without one the site requests ' +
        '/favicon.svg, which does not exist, so every page load 404s and tabs ' +
        'show a blank icon.',
    }),
    imageSpec({
      name: 'portrait',
      title: 'Portrait of you - bottom of the homepage',
      group: 'brand',
    }),
    /*
      The default social card.

      A page with no image of its own previews as a bare text card in Slack,
      iMessage and LinkedIn - which looks broken rather than plain. Only the
      case studies and blog posts had one, so the other nine pages, homepage
      included, shared as text.

      Until this is filled the site falls back to the wordmark, padded onto
      white. That works and is dull; a real card is one image.
    */
    imageSpec({
      name: 'socialImage',
      title: 'Default share image - Slack, iMessage, LinkedIn, X',
      group: 'brand',
      description:
        'Used when a page has no image of its own - the homepage, About, ' +
        'Portfolio, and so on. Project pages and blog posts use their own ' +
        'main image instead. Shown at 1200x630 and CROPPED to that shape, so ' +
        'keep anything important away from the top and bottom edges. Leave it ' +
        'empty and the wordmark is used.',
    }),
    /*
      The tracker switch.

      Empty means NO SCRIPT AT ALL on the site - not disabled, not a stub,
      nothing in the page. That is the default and it is what makes this safe to
      ship: the site stays tracker-free until Chris decides otherwise, and the
      decision is one field rather than a code change.

      It never loads on the preview build, so testing and CI audits cannot fill
      Events Manager with traffic that is not customers.
    */
    defineField({
      name: 'metaPixelId',
      title: 'Meta Pixel ID - leave empty for no tracking at all',
      type: 'string',
      group: 'brand',
      description:
        'From Meta Events Manager → Data sources → your dataset (Meta renamed ' +
        'Pixels to "datasets"). A 15-16 digit number, nothing else. While this ' +
        'is empty the site loads no trackers and sets no cookies, and the ' +
        'privacy policy says so. Filling it in adds about 70KB of Meta script ' +
        'to every page and lets Meta see every visitor, so the policy changes ' +
        'to match. Only worth it if you are actually running ads.',
      validation: (Rule: any) =>
        Rule.custom((value: string | undefined) =>
          !value || /^\d{8,20}$/.test(value.trim())
            ? true
            : 'Just the digits - no URL, no quotes. Events Manager shows it under the dataset name.',
        ),
    }),
    defineField({
      name: 'contactUrl',
      title: 'Contact form link - every button on the site',
      type: 'url',
      group: 'brand',
      description:
        'Used by every "Let\'s Work" / "Get in Touch" button and the nav ' +
        'Contact button site-wide. One field, so there is never a stale link.',
    }),

    /*
      --- Search -------------------------------------------------------------

      WHAT THESE ARE FOR, AND WHY THEY ARE SEPARATE FROM EVERYTHING ELSE

      None of these appear anywhere on the site. They go into the JSON-LD block
      in the page head, which is how a search engine is told what kind of thing
      this business is rather than left to infer it from the copy.

      That makes them the one group of fields where leaving a box empty has no
      visible consequence at all - the page looks identical - so it is worth
      saying what each one buys. Every one of them is optional, and an empty
      field states nothing rather than guessing: structured data that is wrong
      about a business is worse than structured data that is thin.

      Five boxes. Ten minutes, once, and then not again.
    */
    defineField({
      name: 'founderName',
      title: 'Your name - ties you to the studio in search results',
      type: 'string',
      group: 'seo',
      description:
        'People search for the designer as often as the studio. Filling this in ' +
        'states that the two are related, which is what lets Google show one ' +
        'when somebody asks for the other. Without it they are unrelated ' +
        'strings that happen to share a website.',
    }),
    defineField({
      name: 'founderRole',
      title: 'Your title (optional)',
      type: 'string',
      group: 'seo',
      description: 'E.g. "Designer" or "Founder & Designer". Skip it if it feels odd.',
    }),
    defineField({
      name: 'email',
      title: 'Public email (optional)',
      type: 'string',
      group: 'seo',
      description:
        'Only fill this in if you are happy for it to be machine-readable in ' +
        'the page source. Every button on the site points at the contact form ' +
        'instead, so this changes nothing a visitor sees - and scrapers do ' +
        'read it. Left empty, no email is published anywhere.',
      validation: (Rule: any) =>
        Rule.custom((value: string | undefined) =>
          !value || /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value.trim())
            ? true
            : 'That does not look like an email address.',
        ),
    }),
    defineField({
      name: 'locality',
      title: 'City or region you work from',
      type: 'string',
      group: 'seo',
      description:
        'E.g. "New Jersey". Just the place - deliberately not a street ' +
        'address, since a studio taking remote work has no counter to walk up ' +
        'to, and publishing premises you do not have is worse than publishing ' +
        'nothing. Helps for "brand designer near me"-shaped searches.',
    }),
    defineField({
      name: 'areaServed',
      title: 'Who you take work from',
      type: 'string',
      group: 'seo',
      description:
        'E.g. "United States" or "Worldwide". Says the studio is not ' +
        'restricted to the city above - useful precisely because the city is ' +
        'stated, which on its own reads as local-only.',
    }),

    // --- Homepage ----------------------------------------------------------
    imageSpec({
      name: 'heroBackground',
      title: 'Hero background - behind the big RUMEAU DESIGN COMPANY type',
      group: 'homepage',
      description:
        'Full-bleed, with a navy wash over it. Heaviest file on the site by a ' +
        'wide margin at the moment - if this is animated, keep an eye on its ' +
        'size, because a pass-through image ships whole to every phone.',
    }),
    /*
      The homepage work grid.

      A miniature of the Portfolio grid, sitting high on the homepage so a
      visitor sees actual work before the bio - without pushing the contact
      button below the fold, which was the whole point of the original layout.

      Curated by hand rather than automatic. "Most recent" is a decent default
      and a poor showcase: it puts whatever was uploaded last in front of a
      client instead of whatever is strongest. So this is a picker, and the
      recency fallback only runs while it is empty, so the grid is never blank.

      Tiles marked "Hero tile" span two columns here exactly as they do on the
      Portfolio page - same field, same meaning, so nothing has to be set twice.
    */
    defineField({
      name: 'featuredWork',
      title: 'Work grid - which tiles, in which order',
      type: 'array',
      group: 'homepage',
      description:
        'Currently EMPTY, so the homepage is falling back to most-recently-' +
        'added work. Pick tiles here and it shows exactly these, in this order. ' +
        'Mark a tile "Hero Tile" on the tile itself to make it span two columns.',
      of: [{type: 'reference', to: [{type: 'caseStudy'}]}],
      validation: (Rule) =>
        Rule.max(12).warning(
          'More than 12 turns the homepage peek into a second portfolio page. ' +
            'The Portfolio page is one click away.',
        ),
    }),
    defineField({
      name: 'featuredWorkHeading',
      title: 'Work grid - small label above it',
      type: 'string',
      group: 'homepage',
      description: 'Defaults to "Selected work".',
    }),
    defineField({
      name: 'bioText',
      title: 'Bio - the big navy sentence mid-page',
      type: 'text',
      rows: 3,
      group: 'homepage',
    }),
    defineField({
      name: 'clientLogos',
      title: 'Client logo strip - the navy band',
      type: 'array',
      group: 'homepage',
      description: 'Logos shown in the dark navy strip on the homepage.',
      of: [
        {
          type: 'object',
          fields: [
            imageSpec({name: 'logo'}),
            /*
              A warning, not a requirement. Three of the five logos currently
              have no alt, and because the logo is the link's only content that
              makes them links a screen reader announces as "link" and nothing
              else. Requiring it would block saving a half-finished entry;
              warning puts it in front of you at the moment it matters.
            */
            {
              name: 'alt',
              title: "Client name - this is the link's only label",
              type: 'string',
              description:
                'Required in practice: the logo image is all this link ' +
                'contains, so without this a screen reader announces it as ' +
                '"link" with no indication of whose logo it is.',
              validation: (Rule: any) =>
                Rule.warning('Without this the logo is a link with no accessible name.'),
            },
            /*
              Relative paths allowed, and that is the point of the override.

              Sanity's url type rejects anything without a scheme, so
              "/work/dumpstat" failed validation - and a failing field disables
              the Publish button for the WHOLE document, whatever else you were
              trying to change. Chris hit exactly that: he could not publish the
              Meta Pixel ID until he emptied these, so a wrong rule here cost
              real content elsewhere.

              And the content was right. Half of these logos point at that
              client's own case study rather than at their website, which is a
              better link - it keeps the visitor on the site and shows the work.
              The field was typed as if only external URLs were ever intended.

              http and https only for the absolute case: a javascript: or data:
              URL here would be an injection straight into an href.
            */
            {
              name: 'href',
              title: 'Link (optional) - their site, or /work/their-project',
              type: 'url',
              description:
                'Either a full https:// address or an internal path starting ' +
                'with / , e.g. /work/dumpstat to link the logo to that project.',
              validation: (Rule: any) =>
                Rule.uri({allowRelative: true, scheme: ['http', 'https']}),
            },
          ],
          preview: {select: {title: 'alt', media: 'logo'}},
        },
      ],
    }),
    defineField({
      name: 'proofStats',
      title: 'Testimonial cards - the three metric cards',
      type: 'array',
      group: 'homepage',
      description:
        'Each card is one sentence split in two so the opening can be bold, ' +
        'plus who said it and a link to the project.',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'stat', title: 'Bold opening, e.g. "22% Increase"', type: 'string'},
            {
              name: 'rest',
              title: 'Rest of the sentence, e.g. " in yearly revenue"',
              type: 'string',
            },
            {name: 'name', title: 'Who said it', type: 'string'},
            {name: 'org', title: 'Their company', type: 'string'},
            {name: 'href', title: 'Link, e.g. /work/hug-a-mug', type: 'string'},
          ],
          preview: {select: {title: 'stat', subtitle: 'name'}},
        },
      ],
    }),
    defineField({
      name: 'checklist',
      title: 'Checkmark list - the three ticks under the cards',
      type: 'array',
      group: 'homepage',
      of: [{type: 'string'}],
    }),
    imageSpec({
      name: 'proofBandBackground',
      title: 'Texture behind the cards',
      group: 'homepage',
      options: {hotspot: false},
      description: 'Faint tiled sketch texture behind the cards and checklist.',
    }),
    /*
      Three fields that are one sentence. Named for their position in it, with
      the example spelled out, because "Prefix" and "Suffix" on their own give
      no clue what sentence they belong to.
    */
    defineField({
      name: 'closerPrefix',
      title: 'Closing line - part 1, before the bold bit',
      type: 'text',
      rows: 2,
      group: 'homepage',
      description: 'e.g. "Hand-drawn brand identity and merch design, "',
    }),
    defineField({
      name: 'closerBold',
      title: 'Closing line - part 2, the bold bit',
      type: 'string',
      group: 'homepage',
      description: 'e.g. "rooted in heritage craft"',
    }),
    defineField({
      name: 'closerSuffix',
      title: 'Closing line - part 3, after the bold bit',
      type: 'text',
      rows: 2,
      group: 'homepage',
      description: 'e.g. " and built to perform on fabric."',
    }),
    defineField({
      name: 'finalCtaHeading',
      title: 'Last CTA heading - beside your portrait',
      type: 'string',
      group: 'homepage',
      description: 'e.g. "DTC Brands and Apparel Companies:"',
    }),

    // --- Footer ------------------------------------------------------------
    defineField({
      name: 'footerText',
      title: 'Footer blurb',
      type: 'text',
      rows: 2,
      group: 'footer',
    }),
    /*
      The copyright line used to read the site name and then swap in "Rumeau
      Design LLC" if it happened to equal the string 'Rumeau Design Co' - a
      hardcoded comparison standing in for a field. Renaming the site in Studio
      would have quietly stopped the footer naming the company that holds the
      copyright, which is the one line on the page where the legal entity, not
      the brand, is the point.
    */
    defineField({
      name: 'legalName',
      title: 'Legal entity - the name on the copyright line',
      type: 'string',
      group: 'footer',
      description:
        'The registered company, which is not always the brand name. Defaults ' +
        'to "Rumeau Design LLC". Only appears in the © line at the very bottom.',
    }),
    defineField({
      name: 'socialLinks',
      title: 'Social links',
      type: 'array',
      group: 'footer',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'platform', title: 'Name shown, e.g. Instagram', type: 'string'},
            {name: 'url', type: 'url'},
          ],
          preview: {select: {title: 'platform', subtitle: 'url'}},
        },
      ],
    }),
  ],
  /*
    `navLinks` used to sit here: an array of label + url that nothing has ever
    read. The nav is a hardcoded list in src/layouts/Layout.astro, so editing
    this changed nothing - a control that looks like it works and does not,
    which is worse than its absence. Removed. If the nav should become editable
    that is a real change in Layout.astro, not a field sitting here in hope.
  */
  preview: {
    prepare() {
      return {title: 'Site Settings'}
    },
  },
})
