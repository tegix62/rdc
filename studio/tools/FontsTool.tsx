/*
  The site's licensed fonts: drop a font file in, and the next PREVIEW build
  serves it from the site's own address (scripts/fetch-fonts.mjs). Preview
  only for now - Chris, of the type trial: "just make sure it's preview
  only"; the live build fetches none of them.

  WHY THIS EXISTS

  The site's code lives in a public GitHub repository, so a font committed
  there could be downloaded by anyone, which a webfont licence does not
  allow. Chris has a web licence for Friend (Simon Walker), first tried on
  the preview homepage. Uploaded here instead, the file is a Sanity asset
  marked label "site-font" and never touches the repository: the build
  fetches every such asset into public/fonts/licensed/, which git ignores.

  No field on any document - a font is not a property of a page - and not
  one font's tool: any licensed font the site needs goes in the same way.

  Runs as the person signed in to Studio - no token, nothing through GitHub.
*/
import {useCallback, useEffect, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'

type Font = {_id: string; originalFilename?: string; size?: number; _createdAt?: string}

const LABEL = 'site-font'
const FONTS = `*[_type == "sanity.fileAsset" && label == "${LABEL}"]{_id, originalFilename, size, _createdAt} | order(originalFilename asc)`
const IS_FONT = /\.(otf|ttf|woff2?)$/i

function FontsTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const [fonts, setFonts] = useState<Font[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => client.fetch<Font[]>(FONTS).then(setFonts), [client])
  useEffect(() => {
    load()
  }, [load])

  const send = async (files: FileList | null) => {
    if (!files) return
    const list = Array.from(files).filter((f) => IS_FONT.test(f.name))
    if (!list.length) {
      setNote('Font files only: .otf, .ttf, .woff or .woff2.')
      return
    }
    setBusy(true)
    setNote('')
    try {
      for (const f of list) await client.assets.upload('file', f, {filename: f.name, label: LABEL})
      setNote(`${list.length} sent. The preview site picks ${list.length === 1 ? 'it' : 'them'} up on its next build.`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
    await load()
    setBusy(false)
  }

  return (
    <Box padding={4} style={{maxWidth: 720}}>
      <Stack space={5}>
        <Stack space={3}>
          <Text size={3} weight="semibold">
            Fonts
          </Text>
          <Text size={1} muted>
            Licensed fonts for the website, kept out of its public code. For now only the preview site uses them,
            after its next build; the live site is unaffected.
          </Text>
        </Stack>

        <Card
          border
          radius={2}
          padding={4}
          tone="transparent"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (!busy) send(e.dataTransfer.files)
          }}
        >
          <Stack space={3}>
            <Text size={1} align="center">
              Drop font files here, or
            </Text>
            <Flex justify="center">
              <label>
                <input
                  type="file"
                  accept=".otf,.ttf,.woff,.woff2"
                  multiple
                  style={{display: 'none'}}
                  disabled={busy}
                  onChange={(e) => {
                    send(e.currentTarget.files)
                    e.currentTarget.value = ''
                  }}
                />
                <Button as="span" mode="ghost" text={busy ? 'Sending...' : 'Choose files'} disabled={busy} />
              </label>
            </Flex>
            {note && (
              <Text size={1} align="center" muted>
                {note}
              </Text>
            )}
          </Stack>
        </Card>

        <Stack space={2}>
          <Text size={1} weight="semibold">
            On the site
          </Text>
          {fonts.length === 0 ? (
            <Text size={1} muted>
              None yet.
            </Text>
          ) : (
            fonts.map((f) => (
              <Flex key={f._id} align="center" gap={3}>
                <Text size={1}>{f.originalFilename ?? f._id}</Text>
                {f.size ? <Badge>{Math.round(f.size / 1024)} KB</Badge> : null}
              </Flex>
            ))
          )}
        </Stack>
      </Stack>
    </Box>
  )
}

export const fontsTool = {
  name: 'fonts',
  title: 'Fonts',
  component: FontsTool,
}
