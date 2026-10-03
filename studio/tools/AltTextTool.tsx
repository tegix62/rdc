/*
  Every image on the site, in one list, with somewhere to type its alt text.

  WHY THIS EXISTS

  Measured on 3 October: 175 image uses across 145 distinct assets, and alt
  text on none of them. A screen reader describes this entire portfolio as
  nothing at all, and image search has nothing to read either.

  The site already resolves alt text from the ASSET as a fallback - see
  src/lib/assetText.ts - so a description written once reaches every page
  that uses the file. What was missing was a place to write 145 of them
  without opening 145 documents. Sanity's media library can edit one asset at
  a time, which is the right tool for fixing one and the wrong one for a
  backlog.

  WHY IT IS WORTH BEING HONEST ABOUT THE SAVING: writing per asset instead of
  per use saves 30 edits out of 175, about 17%. The reason to do it this way
  is not volume, it is that a picture used three times cannot end up with
  three different descriptions - and that this screen exists at all.

  ORDERED BY USES, DESCENDING. A photograph on three pages is three pages
  improved by one sentence; a one-off is one. Working down the list means
  stopping early still leaves the most-seen images described.

  `references()` does the counting in GROQ rather than walking documents in
  the browser, which also means a use nested four levels deep inside
  sections[].items[].videoPoster is counted without anyone naming that path.
  Fields are what get forgotten.
*/
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Spinner, Stack, Text, TextInput, Inline} from '@sanity/ui'
import {useClient} from 'sanity'

type Asset = {
  _id: string
  url: string
  originalFilename?: string
  altText?: string
  title?: string
  uses: number
  usedBy: string[]
}

const QUERY = `*[_type == "sanity.imageAsset" && count(*[references(^._id)]) > 0]{
  _id, url, originalFilename, altText, title,
  "uses": count(*[references(^._id)]),
  "usedBy": *[references(^._id)][0...6].title
} | order(uses desc, originalFilename asc)`

/* A filename is not a description, but it is a much better starting point
   than an empty box - "Adelante Wordmark.webp" tells you what to write. */
