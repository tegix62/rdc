/*
  Pick a video's poster by scrubbing the video, instead of going and
  making a still by hand.

  WHY THIS EXISTS

  Chris: "I often have to pick a thumbnail for a video, and it can be
  really time-consuming... I don't want to go onto my computer and go
  grab a still and then upload that as the thumbnail image."

  He also guessed, correctly, why his new clip shows a black rectangle:
  Video.astro sets preload="auto" when no poster is present, so the
  browser paints the first decoded frame. The default is working - it is
  just a bad default for anything that fades in from black, which is
  most film.

  WHAT THIS IS

  The ordinary image input, with a frame grabber above it. Load the
  video that is already on this document, drag to the frame you want,
  press the button: the frame is drawn to a canvas, uploaded to Sanity
  as a normal image asset, and set as the poster. It keeps hotspot and
  alt text, because it patches the `asset` reference rather than
  replacing the whole image object.

  THE ONE THING THAT CAN STOP IT

  Reading pixels out of a <video> taints the canvas unless the server
  serving that video allows it with CORS. Videos uploaded through this
  Studio go to an R2 bucket, and the CORS headers in this repo are on
  the UPLOAD endpoint (functions/api/upload-video.ts), not on the public
  bucket that serves playback. R2 sends none by default.

  So the component tries with crossOrigin="anonymous" first. If the
  video will not load that way it falls back to plain playback, which
  always works, and says plainly that capture needs a bucket setting
  rather than failing with a console error nobody sees. Sanity's own CDN
  does send the header, so a video uploaded as a Sanity file works
  either way.
*/
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Box, Button, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {set, setIfMissing, useClient, useFormValue, type ObjectInputProps} from 'sanity'

/*
  A Sanity file reference carries everything needed to build its URL:
  `file-<hash>-<ext>`. Resolving it with a query would mean a round trip
  and a loading state for something that is pure string manipulation.
*/
function fileRefToUrl(ref: string, projectId: string, dataset: string): string | null {
  const m = /^file-([a-f0-9]+)-(\w+)$/.exec(ref)
  if (!m) return null
  return `https://cdn.sanity.io/files/${projectId}/${dataset}/${m[1]}.${m[2]}`
}

