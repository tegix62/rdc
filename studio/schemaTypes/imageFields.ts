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
]