function readableName(a: Asset): string {
  const raw = a.originalFilename ?? a._id
  return decodeURIComponent(raw)
    .replace(/\.[a-z0-9]+$/i, '')
    // Webflow's exported filenames carry a hash prefix on nearly every file.
    .replace(/^[0-9a-f]{16,}_/i, '')
    .replace(/^[0-9a-f]{16,}_/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

function Row({asset, onSaved}: {asset: Asset; onSaved: (id: string, v: string) => void}) {
  const client = useClient({apiVersion: '2024-01-01'})
  const [value, setValue] = useState(asset.altText ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /*
    Saved on a pause rather than on every keystroke, and on blur, so a row
    left mid-sentence still persists when attention moves. One patch per
    asset; nothing here batches, because a half-applied batch across 145
    assets is far worse to recover from than 145 small writes.
  */
  const save = useCallback(
    async (next: string) => {
      setState('saving')
      try {
        const trimmed = next.trim()
        if (trimmed) await client.patch(asset._id).set({altText: trimmed}).commit()
        else await client.patch(asset._id).unset(['altText']).commit()
        setState('saved')
        onSaved(asset._id, trimmed)
      } catch {
        setState('error')
      }
    },
    [asset._id, client, onSaved],
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = (next: string) => {
    setValue(next)
    setState('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(next), 700)
  }

  return (
    <Card padding={3} radius={2} shadow={1} tone={value.trim() ? 'positive' : 'default'}>
      <Flex gap={3} align="flex-start">
        <Box style={{flex: '0 0 72px'}}>
          <img
            src={`${asset.url}?w=144&h=144&fit=crop&auto=format`}
            alt=""
            width={72}
            height={72}
            style={{display: 'block', width: 72, height: 72, objectFit: 'cover', borderRadius: 3}}
          />
        </Box>
        <Stack space={2} flex={1}>
          <Inline space={2}>
            <Text size={1} weight="semibold">
              {readableName(asset)}
            </Text>
            <Badge tone={asset.uses > 1 ? 'primary' : 'default'} fontSize={0}>
              {asset.uses} use{asset.uses === 1 ? '' : 's'}
            </Badge>
            {state === 'saving' && <Badge fontSize={0}>saving</Badge>}
            {state === 'saved' && (
              <Badge tone="positive" fontSize={0}>
                saved
              </Badge>
            )}
            {state === 'error' && (
              <Badge tone="critical" fontSize={0}>
                not saved
              </Badge>
            )}
          </Inline>
          {asset.usedBy?.filter(Boolean).length > 0 && (
            <Text size={0} muted>
              {asset.usedBy.filter(Boolean).join(' · ')}
            </Text>
          )}
          <TextInput
            value={value}
            placeholder="What this image shows - describe the work, not the file"
            onChange={(e) => onChange(e.currentTarget.value)}
            onBlur={() => {
              clearTimeout(timer.current)
              if ((asset.altText ?? '') !== value.trim()) save(value)
            }}
          />
        </Stack>
      </Flex>
    </Card>
  )
}

export function AltTextTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [filled, setFilled] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    client
      .fetch<Asset[]>(QUERY)
      .then((res) => {
        if (!live) return
        setAssets(res)
        setFilled(Object.fromEntries(res.filter((a) => a.altText).map((a) => [a._id, a.altText!])))
      })
      .catch((e) => live && setError(String(e?.message ?? e)))
    return () => {
      live = false
    }
  }, [client])

  const onSaved = useCallback((id: string, v: string) => {
    setFilled((prev) => {
      const next = {...prev}
      if (v) next[id] = v
      else delete next[id]
      return next
    })
  }, [])

  const described = Object.keys(filled).length
  const total = assets?.length ?? 0
  const uses = useMemo(() => (assets ?? []).reduce((n, a) => n + a.uses, 0), [assets])
  const usesCovered = useMemo(
    () => (assets ?? []).filter((a) => filled[a._id]).reduce((n, a) => n + a.uses, 0),
    [assets, filled],
  )

  /*
    The list is filtered on the ORIGINAL alt text, not on what has just been
    typed. Hiding a row the moment it is filled in makes the list jump under
    the cursor and loses the row being worked on, which is the one thing a
    screen like this must not do.
  */
  const shown = useMemo(
    () => (assets ?? []).filter((a) => (onlyMissing ? !a.altText : true)),
    [assets, onlyMissing],
  )

  if (error) {
    return (
      <Box padding={4}>
        <Card padding={3} tone="critical" radius={2}>
          <Text size={1}>Could not load images: {error}</Text>
        </Card>
      </Box>
    )
  }

  if (!assets) {
    return (
      <Flex align="center" justify="center" padding={5}>
        <Spinner muted />
      </Flex>
    )
  }

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Stack space={3}>
          <Text size={3} weight="semibold">
            Alt text
          </Text>
          <Text size={1} muted>
            Written once per image, not once per place it appears - a description saved here
            reaches every page using that file. Anything typed directly on an image field still
            wins over this.
          </Text>
          <Inline space={3}>
            <Text size={1}>
              <strong>{described}</strong> of {total} images described
            </Text>
            <Text size={1} muted>
              covering {usesCovered} of {uses} places they appear
            </Text>
            <Button
              fontSize={1}
              padding={2}
              mode="ghost"
              text={onlyMissing ? 'Show all' : 'Show only missing'}
              onClick={() => setOnlyMissing((v) => !v)}
            />
          </Inline>
          <Text size={0} muted>
            Most-used images first, so stopping part way still describes the ones seen most.
            Saves on a pause, and when you click away.
          </Text>
        </Stack>

        {shown.length === 0 ? (
          <Card padding={4} radius={2} tone="positive">
            <Text size={1}>Every image in use has alt text.</Text>
          </Card>
        ) : (
          <Stack space={2}>
            {shown.map((a) => (
              <Row key={a._id} asset={a} onSaved={onSaved} />
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

export const altTextTool = {
  name: 'alt-text',
  title: 'Alt text',
  component: AltTextTool,
}
