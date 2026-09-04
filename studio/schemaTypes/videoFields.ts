import {defineField} from 'sanity'
import {imageSpec} from './imageFields'
import {VideoUpload} from '../components/VideoUpload'

/*
  Shared fields for every place on the site that shows a video.

  There are two genuinely different kinds of video here and they want opposite
  treatment, so both are supported side by side rather than picking one:

  HOSTED ELSEWHERE (YouTube / Vimeo) - for anything long or with sound. Chris's
  forty-minute live sets and three-minute music videos belong here and nowhere
  else: those platforms transcode to a ladder of qualities, adapt to the
  viewer's connection, carry the bandwidth, and do captions. Self-hosting a
  forty-minute set would mean one fixed bitrate and a very large egress bill.

  The cost is measured and it is not small: each embed pulls roughly 640 KB of
  player JavaScript. /video was 1,199 KB with 960 KB of that being player
  script, and /style-guide with three embeds pulled 1,921 KB. So an embed now
  loads only when someone asks for it - a poster and a play button until then.

  SELF-HOSTED - for short silent loops. The Hug a Mug hero is thirty seconds
  with no audio, which is the ideal case: a small file, no player JavaScript at
  all, and it can autoplay. Browsers only permit autoplay on muted video, so a
  self-hosted autoplay clip is silent by definition - which is fine, because
  the ones that want autoplay are the ones that have nothing to hear.

  The video file URL field (Cloudflare R2, any CDN) is the primary way to add
  self-hosted video. Sanity's uploader stalls on anything but the smallest
  files, so the upload fields are kept as a fallback only.

  ---

  HOW MUCH OF THE FORM THIS IS ALLOWED TO OCCUPY

  Seven fields, and one of them - the poster - is itself an image field with its
  own alt text and its own compression panel. Counted in the Studio, a Media +
  Text block rendered twelve controls, of which seven were video, on a block
  whose usual job is an image beside a paragraph. Same shape as the problem
  imageFields.ts already solved for the compression toggle, so it gets the same
  answer: fieldsets, which are pure UI. No field is renamed and no data moves,
  so nothing in src/lib/queries.ts or the templates changes.

  Two shapes, because the blocks are two different things:

  PRIMARY (Video Embed, Video Hero, the Video item in a Media Row) - the block
  IS a video, so the source stays in the open. What folds away is presentation
  (poster, playback, mute) and the two slow Sanity uploads that are only ever a
  fallback. Three controls visible instead of nine.

  OPTIONAL (Media + Text) - the block is an image that CAN be a video. All of
  it folds into one panel, including the block's own `videoUrl`, which is why
  that field takes `fieldset: VIDEO_FIELDSET` at the call site.

  DELIBERATELY NOT CONDITIONALLY HIDDEN. The obvious version of this hides the
  panel until a video is set. That is a trap: the fields that SET a video are
  the ones inside the panel, so a block with no video yet would show no way to
  add one. `videoPosterBackground` below still hides itself, because the thing
  it depends on - the playback mode - is visible right above it.
*/

/** The one fieldset name every video field references. */
export const VIDEO_FIELDSET = 'video'

/** The fallback uploads, folded away separately in primary blocks. */
const UPLOAD_FIELDSET = 'videoUpload'

export type VideoMode = 'primary' | 'optional'

/*
  Declared here rather than at the call sites, for the same reason imageSpec()
  bundles its `delivery` fieldset: Sanity rejects a `fieldset:` reference the
  parent object does not declare, so a block that spread the fields but forgot
  the fieldsets would compile and then fail to load. They can only ever arrive
  together.
*/
export const videoFieldsets = (mode: VideoMode = 'primary') =>
  mode === 'optional'
    ? [
        {
          name: VIDEO_FIELDSET,
          title: 'Video instead of the image',
          options: {collapsible: true, collapsed: true},
          description:
            'Optional. Fill in any one of these and the video plays here in ' +
            'place of the image above.',
        },
      ]
    : [
        {
          name: VIDEO_FIELDSET,
          title: 'Poster & playback',
          options: {collapsible: true, collapsed: true},
        },
        {
          name: UPLOAD_FIELDSET,
          title: 'Upload through Sanity instead (slow)',
          options: {collapsible: true, collapsed: true},
        },
      ]

