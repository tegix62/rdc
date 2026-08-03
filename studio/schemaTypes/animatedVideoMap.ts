import {defineField, defineType} from 'sanity'

/*
  Maps an animated image asset to video versions of itself.

  Animated GIFs (and animated WebP) can't be usefully re-encoded by the image
  CDN, so they ship as uploaded - which on this site means one 10 MB file on
  the homepage. Video codecs handle exactly this job far better: the same
  animation as h264 is typically an order of magnitude smaller.

  Sanity has no video transcoding, so `scripts/convert-animations.mjs` does the
  conversion with ffmpeg in CI and records the results here. One document for
  the whole dataset rather than a field on every image, because the mapping is
  a property of the *asset* - the same animation reused on three pages needs
  converting once, and re-ordering content must not lose the link.

  Generated. Editing it by hand is pointless; re-run the conversion instead.
*/
export default defineType({
  name: 'animatedVideoMap',
  title: 'Animated image → video (generated)',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'entries',
      title: 'Conversions',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'assetId',
              title: 'Source image asset id',
              type: 'string',
              description: 'The animated image this replaces.',
            },
            {name: 'mp4', title: 'h264 / MP4', type: 'file'},
            {name: 'webm', title: 'VP9 / WebM', type: 'file'},
            {name: 'width', type: 'number'},
            {name: 'height', type: 'number'},
            {
              name: 'sourceBytes',
              title: 'Original size (bytes)',
              type: 'number',
              description: 'Kept so the conversion can report what it saved.',
            },
            {name: 'mp4Bytes', title: 'MP4 size (bytes)', type: 'number'},
          ],
          preview: {
            select: {title: 'assetId', subtitle: 'mp4Bytes'},
          },
        },
      ],
    }),
    defineField({
      name: 'generatedAt',
      title: 'Last run',
      type: 'datetime',
    }),
  ],
  preview: {
    prepare: () => ({title: 'Animated image → video map (generated)'}),
  },
})
