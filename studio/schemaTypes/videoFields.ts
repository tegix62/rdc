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
    title: 'Video file',
    type: 'url',
    components: {input: VideoUpload},
    description:
      'Drop a video or paste a URL. Uploads go straight to R2 — ' +
      'no Sanity upload stalls.',
  }),
  defineField({
    name: 'videoFile',
    title: 'Or upload via Sanity (MP4) — slow for large files',
    type: 'file',
    options: {accept: '.mp4,.mov,.m4v,video/mp4,video/quicktime'},
    description:
      'Uploads through Sanity, which can stall on larger files. ' +
      'Prefer the URL field above.',
  }),
  defineField({
    name: 'videoWebm',
    title: 'Or upload via Sanity (WebM)',
    type: 'file',
    options: {accept: '.webm,video/webm'},
    description:
      'Same clip as WebM — usually smaller than MP4. Also uploads ' +
      'through Sanity. Prefer the URL field above.',
  }),
]