export function videoBehaviourFields(mode: VideoMode = 'primary') {
  // In an image-first block everything video belongs behind the one panel; in a
  // video-first block the source is the point and stays out in the open.
  const sourceFieldset = mode === 'optional' ? VIDEO_FIELDSET : undefined
  const uploadFieldset = mode === 'optional' ? VIDEO_FIELDSET : UPLOAD_FIELDSET

  return [
    defineField(
      imageSpec({
        name: 'videoPoster',
        title: 'Poster image - the still shown before playing',
        fieldset: VIDEO_FIELDSET,
        description:
          'The still shown before the video plays. For a YouTube link this is what ' +
          'the visitor sees and clicks. For "poster with corner play" this IS the ' +
          'visual until someone taps play, so use a strong image here.',
      }),
    ),
    defineField({
      name: 'videoPlayback',
      title: 'Playback',
      type: 'string',
      fieldset: VIDEO_FIELDSET,
      options: {
        list: [
          {title: 'Click to play (centered button)', value: 'click'},
          {title: 'Poster with corner play button', value: 'poster'},
          {title: 'Autoplay, silent, looping', value: 'autoplay'},
        ],
        layout: 'radio',
      },
      initialValue: 'click',
      description:
        '"Click to play" shows a centered play button over the poster. ' +
        '"Poster with corner play" treats the poster as the main visual with a ' +
        'small play button in the corner - good for logomarks that reveal a ' +
        'timelapse. "Autoplay" loops silently with no controls. Autoplay only ' +
        'works on uploaded files.',
    }),
    defineField({
      name: 'videoPosterBackground',
      title: 'Poster background',
      type: 'string',
      fieldset: VIDEO_FIELDSET,
      hidden: ({parent}: any) => parent?.videoPlayback !== 'poster',
      options: {
        list: [
          {title: 'None - image at its own size', value: 'none'},
          {title: 'Black, padded', value: 'black'},
          {title: 'White, padded', value: 'white'},
        ],
        layout: 'radio',
      },
      initialValue: 'none',
      description:
        'For a tightly-trimmed logomark that would look bare sitting directly ' +
        'on the page. Pads the poster inside a solid block, so a small mark ' +
        'reads as a deliberate presentation rather than a cropped asset — the ' +
        'padded block is still the whole clickable target. The video keeps the ' +
        'same background behind it once playing, as letterboxing, so nothing ' +
        'flashes when it starts. Only used by "Poster with corner play button".',
    }),
    defineField({
      name: 'videoMuted',
      title: 'Mute audio',
      type: 'boolean',
      fieldset: VIDEO_FIELDSET,
      initialValue: false,
      description: 'Strip audio from playback — good for social clips in a grid.',
    }),
    defineField({
      name: 'videoSrc',
      title: 'Video file',
      type: 'url',
      fieldset: sourceFieldset,
      components: {input: VideoUpload},
      description:
        'Drop a video or paste a URL. Uploads go straight to R2 — ' +
        'no Sanity upload stalls.',
    }),
    defineField({
      name: 'videoFile',
      title: 'Or upload via Sanity (MP4) — slow for large files',
      type: 'file',
      fieldset: uploadFieldset,
      options: {accept: '.mp4,.mov,.m4v,video/mp4,video/quicktime'},
      description:
        'Uploads through Sanity, which can stall on larger files. ' +
        'Prefer the URL field above.',
    }),
    defineField({
      name: 'videoWebm',
      title: 'Or upload via Sanity (WebM)',
      type: 'file',
      fieldset: uploadFieldset,
      options: {accept: '.webm,video/webm'},
      description:
        'Same clip as WebM — usually smaller than MP4. Also uploads ' +
        'through Sanity. Prefer the URL field above.',
    }),
  ]
}
