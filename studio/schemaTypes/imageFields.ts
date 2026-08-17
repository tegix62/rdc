import {defineField} from 'sanity'
import {InkModePreview} from '../components/InkModePreview'

/*
  Extra fields added to image fields across the site, and how much of the form
  they are allowed to occupy.

  Sanity's CDN re-encodes images on the way out (WebP at quality 80 by default
  here). That is the right call for photography - a merch shot comes down
  roughly 50x smaller with no visible difference. It is the wrong call for
  flat-colour work: on a wordmark or logo with hard edges, lossy encoding is
  both *larger* than lossless and introduces visible ringing along the edges.

  It is also wrong for any file that has already been compressed by hand.
  Re-encoding an image that was carefully prepared stacks a second lossy pass
  on top of the first, and no quality setting recovers that.

  So: tick "Serve exactly as uploaded" and the site links the original file
  straight from the CDN with no transform parameters at all. What you upload is
  what ships, byte for byte.

  ---

  WHY THIS FILE IS SHAPED THE WAY IT IS

  These three fields used to be one flat array bolted onto every image field on
  the site, which is what made Chris say the compression toggle "takes up a lot
  of the user interface". It did, and the worst offender was not the toggle: it
  was `inkMode` below it, a four-option radio that renders a live preview of the
  image under each option. That is the tallest control in the Studio, and it was
  on roughly twenty image fields.

  Two changes come out of that:

  1. Alt text stays visible. It is the one field here that is content rather
     than plumbing, and it is empty on all 75 case studies and all 5 blog posts
     - which is why every image in a case study body currently ships alt="".
     It needs more prominence, not less.

  2. Everything else goes in a collapsed fieldset. Still there, still one click
     away, no longer occupying the page when nobody is changing it.

  And `inkMode` is now opt-in per field rather than universal, because print
  mode only runs on /portfolio - see the note on `tileImageFields` below.

  A fieldset rather than a nested object on purpose: a nested object would move
  the data to `image.delivery.noRecompress`, which breaks `isPassThrough()` in
  lib/image.ts and would need a migration across ~120 images. A fieldset is
  pure UI - the stored path is unchanged.
*/

/*
  Two titles for the same fieldset, because a panel should say what is actually
  inside it. A plain image only carries the compression toggle; a tile image
  also carries the print-mode treatment. One generic label like "Options" for
  both would be the vague-naming problem this schema is trying to get away from.
*/
const deliveryFieldset = (tile: boolean) => ({
  name: 'delivery',
  title: tile ? 'Compression & print mode' : 'Compression',
  options: {collapsible: true, collapsed: true},
})

/*
  First in the list so it is the first thing you see after choosing a file,
  rather than buried under the technical toggles.

  No image field on this site had one until recently - and Sections.astro was
  reading `section.alt` on Full Image, a field that never existed, so every
  image in every case study shipped with alt="". That is a page of portfolio
  work that screen readers describe as nothing at all, and that image search
  cannot read either.

  Deliberately not required: a decorative texture or a background slab is
  better with an empty alt than with a made-up description, and forcing the
  field would just train you to type junk.
*/
const altField = defineField({
  name: 'alt',
  title: 'Alt text',
  type: 'string',
  description:
    'What this image shows, for screen readers and image search. Describe ' +
    'the work, not the file - "Hug a Mug wordmark in cream on a green mug" ' +
    'rather than "logo.png". Leave blank if the image is purely decorative.',
})

