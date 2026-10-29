/*
  Picks: links that show the work and ask for a response.

  WHY THIS EXISTS

  Chris, on making the site work for him: a PITCH page (a handful of pieces
  and a note, for one prospect), a way for a client to "multi-select and
  throw a bunch of things that they really love into a bin and then send it
  to me", and a public VOTE - "every now and then, I could shoot the link out
  ... and just have people vote on which of these pieces they like the
  most". "Three different versions of the same apparatus" - so one thing,
  a board, made here:

  - Pitch:  the pieces chosen below and a note, for one person; they can
            send back the ones they like (or not, if "let them pick" is off).
  - Picks:  the whole All view with a tray; they send back their favourites
            with their name and a line.
  - Vote:   the same, for anyone, no name asked; the tally comes back here.

  Each board is a page of the site at /picks/<code>, made by the next build
  (preview only for now), kept out of search and the sitemap. What people
  send is stored in Cloudflare's database with the enquiries, never in
  Sanity - functions/api/picks.ts - and read back here with the board's own
  key.

  PRIVATE. A board's _id is "picks.<code>": a document whose id has a dot
  in it cannot be read from this public dataset without signing in, so a
  pitch's note and its results key are not on the open API. Made and edited
  only here, for that reason - Structure's "create" would give it a plain id.
*/
import {useCallback, useEffect, useMemo, useState} from 'react'
import {Badge, Box, Button, Card, Checkbox, Flex, Grid, Stack, Switch, Text, TextArea, TextInput} from '@sanity/ui'
import {useClient} from 'sanity'
import imageUrlBuilder from '@sanity/image-url'

// The site the boards are on. Preview only while this is a trial.
const SITE = 'https://preview.rumeau-design-co.pages.dev'

/*
  Votes: "I dig this" on the portfolio, for anyone (functions/api/votes.ts).
  Counts only - nothing about who - so the list needs no key.
*/
const VOTE_SITES = [
  {value: 'https://rumeaudesign.co', title: 'Live'},
  {value: SITE, title: 'Preview'},
]
type Votes = {total: number; voters: number; counts: {id: string; n: number}[]}

type Kind = 'pitch' | 'picks' | 'vote'
type Board = {
  _id: string
  code: string
  kind: Kind
  label?: string
  heading?: string
  note?: string
  pieces?: string[]
  collect?: boolean
  open?: boolean
  key: string
  _createdAt?: string
}
type Piece = {_id: string; title?: string; image?: any; category?: string}
type Results = {total: number; counts: {id: string; n: number}[]; entries: {at: string; name?: string; note?: string; pieces: string[]}[]}

const KINDS: {value: Kind; title: string; about: string}[] = [
  {value: 'pitch', title: 'Pitch', about: 'The pieces you choose and a note, for one person.'},
  {value: 'picks', title: 'Picks', about: 'The whole All view; they send back favourites, with their name.'},
  {value: 'vote', title: 'Vote', about: 'For anyone: they vote for favourites, no name asked.'},
]

const PIECES = `*[_type == "caseStudy" && pageType in ["Case Study", "Grid Item"] && !(category == "Sketch") && !(_id in path("drafts.**"))
  && (defined(thumbnail.asset) || defined(mainImage.asset))]{_id, title, category, "image": coalesce(thumbnail, mainImage)} | order(title asc)`
const BOARDS = `*[_type == "picksBoard" && _id in path("picks.**")] | order(_createdAt desc)`

// Not guessable: 10 characters for the address, 24 for the results key.
const random = (n: number) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
}

function PicksTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const image = useMemo(() => imageUrlBuilder(client), [client])
  const [boards, setBoards] = useState<Board[]>([])
  const [pieces, setPieces] = useState<Piece[]>([])
  const [editing, setEditing] = useState<Partial<Board> | null>(null)
  const [results, setResults] = useState<Record<string, Results | string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => client.fetch<Board[]>(BOARDS).then(setBoards), [client])
  useEffect(() => {
    load()
    client.fetch<Piece[]>(PIECES).then(setPieces)
  }, [client, load])
  const byId = useMemo(() => new Map(pieces.map((p) => [p._id, p])), [pieces])

  const save = async () => {
    if (!editing?.kind) return
    setBusy(true)
    const fields = {
      kind: editing.kind,
      label: editing.label?.trim() || undefined,
      heading: editing.heading?.trim() || undefined,
      note: editing.note?.trim() || undefined,
      pieces: editing.pieces?.length ? editing.pieces : undefined,
      collect: editing.kind === 'pitch' ? editing.collect !== false : true,
      open: editing.open !== false,
    }
    if (editing._id) await client.patch(editing._id).set(fields).commit()
    else {
      const code = random(10)
      await client.create({_id: `picks.${code}`, _type: 'picksBoard', code, key: random(24), ...fields})
    }
    setEditing(null)
    await load()
    setBusy(false)
  }

  const remove = async (b: Board) => {
    if (!window.confirm(`Delete "${b.label || b.heading || b.code}"? Its link stops working at the next build. What people sent stays in the database.`)) return
    await client.delete(b._id)
    await load()
  }

  const fetchResults = async (b: Board) => {
    setResults((r) => ({...r, [b.code]: 'Loading...'}))
    try {
      const res = await fetch(`${SITE}/api/picks?board=${b.code}&key=${b.key}`)
      const body = await res.json()
      setResults((r) => ({...r, [b.code]: res.ok ? body : body.message ?? `Could not load (${res.status})`}))
    } catch (e) {
      setResults((r) => ({...r, [b.code]: e instanceof Error ? e.message : String(e)}))
    }
  }

  const thumb = (p?: Piece, size = 64) => (p?.image?.asset ? image.image(p.image).width(size * 2).height(size * 2).fit('max').url() : undefined)
  const togglePiece = (id: string) =>
    setEditing((e) => {
      const now = new Set(e?.pieces ?? [])
      now.has(id) ? now.delete(id) : now.add(id)
      return {...e, pieces: [...now]}
    })
  const [voteSite, setVoteSite] = useState(VOTE_SITES[0].value)
  const [votes, setVotes] = useState<Votes | string | null>(null)
  const loadVotes = useCallback(async (site: string) => {
    setVotes('Loading...')
    try {
      const res = await fetch(`${site}/api/votes`)
      const body = await res.json()
      setVotes(res.ok ? body : body.message ?? `Could not load (${res.status})`)
    } catch (e) {
      setVotes(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    loadVotes(voteSite)
  }, [loadVotes, voteSite])
  const [search, setSearch] = useState('')
  const shown = pieces.filter((p) => (p.title ?? '').toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <Box padding={4} style={{maxWidth: 960}}>
      <Stack space={5}>
        <Stack space={3}>
          <Text size={3} weight="semibold">
            Picks
          </Text>
          <Text size={1} muted>
            Links that show the work and ask for a response: a pitch for one person, picks from a client, or a vote
            for anyone. Each link works after the site's next build (preview only for now); what people send comes
            back here.
          </Text>
        </Stack>

        <Card border radius={2} padding={4}>
          <Stack space={3}>
            <Flex align="center" gap={3} wrap="wrap">
              <Text size={2} weight="semibold">
                What people dig
              </Text>
              {VOTE_SITES.map((v) => (
                <Button key={v.value} fontSize={1} padding={2} mode={voteSite === v.value ? 'default' : 'ghost'} text={v.title} onClick={() => setVoteSite(v.value)} />
              ))}
              <Button fontSize={1} padding={2} mode="bleed" text="Refresh" onClick={() => loadVotes(voteSite)} />
            </Flex>
            <Text size={1} muted>
              From the Vote button on the portfolio. One vote per piece per person; who voted is not kept. Emails people leave
              afterwards go to the sign-up list, with "votes" as where they came from.
            </Text>
            {typeof votes === 'string' && <Text size={1}>{votes}</Text>}
            {votes && typeof votes !== 'string' && (
              <Stack space={2}>
                <Text size={1} muted>
                  {votes.total} vote{votes.total === 1 ? '' : 's'} from {votes.voters} {votes.voters === 1 ? 'person' : 'people'}
                </Text>
                {votes.counts.filter((c) => byId.has(c.id)).slice(0, 40).map((c, k) => {
                  const p = byId.get(c.id)
                  return (
                    <Flex key={c.id} align="center" gap={3}>
                      <Text size={1} muted style={{width: 24, textAlign: 'right'}}>
                        {k + 1}
                      </Text>
                      {thumb(p, 40) ? <img src={thumb(p, 40)} alt="" width={40} height={40} style={{objectFit: 'contain', background: '#f4f4f4'}} /> : <Box style={{width: 40, height: 40}} />}
                      <Box flex={1}>
                        <Text size={1}>{p?.title ?? c.id}</Text>
                      </Box>
                      <Badge>{c.n}</Badge>
                    </Flex>
                  )
                })}
              </Stack>
            )}
          </Stack>
        </Card>

        {!editing && (
          <Flex gap={2}>
            {KINDS.map((k) => (
              <Button key={k.value} mode="ghost" text={`New ${k.title.toLowerCase()}`} onClick={() => setEditing({kind: k.value, collect: true, open: true, pieces: []})} />
            ))}
          </Flex>
        )}

        {editing && (
          <Card border radius={2} padding={4}>
            <Stack space={4}>
              <Text size={2} weight="semibold">
                {editing._id ? 'Edit' : 'New'} {KINDS.find((k) => k.value === editing.kind)?.title.toLowerCase()}
              </Text>
              <Text size={1} muted>
                {KINDS.find((k) => k.value === editing.kind)?.about}
              </Text>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Name, for you
                </Text>
                <TextInput value={editing.label ?? ''} placeholder="Hug a Mug, after the call" onChange={(e) => setEditing({...editing, label: e.currentTarget.value})} />
              </Stack>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Heading, as they see it (optional)
                </Text>
                <TextInput value={editing.heading ?? ''} placeholder={editing.kind === 'vote' ? 'Which do you like most?' : 'For Anabel'} onChange={(e) => setEditing({...editing, heading: e.currentTarget.value})} />
              </Stack>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Note (optional)
                </Text>
                <TextArea rows={3} value={editing.note ?? ''} onChange={(e) => setEditing({...editing, note: e.currentTarget.value})} />
              </Stack>
              {editing.kind === 'pitch' && (
                <Flex align="center" gap={3}>
                  <Switch checked={editing.collect !== false} onChange={() => setEditing({...editing, collect: editing.collect === false})} />
                  <Text size={1}>Let them pick favourites and send them back</Text>
                </Flex>
              )}
              <Flex align="center" gap={3}>
                <Switch checked={editing.open !== false} onChange={() => setEditing({...editing, open: editing.open === false})} />
                <Text size={1}>Open (taking responses)</Text>
              </Flex>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Pieces {editing.kind === 'pitch' ? '' : '(optional - none chosen shows the whole All view)'} - {editing.pieces?.length ?? 0} chosen
                </Text>
                <TextInput value={search} placeholder="Search" onChange={(e) => setSearch(e.currentTarget.value)} />
                <Card border radius={2} padding={2} style={{maxHeight: 360, overflow: 'auto'}}>
                  <Grid columns={[2, 3, 4]} gap={2}>
                    {shown.map((p) => {
                      const on = editing.pieces?.includes(p._id)
                      return (
                        <Card key={p._id} padding={2} radius={2} tone={on ? 'primary' : 'default'} border style={{cursor: 'pointer'}} onClick={() => togglePiece(p._id)}>
                          <Flex gap={2} align="center">
                            <Checkbox checked={!!on} readOnly />
                            {thumb(p, 32) && <img src={thumb(p, 32)} alt="" width={32} height={32} style={{objectFit: 'contain'}} />}
                            <Text size={0}>{p.title}</Text>
                          </Flex>
                        </Card>
                      )
                    })}
                  </Grid>
                </Card>
              </Stack>
              <Flex gap={2}>
                <Button tone="primary" text={busy ? 'Saving...' : 'Save'} disabled={busy || (editing.kind === 'pitch' && !editing.pieces?.length)} onClick={save} />
                <Button mode="bleed" text="Cancel" onClick={() => setEditing(null)} />
              </Flex>
            </Stack>
          </Card>
        )}

        <Stack space={3}>
          {boards.length === 0 && (
            <Text size={1} muted>
              No links yet.
            </Text>
          )}
          {boards.map((b) => {
            const link = `${SITE}/picks/${b.code}/`
            const r = results[b.code]
            return (
              <Card key={b._id} border radius={2} padding={3}>
                <Stack space={3}>
                  <Flex align="center" gap={2} wrap="wrap">
                    <Badge tone={b.kind === 'vote' ? 'caution' : b.kind === 'pitch' ? 'primary' : 'positive'}>{b.kind}</Badge>
                    <Text size={1} weight="semibold">
                      {b.label || b.heading || b.code}
                    </Text>
                    {b.open === false && <Badge>closed</Badge>}
                    <Text size={0} muted>
                      {b.pieces?.length ? `${b.pieces.length} pieces` : 'all the work'}
                    </Text>
                  </Flex>
                  <Flex align="center" gap={2} wrap="wrap">
                    <Text size={1}>
                      <a href={link} target="_blank" rel="noreferrer">
                        {link}
                      </a>
                    </Text>
                    <Button mode="ghost" fontSize={1} padding={2} text="Copy link" onClick={() => navigator.clipboard.writeText(link)} />
                    <Button mode="ghost" fontSize={1} padding={2} text="Results" onClick={() => fetchResults(b)} />
                    <Button mode="bleed" fontSize={1} padding={2} text="Edit" onClick={() => setEditing(b)} />
                    <Button mode="bleed" tone="critical" fontSize={1} padding={2} text="Delete" onClick={() => remove(b)} />
                  </Flex>
                  {typeof r === 'string' && (
                    <Text size={1} muted>
                      {r}
                    </Text>
                  )}
                  {r && typeof r !== 'string' && (
                    <Stack space={3}>
                      <Text size={1}>
                        {r.total} {r.total === 1 ? 'response' : 'responses'}
                      </Text>
                      {r.counts.length > 0 && (
                        <Grid columns={[2, 3, 4]} gap={2}>
                          {r.counts.map((c) => (
                            <Flex key={c.id} gap={2} align="center">
                              {thumb(byId.get(c.id), 40) && <img src={thumb(byId.get(c.id), 40)} alt="" width={40} height={40} style={{objectFit: 'contain'}} />}
                              <Stack space={1}>
                                <Text size={1} weight="semibold">
                                  {c.n}
                                </Text>
                                <Text size={0} muted>
                                  {byId.get(c.id)?.title ?? c.id}
                                </Text>
                              </Stack>
                            </Flex>
                          ))}
                        </Grid>
                      )}
                      {b.kind !== 'vote' &&
                        r.entries.map((e, k) => (
                          <Card key={k} padding={2} radius={2} tone="transparent">
                            <Stack space={2}>
                              <Text size={1} weight="semibold">
                                {e.name || 'No name'} <span style={{fontWeight: 400, opacity: 0.6}}>- {new Date(e.at).toLocaleString()}</span>
                              </Text>
                              {e.note && <Text size={1}>{e.note}</Text>}
                              <Text size={0} muted>
                                {e.pieces.map((id) => byId.get(id)?.title ?? id).join(', ')}
                              </Text>
                            </Stack>
                          </Card>
                        ))}
                    </Stack>
                  )}
                </Stack>
              </Card>
            )
          })}
        </Stack>
      </Stack>
    </Box>
  )
}

export const picksTool = {
  name: 'picks',
  title: 'Picks',
  component: PicksTool,
}
