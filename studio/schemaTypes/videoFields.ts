import {defineField} from 'sanity'
import {imageSpec} from './imageFields'

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

  UPLOADED HERE - for short silent loops. The Hug a Mug hero is thirty seconds
  with no audio, which is the ideal case: a small file, no player JavaScript at
  all, and it can autoplay. Browsers only permit autoplay on muted video, so a
  self-hosted autoplay clip is silent by definition - which is fine, because
  the ones that want autoplay are the ones that have nothing to hear.

  Both live on the same block. Fill in a URL or upload a file; the upload wins
  if both are set, and the renderer decides everything else from there.
*/
export const videoBehaviourFields = [
  defineField(imageSpec({
    name: 'videoPoster',
    title: 'Poster image - the still shown before playing',
    description:
      'The still shown before the video plays. For a YouTube link this is what ' +
      'the visitor sees and clicks. For "poster with corner play" this IS the ' +
      'visual until someone taps play, so use a strong image here.',
  })),
  defineField({
    name: 'videoPlayback',
    title: 'Playback',
    type: 'string',
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
    name: 'videoSrc',
    title: 'Direct video link (R2 / CDN)',
    type: 'url',
    description:
      'Paste a direct link to a hosted video file (Cloudflare R2, any CDN). ' +
      'Works exactly like an upload — same playback modes, same poster. Use ' +
      'this when the Sanity uploader is slow or the file is large. If both ' +
      'this and an upload are set, the upload wins.',
  }),
  defineField({
    name: 'videoFile',
    title: 'Or upload an MP4',
    type: 'file',
    options: {accept: 'video/mp4,video/quicktime'},
    description:
      'For short silent loops. Use the direct link field above if uploads ' +
      'are slow.',
  }),
  defineField({
    name: 'videoWebm',
    title: 'Or upload a WebM (smaller)',
    type: 'file',
    options: {accept: 'video/webm'},
    description:
      'Same clip as WebM — usually smaller than MP4. Browsers pick whichever ' +
      'they support.',
  }),
]
