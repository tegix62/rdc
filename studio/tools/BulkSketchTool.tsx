/*
  Many sketches at once: pick what they are sketches of, drop the files in,
  and each becomes a sketch of its own.

  WHY THIS EXISTS

  Chris: "Can I batch upload?" A sketch is a piece filed under the Sketch
  category, with Parent Brand saying what it is a sketch of (see the
  Category field in schemaTypes/caseStudy.ts). Studio makes one document at
  a time, and dragging several pictures into a field only uploads files -
  it makes no sketches. With a folder of scans that is an evening of
  clicking.

  So: one parent for the batch (a case study, a shirt, or a piece that is
  neither, like the Red Kettle collage - or none), an optional year, the
  files, and a title for each, started from its filename and editable
  before anything is sent. Each file is uploaded and its sketch created and
  published straight away; sketches are kept off the site (NOT_SKETCH in
  the site's queries), so publishing shows nothing to anyone yet.

  ONE AT A TIME, on purpose, as the alt-text tool does: if the connection
  drops at file 30 of 40, the first 29 are done and marked done, and the
  rest can simply be sent again.

  Runs as the person signed in to Studio - no token, nothing through GitHub.
*/
import {useCallback, useEffect, useMemo, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Stack, Text, TextInput} from '@sanity/ui'
import {useClient} from 'sanity'

type Parent = {_id: string; title?: string; pageType?: string; category?: string}
type Item = {file: File; title: string; state: 'waiting' | 'sending' | 'done' | 'error'; note?: string}

const PARENTS = `*[_type == "caseStudy" && !(_id in path("drafts.**")) && !(category == "Sketch")]{
  _id, title, pageType, category
} | order(pageType asc, title asc)`

