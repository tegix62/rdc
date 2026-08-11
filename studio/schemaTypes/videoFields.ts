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
  defineField({
    name: 'videoFile',
    title: 'Upload a video (MP4)',
    type: 'file',
    options: {accept: 'video/mp4,video/quicktime'},
    description:
      'For SHORT silent loops only - a few seconds to a minute. Uploading a ' +
      'long video here means every visitor downloads the whole thing at one ' +
      'fixed quality, so anything long or with sound belongs on YouTube or ' +
      'Vimeo instead, pasted into the URL field. Strip the audio track before ' +
      'uploading: it makes the file smaller and guarantees autoplay is never ' +
      'blocked.',
  }),
  defineField({
    name: 'videoWebm',
    title: 'Upload a WebM version (optional)',
    type: 'file',
    options: {accept: 'video/webm'},
    description:
      'Optional and worth it. WebM is usually noticeably smaller than the same ' +
      'clip as MP4, and browsers take whichever they support first - so this is ' +
      'served where possible and the MP4 covers everything else.',
  }),
  /*
    Through imageSpec like every other image, which it was not before: a poster
    is a real image download - on a YouTube facade it is the ONLY thing fetched
    until someone presses play - and it had no compression toggle, so a
    hand-prepared poster was re-encoded with no way to opt out. Img.astro reads
    that flag, so wiring it here is all it took.
  */
  defineField(imageSpec({
    name: 'videoPoster',
    title: 'Poster image — the still shown before playing',
    description:
      'The still shown before the video plays. For a YouTube link this is what ' +
      'the visitor sees and clicks, so it matters: leave it empty and the site ' +
      "falls back to YouTube's own thumbnail, which is rarely the frame you " +
      'would have chosen. Vimeo has no public thumbnail, so a poster is worth ' +
      'setting there.',
  })),
  defineField({
    name: 'videoPlayback',
    title: 'Playback',
    type: 'string',
    options: {
      list: [
        {title: 'Click to play', value: 'click'},
        {title: 'Autoplay, silent, looping', value: 'autoplay'},
      ],
      layout: 'radio',
    },
    initialValue: 'click',
    description:
      'Autoplay only works on an uploaded file, and only silently - that is a ' +
      'browser rule, not a setting here. It plays with no controls and no ' +
      'hover chrome, with one small pause button. A YouTube or Vimeo link is ' +
      'always click to play.',
  }),
]
