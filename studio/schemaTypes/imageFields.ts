import {defineField} from 'sanity'

/*
  Extra fields added to every image field on the site.

  Sanity's CDN re-encodes images on the way out (WebP at quality 80 by
  default here). That is the right call for photography - a merch shot comes
  down roughly 50x smaller with no visible difference. It is the wrong call
  for flat-colour work: on a wordmark or logo with hard edges, lossy encoding
  is both *larger* than lossless and introduces visible ringing along the
  edges.

  It is also wrong for any file that has already been compressed by hand.
  Re-encoding an image that was carefully prepared stacks a second lossy
  pass on top of the first, and no quality setting recovers that.

  So: tick "Serve exactly as uploaded" and the site links the original file
  straight from the CDN with no transform parameters at all. What you upload
  is what ships, byte for byte.

  Defined once and shared, so a new image field added later gets this
  automatically rather than silently missing it.
*/
export const imageBehaviourFields = [
  /*
    First in the list so it is the first thing you see after choosing a file,
    rather than buried under the technical toggles.

    No image field on this site had one until now - and Sections.astro was
    reading `section.alt` on Full Image, a field that never existed, so every
    image in every case study shipped with alt="". That is a page of portfolio
    work that screen readers describe as nothing at all, and that image search
    cannot read either.

    Deliberately not required: a decorative texture or a background slab is
    better with an empty alt than with a made-up description, and forcing the
    field would just train you to type junk.
  */
  defineField({
    name: 'alt',
    title: 'Alt text',
    type: 'string',
    description:
      'What this image shows, for screen readers and image search. Describe ' +
      'the work, not the file - "Hug a Mug wordmark in cream on a green mug" ' +
      'rather than "logo.png". Leave blank if the image is purely decorative.',
  }),
  defineField({
    name: 'noRecompress',
    title: 'Serve exactly as uploaded (no re-compression)',
    type: 'boolean',
    description:
      'For logos, wordmarks, flat-colour art, and anything you have already ' +
      'compressed yourself. The file ships byte for byte with no resizing ' +
      'and no format conversion. Two consequences worth knowing: phones ' +
      'download the same file as desktops, so upload something sensibly ' +
      'sized; and any crop or hotspot set here is ignored, because cropping ' +
      'requires re-encoding.',
    initialValue: false,
  }),
  defineField({
    name: 'inkMode',
    title: 'Print mode treatment',
    type: 'string',
    description:
      'How this image behaves when a visitor switches the site to one-colour ' +
      'print mode. Auto suits strong black-and-white work. Soft keeps midtones ' +
      'for photography and anything low-contrast, which a hard threshold would ' +
      'flatten to mush. Hard is a near-1-bit cut for line art. Skip leaves the ' +
      'image in full colour.',
    options: {
      list: [
        {title: 'Auto (default)', value: 'auto'},
        {title: 'Soft - keep midtones', value: 'soft'},
        {title: 'Hard - near 1-bit', value: 'hard'},
        {title: 'Skip - stay in colour', value: 'skip'},
      ],
      layout: 'radio',
    },
    initialValue: 'auto',
  }),
]