// "hug-a-mug_mug-sketch_03.jpg" -> "hug a mug mug sketch 03": somewhere to start.
const fromName = (name: string) =>
  decodeURIComponent(name)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function BulkSketchTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const [parents, setParents] = useState<Parent[]>([])
  const [search, setSearch] = useState('')
  const [parent, setParent] = useState<Parent | null>(null)
  const [year, setYear] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    client.fetch<Parent[]>(PARENTS).then(setParents)
  }, [client])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (q ? parents.filter((p) => (p.title ?? '').toLowerCase().includes(q)) : parents).slice(0, 40)
  }, [parents, search])

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      const prefix = parent?.title ? `${parent.title} - sketch - ` : ''
      const next = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .map((file) => ({file, title: `${prefix}${fromName(file.name)}`, state: 'waiting' as const}))
      setItems((was) => [...was, ...next])
    },
    [parent],
  )

  const setTitle = (k: number, title: string) => setItems((was) => was.map((it, i) => (i === k ? {...it, title} : it)))
  const mark = (k: number, state: Item['state'], note?: string) =>
    setItems((was) => was.map((it, i) => (i === k ? {...it, state, note} : it)))

  const yearNumber = /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : undefined
  const yearBad = year.trim() !== '' && yearNumber === undefined

  const send = async () => {
    setBusy(true)
    for (let k = 0; k < items.length; k++) {
      const it = items[k]
      if (it.state === 'done') continue
      mark(k, 'sending')
      try {
        const asset = await client.assets.upload('image', it.file, {filename: it.file.name})
        await client.create({
          _type: 'caseStudy',
          pageType: 'Grid Item',
          category: 'Sketch',
          title: it.title.trim() || fromName(it.file.name),
          thumbnail: {_type: 'image', asset: {_type: 'reference', _ref: asset._id}},
          ...(parent ? {parentBrand: {_type: 'reference', _ref: parent._id}} : {}),
          ...(yearNumber ? {year: yearNumber} : {}),
        })
        mark(k, 'done')
      } catch (e) {
        mark(k, 'error', e instanceof Error ? e.message : String(e))
      }
    }
    setBusy(false)
  }

  const waiting = items.filter((it) => it.state !== 'done').length
  const done = items.length - waiting

  return (
    <Box padding={4} style={{maxWidth: 820}}>
      <Stack space={5}>
        <Stack space={3}>
          <Text size={3} weight="semibold">
            Bulk sketches
          </Text>
          <Text size={1} muted>
            Pick what these are sketches of, drop the files in, check the titles, then send. Each file becomes a
            sketch of its own, kept off the site for now.
          </Text>
        </Stack>

        <Stack space={3}>
          <Text size={1} weight="semibold">
            1. Sketches of
          </Text>
          {parent ? (
            <Flex align="center" gap={3}>
              <Badge tone="primary">{parent.title}</Badge>
              <Text size={1} muted>
                {parent.pageType}
                {parent.category ? ` - ${parent.category}` : ''}
              </Text>
              <Button mode="bleed" text="Change" onClick={() => setParent(null)} disabled={busy} />
            </Flex>
          ) : (
            <Stack space={2}>
              <TextInput placeholder="Search projects and pieces" value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
              <Card border radius={2} style={{maxHeight: 260, overflow: 'auto'}}>
                <Stack>
                  {shown.map((p) => (
                    <Button key={p._id} mode="bleed" justify="flex-start" onClick={() => setParent(p)}>
                      <Flex gap={2} align="center">
                        <Text size={1}>{p.title ?? p._id}</Text>
                        <Text size={0} muted>
                          {p.pageType}
                        </Text>
                      </Flex>
                    </Button>
                  ))}
                </Stack>
              </Card>
              <Text size={0} muted>
                Optional - a sketch can belong to nothing yet.
              </Text>
            </Stack>
          )}
        </Stack>

        <Stack space={2}>
          <Text size={1} weight="semibold">
            2. Year (optional)
          </Text>
          <Box style={{maxWidth: 160}}>
            <TextInput value={year} placeholder="2025" onChange={(e) => setYear(e.currentTarget.value)} disabled={busy} />
          </Box>
          {yearBad && (
            <Text size={0} style={{color: 'var(--card-badge-critical-fg-color)'}}>
              Four digits, or leave it empty.
            </Text>
          )}
        </Stack>

        <Stack space={3}>
          <Text size={1} weight="semibold">
            3. The files
          </Text>
          <Card
            border
            radius={2}
            padding={4}
            tone="transparent"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (!busy) addFiles(e.dataTransfer.files)
            }}
          >
            <Stack space={3}>
              <Text size={1} align="center">
                Drop the scans here, or
              </Text>
              <Flex justify="center">
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{display: 'none'}}
                    disabled={busy}
                    onChange={(e) => {
                      addFiles(e.currentTarget.files)
                      e.currentTarget.value = ''
                    }}
                  />
                  <Button as="span" mode="ghost" text="Choose files" disabled={busy} />
                </label>
              </Flex>
            </Stack>
          </Card>
          {items.length > 0 && (
            <Stack space={2}>
              {items.map((it, k) => (
                <Flex key={`${it.file.name}-${k}`} align="center" gap={3}>
                  <Box flex={1}>
                    <TextInput value={it.title} onChange={(e) => setTitle(k, e.currentTarget.value)} disabled={busy || it.state === 'done'} />
                  </Box>
                  <Badge tone={it.state === 'done' ? 'positive' : it.state === 'error' ? 'critical' : 'default'}>
                    {it.state === 'waiting' ? 'ready' : it.state}
                  </Badge>
                  {it.state !== 'done' && !busy && (
                    <Button mode="bleed" text="Remove" onClick={() => setItems((was) => was.filter((_, i) => i !== k))} />
                  )}
                </Flex>
              ))}
              {items.some((it) => it.note) && (
                <Text size={0} muted>
                  {items.filter((it) => it.note).map((it) => `${it.file.name}: ${it.note}`).join(' | ')}
                </Text>
              )}
            </Stack>
          )}
        </Stack>

        <Flex align="center" gap={3}>
          <Button
            tone="primary"
            text={busy ? 'Sending...' : `Send ${waiting} sketch${waiting === 1 ? '' : 'es'}`}
            disabled={busy || waiting === 0 || yearBad}
            onClick={send}
          />
          {done > 0 && (
            <Text size={1} muted>
              {done} done - they are in the Sketches list.
            </Text>
          )}
        </Flex>
      </Stack>
    </Box>
  )
}

export const bulkSketchTool = {
  name: 'bulk-sketches',
  title: 'Bulk sketches',
  component: BulkSketchTool,
}