export function VideoPosterPicker(props: ObjectInputProps) {
  const {onChange, readOnly, path} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const {projectId, dataset} = client.config()

  /*
    The sibling fields, found RELATIVE to this one.

    useFormValue takes an absolute path, and these video fields live on a
    document root in some places and inside a section object in others -
    so a hard-coded ['videoSrc'] would work on the Video page and
    silently find nothing inside a videoSection. The parent path is this
    field's own path with the last segment removed.
  */
  const parentPath = useMemo(() => path.slice(0, -1), [path])
  const videoSrc = useFormValue([...parentPath, 'videoSrc']) as string | undefined
  const videoFile = useFormValue([...parentPath, 'videoFile']) as
    | {asset?: {_ref?: string}}
    | undefined

  const src = useMemo(() => {
    if (videoSrc && /^https?:\/\//i.test(videoSrc)) return videoSrc
    const ref = videoFile?.asset?._ref
    return ref && projectId && dataset ? fileRefToUrl(ref, projectId, dataset) : null
  }, [videoSrc, videoFile, projectId, dataset])

  /*
    A YouTube or Vimeo link is not a video file. Offering a scrubber for
    one gives a black box and a "could not be loaded" message for a
    perfectly healthy embed, which is the panel accusing the content of
    a fault it does not have.
  */
  const isEmbed = Boolean(src && /youtu\.?be|youtube\.com|vimeo\.com/i.test(src))

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(0)
  const [at, setAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // Starts optimistic: anonymous first, plain playback only if that fails.
  const [cors, setCors] = useState(true)
  const [blocked, setBlocked] = useState(false)

  const onLoaded = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration || 0)
    /*
      Open on a frame worth looking at, not on frame zero. A tenth of the
      way in clears the fade-up that made this whole thing necessary,
      and two seconds is plenty for a long clip.
    */
    const start = Math.min(2, (v.duration || 0) * 0.1)
    v.currentTime = start
    setAt(start)
  }, [])

  /*
    THE FIRST FAILURE IS NOT EVIDENCE OF CORS.

    This used to assume it was: one error, blame the bucket, retry
    without the attribute. When the retry ALSO failed it added a second
    message, so the panel showed "this host does not allow frames to be
    read" and "that video could not be loaded" together - two different
    diagnoses of one fault, one of them invented.

    If the plain retry fails too, CORS was never the problem: a browser
    that cannot load a video at all is not being refused pixel access,
    it is being refused the video. So the CORS claim is withdrawn when
    that happens, and the URL is shown instead - which is the thing
    either of us would actually need to see.
  */
  const onError = useCallback(() => {
    if (cors) {
      // Retry without the attribute: playback may work, capture will not.
      setCors(false)
      setBlocked(true)
      setNote(null)
      return
    }
    setBlocked(false)
    setNote('That video could not be loaded at all, so this is not a CORS problem.')
  }, [cors])

  const grab = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    setBusy(true)
    setNote(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2D context')
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.92),
      )
      if (!blob) throw new Error('Could not read that frame')
      const asset = await client.assets.upload('image', blob, {
        filename: `poster-${Math.round(at * 1000)}ms.jpg`,
      })
      /*
        Patch the asset only. Replacing the whole object would throw away
        the alt text and hotspot someone may already have set, which is
        the kind of helpfulness that loses work.
      */
      onChange([
        setIfMissing({_type: 'image'}),
        set({_type: 'reference', _ref: asset._id}, ['asset']),
      ])
      setNote('Poster set from this frame.')
    } catch (err: any) {
      const security = err?.name === 'SecurityError' || /tainted|cross-origin/i.test(String(err))
      setNote(
        security
          ? 'This video’s host does not allow frames to be read. Add a CORS rule ' +
              'for this Studio’s address on the R2 bucket, or re-upload the clip and ' +
              'grab the frame then.'
          : `Could not grab that frame: ${String(err?.message ?? err)}`,
      )
    } finally {
      setBusy(false)
    }
  }, [at, client, onChange])

  /*
    iOS IGNORES preload, SO ASK FOR THE METADATA EXPLICITLY.

    Chris, on a phone: the slider does not move and the duration reads
    "?s". On iOS Safari preload="auto" is treated as "none" - the
    browser will not spend a visitor's data on a video they have not
    asked for - so loadedmetadata never fires, duration stays 0 and the
    range input is disabled because it has no maximum to scrub to.

    An explicit load() is the documented way to override that, and the
    panel only exists after a tap, so it is not fetching anything
    uninvited.
  */
  useEffect(() => {
    if (open && videoRef.current) videoRef.current.load()
  }, [open, cors])

  const scrub = useCallback((t: number) => {
    setAt(t)
    if (videoRef.current) videoRef.current.currentTime = t
  }, [])

  return (
    <Stack space={3}>
      {src && isEmbed && !readOnly && (
        <Card padding={3} radius={2} shadow={1} tone="caution">
          <Text size={1}>
            This is a {/youtu/i.test(src) ? 'YouTube' : 'Vimeo'} link, so its frames belong to
            them and cannot be read here. The poster comes from their thumbnail unless you
            upload one below to override it.
          </Text>
        </Card>
      )}

      {src && !isEmbed && !readOnly && (
        <Card padding={3} radius={2} shadow={1} tone="transparent">
          <Stack space={3}>
            <Flex align="center" justify="space-between" gap={2}>
              <Text size={1} weight="semibold">
                Grab the poster from the video
              </Text>
              <Button
                mode="ghost"
                fontSize={1}
                padding={2}
                text={open ? 'Hide' : 'Open'}
                onClick={() => setOpen((o) => !o)}
              />
            </Flex>

            {open && (
              <Stack space={3}>
                {/*
                  The URL, always. "Could not be loaded" is unactionable
                  without it - it could be a YouTube link in the wrong
                  field, a stale path, or a host that is simply down, and
                  those look identical from the outside.
                */}
                <Text size={0} muted textOverflow="ellipsis">
                  {src}
                </Text>
                <video
                  ref={videoRef}
                  src={src}
                  // `key` so React rebuilds the element when the CORS mode
                  // changes - setting crossOrigin on a live element does
                  // nothing until the source is loaded again.
                  key={cors ? 'anon' : 'plain'}
                  crossOrigin={cors ? 'anonymous' : undefined}
                  preload="auto"
                  muted
                  playsInline
                  onLoadedMetadata={onLoaded}
                  onError={onError}
                  style={{width: '100%', borderRadius: 3, background: '#000'}}
                />

                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 0.1)}
                  step={0.05}
                  value={at}
                  disabled={!duration}
                  onChange={(e) => scrub(Number(e.currentTarget.value))}
                  style={{width: '100%'}}
                  aria-label="Scrub to a frame"
                />

                {!duration && !blocked && (
                  <Button
                    mode="ghost"
                    fontSize={1}
                    padding={2}
                    text="Load the video"
                    onClick={() => videoRef.current?.load()}
                  />
                )}

                <Flex align="center" justify="space-between" gap={2}>
                  <Text size={1} muted>
                    {at.toFixed(2)}s of {duration ? duration.toFixed(2) : '?'}s
                  </Text>
                  <Flex align="center" gap={2}>
                    {busy && <Spinner muted />}
                    <Button
                      tone="primary"
                      fontSize={1}
                      padding={3}
                      disabled={busy || !duration || blocked}
                      text={busy ? 'Saving…' : 'Use this frame'}
                      onClick={grab}
                    />
                  </Flex>
                </Flex>

                {blocked && (
                  <Text size={1} muted>
                    Preview only — this video’s host does not allow frames to be read.
                    Add a CORS rule for this Studio’s address on the bucket to enable
                    capture.
                  </Text>
                )}
                {note && (
                  <Text size={1} muted>
                    {note}
                  </Text>
                )}
              </Stack>
            )}
          </Stack>
        </Card>
      )}

      <Box>{props.renderDefault(props)}</Box>
    </Stack>
  )
}