/*
  On by default, because Chris optimises his own files and would rather the CDN
  left them alone than second-guess him.

  That is a real trade and worth stating plainly rather than burying: a
  pass-through image gets no srcset, so a phone downloads the same file a
  desktop does, and no crop or hotspot can apply because cropping requires
  re-encoding. Turn it OFF on anything that needs responsive sizes or a crop -
  photography, hero tiles, anything wide and detailed.

  initialValue only affects images added from now on. The ~120 already in the
  dataset keep whatever they have.
*/
const noRecompressField = defineField({
  name: 'noRecompress',
  title: 'Serve exactly as uploaded',
  type: 'boolean',
  fieldset: 'delivery',
  /*
    Kept to two sentences: what it does, and the one reason to turn it off.

    The previous version was six clauses covering byte-for-byte delivery, format
    conversion, srcset, crops, hotspots and advice on upload sizes. All true, and
    unreadable in a sidebar - so the sentence that actually matters, that this
    switch disables cropping, was buried in the middle of it and got missed.
  */
  description:
    'On: your file ships untouched, exactly as you compressed it. ' +
    'Turn it off if this image needs a crop or phone-sized versions - both ' +
    'need re-encoding. The hotspot works either way.',
  initialValue: true,
})

const inkModeField = defineField({
  name: 'inkMode',
  title: 'Print mode treatment',
  type: 'string',
  fieldset: 'delivery',
  description:
    'How this image behaves when a visitor switches the Portfolio grid to ' +
    'one-colour print mode. Auto suits strong black-and-white work. Soft keeps ' +
    'midtones for photography and anything low-contrast, which a hard ' +
    'threshold would flatten to mush. Hard is a near-1-bit cut for line art. ' +
    'Skip leaves the image in full colour.',
  options: {
    list: [
      {title: 'Auto (default)', value: 'auto'},
      {title: 'Soft - keep midtones', value: 'soft'},
      {title: 'Hard - near 1-bit', value: 'hard'},
      {title: 'Skip - stay in colour', value: 'skip'},
    ],
    layout: 'radio',
  },
  /*
    Renders the actual image under each treatment instead of four words. Falls
    back to the radio list above when no file has been chosen yet, so the
    options list is still the source of truth and still works.
  */
  components: {input: InkModePreview},
  initialValue: 'auto',
})

/** Alt text, plus compression behind a collapsed panel. The default. */
export const imageFields = [altField, noRecompressField]

/*
  The same, plus the print-mode treatment.

  Only for images that can actually become a Portfolio tile - `thumbnail`, and
  `mainImage` because the grid falls back to it when there is no thumbnail.
  Print mode is a toggle on /portfolio and nowhere else, so the treatment can
  only ever affect a tile. Offering it on a blog image, the logo, the favicon,
  the portrait, a page background or a section block was asking a question with
  no consequence.

  It was also offered on `archiveMark`, which is the hand-drawn print version
  of a tile - asking how to auto-threshold an image that was thresholded by
  hand. That one was worse than merely useless.
*/
export const tileImageFields = [altField, noRecompressField, inkModeField]

/*
  Builds an image field with the above already wired in, so a new image field
  cannot silently miss the fieldset (which would make Sanity reject the
  `fieldset: 'delivery'` reference on its sub-fields).

  Returns a plain object rather than going through defineField, because the
  same shape is needed both as a named document field and as an `of: []` array
  member, and only the former is a "field".

    imageSpec({name: 'thumbnail', tile: true})
    imageSpec({name: 'archiveMark', title: 'Archive Mark', description: '...'})
    of: [imageSpec()]                       // array member, no name
*/
export function imageSpec({
  tile = false,
  options,
  ...rest
}: Record<string, any> = {}): Record<string, any> {
  return {
    ...rest,
    type: 'image',
    // Hotspot on by default: it is what makes a crop keep a mark or a face in
    // frame instead of cutting through the middle of it.
    options: {hotspot: true, ...options},
    fields: tile ? tileImageFields : imageFields,
    fieldsets: [deliveryFieldset(tile)],
  }
}

/*
  Deliberately NOT re-exporting the old `imageBehaviourFields` name as an alias.

  Its fields now carry `fieldset: 'delivery'`, and Sanity rejects a fieldset
  reference that the parent field does not declare. An alias would let a call
  site keep compiling while producing an invalid schema, which is the failure
  mode this whole review has been chasing. Every call site goes through
  imageSpec() so the fields and the fieldset can never arrive separately.
*/
