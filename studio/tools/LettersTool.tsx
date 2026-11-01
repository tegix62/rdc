/*
  LETTERS - cut letters out of Chris's real work, for "type your name in my
  letters" (preview, /next/letters/name). Chris: "We can try number one ...
  we'll roll it back if we need to." And: "it would probably require me to
  cut stuff out though, right?" - so the cutting is the tool's job:

    1. Pick a project, then one of its pictures.
    2. Every separate shape in it is outlined (letters/detect.ts).
    3. Click a shape and press the key it is. The next shape is picked for
       you, so a word can be typed straight along the scan. Space skips one.
    4. Joined-up letters don't split: hold Shift and drag a box round one.
       Delete takes a cut letter off again.

  Each letter is a Letter document (schemaTypes/letterCut.ts): the scan
  itself with a crop, published straight away - the page is preview only.
  Runs as the person signed in to Studio, like the other tools.
*/
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Stack, Text, TextInput} from '@sanity/ui'
import {useClient} from 'sanity'
import {findShapes, toCrop, toGrey, type Box as Shape} from './letters/detect'

type Project = {_id: string; title?: string; pageType?: string; category?: string}
type Cut = {_id: string; char: string; box: Shape}

const PROJECTS = `*[_type == "caseStudy" && !(_id in path("drafts.**"))]{_id, title, pageType, category} | order(title asc)`
const WORK = 1400

// image-<hash>-<w>x<h>-<ext> -> its address on the CDN
function assetUrl(ref: string, projectId: string, dataset: string, query = '') {
  const m = /^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/.exec(ref)
  return m ? `https://cdn.sanity.io/images/${projectId}/${dataset}/${m[1]}-${m[2]}.${m[3]}${query}` : ''
}

// Every picture a document uses, wherever in it.
function imageRefs(doc: unknown): string[] {
  const found = new Set<string>()
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === '_ref' && typeof x === 'string' && x.startsWith('image-') && !x.endsWith('-gif')) found.add(x)
        else walk(x)
      }
    }
  }
  walk(doc)
  return [...found]
}

const overlap = (a: Shape, b: Shape) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  return (w * h) / Math.min(a.w * a.h, b.w * b.h)
}

function LettersTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const {projectId = '', dataset = ''} = client.config()
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [project, setProject] = useState<Project | null>(null)
  const [refs, setRefs] = useState<string[]>([])
  const [ref, setRef] = useState<string | null>(null)
  const [size, setSize] = useState<{w: number; h: number} | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [cuts, setCuts] = useState<Cut[]>([])
  const [picked, setPicked] = useState<{shape?: number; cut?: string; drawn?: Shape} | null>(null)
  const [ink, setInk] = useState<'auto' | 'dark' | 'light'>('auto')
  const [join, setJoin] = useState(1)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const grey = useRef<Uint8Array | null>(null)
  const svg = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{x: number; y: number} | null>(null)
  const [drawing, setDrawing] = useState<Shape | null>(null)

  useEffect(() => {
    client.fetch<Project[]>(PROJECTS).then(setProjects)
  }, [client])

  const recount = useCallback(() => {
    client.fetch<{char: string}[]>(`*[_type == "letterCut"]{char}`).then((all) => {
      const c: Record<string, number> = {}
      for (const {char} of all) if (char) c[char.toUpperCase()] = (c[char.toUpperCase()] ?? 0) + 1
      setCounts(c)
    })
  }, [client])
  useEffect(recount, [recount])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (q ? projects.filter((p) => (p.title ?? '').toLowerCase().includes(q)) : projects).slice(0, 40)
  }, [projects, search])

  const openProject = async (p: Project) => {
    setProject(p)
    setRef(null)
    setRefs(imageRefs(await client.getDocument(p._id)))
  }

  // Load the picture at a working size and read its pixels.
  useEffect(() => {
    if (!ref) return
    setShapes([])
    setSize(null)
    setPicked(null)
    grey.current = null
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', {willReadFrequently: true})
      if (!ctx) return
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      grey.current = toGrey(ctx.getImageData(0, 0, w, h).data, w, h)
      setSize({w, h})
    }
    img.onerror = () => setNote('That picture would not load.')
    img.src = assetUrl(ref, projectId, dataset, `?w=${WORK}&fit=max&fm=png`)
  }, [ref, projectId, dataset])

  // Find the shapes again whenever the picture or the settings change.
  useEffect(() => {
    if (!grey.current || !size) return
    setShapes(findShapes(grey.current, size.w, size.h, {ink, join}))
  }, [size, ink, join])

  // The letters already cut from this picture, as boxes on it.
  const loadCuts = useCallback(async () => {
    if (!ref || !size) return setCuts([])
    const got = await client.fetch<{_id: string; char: string; crop?: {left: number; top: number; right: number; bottom: number}}[]>(
      `*[_type == "letterCut" && image.asset._ref == $ref]{_id, char, "crop": image.crop}`,
      {ref},
    )
    setCuts(
      got.map((c) => {
        const k = c.crop ?? {left: 0, top: 0, right: 0, bottom: 0}
        return {_id: c._id, char: c.char, box: {x: k.left * size.w, y: k.top * size.h, w: (1 - k.left - k.right) * size.w, h: (1 - k.top - k.bottom) * size.h}}
      }),
    )
  }, [client, ref, size])
  useEffect(() => {
    loadCuts()
  }, [loadCuts])

  const isCut = useCallback((s: Shape) => cuts.some((c) => overlap(c.box, s) > 0.6), [cuts])
  const nextFrom = useCallback(
    (i: number) => {
      for (let k = i + 1; k < shapes.length; k++) if (!isCut(shapes[k])) return k
      return undefined
    },
    [shapes, isCut],
  )

  const cut = useCallback(
    async (char: string) => {
      if (!ref || !size || !picked) return
      const box = picked.drawn ?? (picked.shape !== undefined ? shapes[picked.shape] : undefined)
      if (!box) return
      const {crop, hotspot} = toCrop(box, size.w, size.h)
      const doc = {
        _type: 'letterCut',
        char,
        image: {_type: 'image', asset: {_type: 'reference', _ref: ref}, crop, hotspot},
        ...(project ? {from: {_type: 'reference', _ref: project._id, _weak: true}} : {}),
      }
      setPicked(picked.shape !== undefined ? {shape: nextFrom(picked.shape)} : null)
      try {
        const made = await client.create(doc)
        setCuts((was) => [...was, {_id: made._id, char, box}])
        setNote(`Cut ${char}.`)
        recount()
      } catch (e) {
        setNote(`Could not save ${char}: ${String(e).slice(0, 120)}`)
      }
    },
    [client, ref, size, picked, shapes, project, nextFrom, recount],
  )

  const uncut = useCallback(
    async (id: string) => {
      setPicked(null)
      await client.delete(id)
      setCuts((was) => was.filter((c) => c._id !== id))
      setNote('Taken off.')
      recount()
    },
    [client, recount],
  )

  // The keyboard does the cutting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!picked || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return
      if (picked.cut && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        uncut(picked.cut)
      } else if (e.key === 'Escape') {
        setPicked(null)
      } else if (e.key === ' ' && picked.shape !== undefined) {
        e.preventDefault()
        setPicked({shape: nextFrom(picked.shape)})
      } else if (e.key.length === 1 && e.key.trim() && !picked.cut) {
        e.preventDefault()
        cut(e.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked, cut, uncut, nextFrom])

  // Shift and drag: a box by hand, for letters that don't come apart.
  const at = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return {x: ((e.clientX - r.left) / r.width) * (size?.w ?? 1), y: ((e.clientY - r.top) / r.height) * (size?.h ?? 1)}
  }
  const boxOf = (a: {x: number; y: number}, b: {x: number; y: number}) => ({x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y)})

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&'.split('')
  const stroke = Math.max(1, (size?.w ?? 1000) / 500)

  return (
    <Box padding={4} style={{maxWidth: 1200, margin: '0 auto'}}>
      <Stack space={4}>
        <Stack space={2}>
          <Text size={3} weight="bold">
            Letters
          </Text>
          <Text size={1} muted>
            Pick a picture, click a shape, press its letter - the next shape is picked for you, so you can type along the scan. Space skips one. Shift-drag to box a letter by hand. Delete takes one off. They show at /next/letters/name on the preview.
          </Text>
          <Flex gap={1} wrap="wrap">
            {letters.map((l) => (
              <Badge key={l} tone={counts[l] ? 'positive' : 'default'} mode={counts[l] ? 'default' : 'outline'}>
                {l}
                {counts[l] ? ` ${counts[l]}` : ''}
              </Badge>
            ))}
          </Flex>
        </Stack>

        {!ref && (
          <Stack space={3}>
            <TextInput placeholder="Find a project" value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
            {!project && (
              <Flex gap={2} wrap="wrap">
                {shown.map((p) => (
                  <Button key={p._id} mode="ghost" text={p.title ?? p._id} onClick={() => openProject(p)} />
                ))}
              </Flex>
            )}
            {project && (
              <Stack space={3}>
                <Flex align="center" gap={2}>
                  <Text weight="semibold">{project.title}</Text>
                  <Button mode="bleed" text="Another project" onClick={() => setProject(null)} />
                </Flex>
                {refs.length === 0 && <Text muted>No pictures in this one.</Text>}
                <Flex gap={2} wrap="wrap">
                  {refs.map((r) => (
                    <Card key={r} as="button" radius={2} border padding={1} onClick={() => setRef(r)} style={{cursor: 'pointer'}}>
                      <img src={assetUrl(r, projectId, dataset, '?w=240&h=240&fit=max')} alt="" style={{display: 'block', width: 120, height: 120, objectFit: 'contain'}} />
                    </Card>
                  ))}
                </Flex>
              </Stack>
            )}
          </Stack>
        )}

        {ref && (
          <Stack space={3}>
            <Flex align="center" gap={2} wrap="wrap">
              <Button mode="bleed" text="Back to the pictures" onClick={() => setRef(null)} />
              <Text size={1} muted>
                {shapes.length} shapes, {cuts.length} cut
              </Text>
              <Box flex={1} />
              <Text size={1}>Ink</Text>
              {(['auto', 'dark', 'light'] as const).map((k) => (
                <Button key={k} mode={ink === k ? 'default' : 'ghost'} text={k} onClick={() => setInk(k)} />
              ))}
              <Text size={1}>Join {join}</Text>
              <Button mode="ghost" text="-" disabled={join <= 0} onClick={() => setJoin(join - 1)} />
              <Button mode="ghost" text="+" disabled={join >= 6} onClick={() => setJoin(join + 1)} />
            </Flex>
            {note && (
              <Text size={1} muted>
                {note}
              </Text>
            )}
            <div style={{position: 'relative', lineHeight: 0, background: '#eee'}}>
              <img src={assetUrl(ref, projectId, dataset, `?w=${WORK}&fit=max`)} alt="" style={{width: '100%', height: 'auto'}} />
              {size && (
                <svg
                  ref={svg}
                  viewBox={`0 0 ${size.w} ${size.h}`}
                  preserveAspectRatio="none"
                  style={{position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair'}}
                  onPointerDown={(e) => {
                    if (!e.shiftKey) return
                    drag.current = at(e)
                    setDrawing({...drag.current, w: 0, h: 0})
                    ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  }}
                  onPointerMove={(e) => drag.current && setDrawing(boxOf(drag.current, at(e)))}
                  onPointerUp={(e) => {
                    if (!drag.current) return
                    const b = boxOf(drag.current, at(e))
                    drag.current = null
                    setDrawing(null)
                    if (b.w > 4 && b.h > 4) setPicked({drawn: b})
                  }}
                >
                  {shapes.map((s, i) =>
                    isCut(s) ? null : (
                      <rect
                        key={`s${i}`}
                        x={s.x}
                        y={s.y}
                        width={s.w}
                        height={s.h}
                        fill={picked?.shape === i ? 'rgba(0,40,200,0.18)' : 'transparent'}
                        stroke={picked?.shape === i ? '#0028c8' : 'rgba(0,40,200,0.55)'}
                        strokeWidth={picked?.shape === i ? stroke * 2.5 : stroke}
                        onClick={(e) => !e.shiftKey && setPicked({shape: i})}
                        style={{cursor: 'pointer'}}
                      />
                    ),
                  )}
                  {cuts.map((c) => (
                    <g key={c._id} onClick={() => setPicked({cut: c._id})} style={{cursor: 'pointer'}}>
                      <rect x={c.box.x} y={c.box.y} width={c.box.w} height={c.box.h} fill={picked?.cut === c._id ? 'rgba(200,0,0,0.2)' : 'rgba(0,160,80,0.15)'} stroke={picked?.cut === c._id ? '#c00' : '#00a050'} strokeWidth={stroke * 2} />
                      <text x={c.box.x + stroke * 2} y={c.box.y + stroke * 2} dominantBaseline="hanging" fontSize={Math.max(14, size.w / 45)} fontWeight={700} fill="#00a050" stroke="#fff" strokeWidth={stroke} paintOrder="stroke">
                        {c.char}
                      </text>
                    </g>
                  ))}
                  {(drawing || picked?.drawn) && (
                    <rect {...(() => {
                      const b = drawing ?? picked!.drawn!
                      return {x: b.x, y: b.y, width: b.w, height: b.h}
                    })()} fill="rgba(0,40,200,0.18)" stroke="#0028c8" strokeWidth={stroke * 2.5} strokeDasharray={`${stroke * 6} ${stroke * 4}`} />
                  )}
                </svg>
              )}
            </div>
            <Text size={1} muted>
              {picked?.cut
                ? 'A cut letter: Delete takes it off.'
                : picked
                  ? 'Press the letter it is (Space skips, Esc lets go).'
                  : 'Click a shape to start.'}
            </Text>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

export const lettersTool = {
  name: 'letters',
  title: 'Letters',
  component: LettersTool,
}
