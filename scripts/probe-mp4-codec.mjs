/*
  What is ACTUALLY inside an MP4, read by parsing it rather than
  scanning it.

  WHY THIS EXISTS

  Chris's clip at /v/1787172684321-4b784531.mp4 returns MediaError code
  4 - "this browser does not support that video format or codec" - and
  every check I had said the file was perfect: HTTP 206, video/mp4,
  34.5 MB, mp42, CORS allowed, and codec "H.264 / AVC - the one
  browsers all support".

  Both of those cannot be true, so one of them is wrong, and it is
  mine. check-video-cors.mjs finds the codec by scanning half a
  megabyte of the file for the four characters `avc1`, which:

    - can match by accident inside compressed video data,
    - matches `avc1` in a file whose H.264 is a VARIANT no browser
      decodes - 10-bit, or 4:2:2 chroma, both of which are ordinary
      output from an editing timeline and both of which still call
      themselves avc1,
    - says nothing about the AUDIO track, and an MP4 with PCM or AC-3
      audio is refused as a whole by most browsers however good the
      picture is.

  "H.264" is not one codec. It is a family, and the web supports a
  corner of it: 8-bit, 4:2:0, Baseline/Main/High. The profile and bit
  depth live in the avcC box and in the SPS inside it, which means
  parsing, not grepping.

  So this walks the box tree properly: top-level boxes by ranged reads
  (which also answers fast start truthfully, since finding the string
  'moov' in the first 512KB is not the same as moov being BEFORE mdat),
  then moov > trak > mdia > minf > stbl > stsd, and reports every
  track's sample entry - with profile, level, chroma and bit depth for
  H.264.

  READ-ONLY. It downloads the header and the moov atom, not the movie.

  Usage: node scripts/probe-mp4-codec.mjs <url> [url ...]
         node scripts/probe-mp4-codec.mjs --all        (every video in Sanity)
         node scripts/probe-mp4-codec.mjs --selftest
*/

const ORIGIN = 'https://rumeau-design-co.sanity.studio'

/* ------------------------------------------------------------------ */
/* box reading                                                         */

function boxesIn(buf, start, end) {
  /*
    Children of a container, as {type, start, size, body} - body being
    where the payload begins, after the 8 (or 16) byte header.
  */
  const out = []
  let p = start
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p)
    const type = buf.toString('latin1', p + 4, p + 8)
    let body = p + 8
    if (size === 1) {
      // 64-bit largesize. Node has readBigUInt64BE; these are header
      // atoms, never near 2^53, so the Number() is safe.
      if (p + 16 > end) break
      size = Number(buf.readBigUInt64BE(p + 8))
      body = p + 16
    } else if (size === 0) {
      // "to the end of the file"
      size = end - p
    }
    if (size < 8 || p + size > end) {
      // A truncated or nonsense box: stop rather than invent children.
      out.push({type, start: p, size: end - p, body, truncated: true})
      break
    }
    out.push({type, start: p, size, body})
    p += size
  }
  return out
}

function findBox(buf, start, end, type) {
  return boxesIn(buf, start, end).find((b) => b.type === type) ?? null
}

/*
  A SAMPLE ENTRY'S CHILDREN, FOUND RATHER THAN ASSUMED.

  The first version walked in at a hard-coded 78 bytes, which is where
  avcC sits if you forget that the 16-byte SampleEntry prefix already
  contains the 8-byte box header. It is 86. Sixteen real files came
  back "profile undefined" and all four self-tests still passed,
  because I had built the fixtures out of the same wrong number - a
  test written from an assumption tests the assumption, not the format.

  So the offset is a starting point, and if nothing parses from there
  the entry is searched for the fourcc with its length checked. Real
  files put pasp, colr, btrt and sometimes much stranger things in
  here, and an offset that is right for one encoder's output is not a
  fact about MP4.
*/
function childOfSampleEntry(buf, entry, type, offset) {
  const end = entry.start + entry.size
  const found = findBox(buf, entry.start + offset, end, type)
  if (found) return found
  const want = Buffer.from(type, 'latin1')
  let at = entry.start + 8
  for (;;) {
    at = buf.indexOf(want, at)
    if (at === -1 || at + 4 > end) return null
    const start = at - 4
    if (start >= entry.start) {
      const size = buf.readUInt32BE(start)
      if (size >= 8 && start + size <= end) return {type, start, size, body: start + 8}
    }
    at += 4
  }
}

/* ------------------------------------------------------------------ */
/* H.264: the profile is in avcC, the bit depth is in the SPS          */

const PROFILES = {
  66: 'Baseline',
  77: 'Main',
  88: 'Extended',
  100: 'High',
  110: 'High 10',
  122: 'High 4:2:2',
  144: 'High 4:4:4',
  244: 'High 4:4:4 Predictive',
  44: 'CAVLC 4:4:4',
}

const CHROMA = {0: 'monochrome', 1: '4:2:0', 2: '4:2:2', 3: '4:4:4'}

/*
  Enough of an SPS reader to reach chroma_format_idc and the bit
  depths, which is as far as anything here needs to go. Emulation
  prevention bytes (00 00 03) are stripped first, or a run of zeros in
  the stream shifts every field after it.
*/
function unescapeNal(bytes) {
  const out = []
  for (let i = 0; i < bytes.length; i++) {
    if (i >= 2 && bytes[i] === 3 && bytes[i - 1] === 0 && bytes[i - 2] === 0) continue
    out.push(bytes[i])
  }
  return Uint8Array.from(out)
}

function bitReader(bytes) {
  let pos = 0
  const bit = () => {
    const b = bytes[pos >> 3]
    if (b === undefined) throw new Error('ran off the end of the SPS')
    const v = (b >> (7 - (pos & 7))) & 1
    pos++
    return v
  }
  const bits = (n) => {
    let v = 0
    for (let i = 0; i < n; i++) v = (v << 1) | bit()
    return v
  }
  // Exp-Golomb: count leading zeros, then read that many bits.
  const ue = () => {
    let zeros = 0
    while (bit() === 0) {
      zeros++
      if (zeros > 31) throw new Error('malformed exp-golomb')
    }
    if (zeros === 0) return 0
    return (1 << zeros) - 1 + bits(zeros)
  }
  return {bit, bits, ue}
}

function readSps(sps) {
  const b = bitReader(unescapeNal(sps))
  b.bits(8) // NAL header
  const profile = b.bits(8)
  b.bits(8) // constraint flags + reserved
  const level = b.bits(8)
  b.ue() // seq_parameter_set_id
  let chroma = null
  let depth = null
  const HIGH = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]
  if (HIGH.includes(profile)) {
    chroma = b.ue()
    if (chroma === 3) b.bit() // separate_colour_plane_flag
    const luma = b.ue()
    const chromaDepth = b.ue()
    depth = {luma: luma + 8, chroma: chromaDepth + 8}
  } else {
    // Everything below High is 8-bit 4:2:0 by definition.
    chroma = 1
    depth = {luma: 8, chroma: 8}
  }
  return {profile, level, chroma, depth}
}

function readAvcC(buf, b) {
  const p = b.body
  const profile = buf[p + 1]
  const level = buf[p + 3]
  const numSps = buf[p + 5] & 0x1f
  let q = p + 6
  let sps = null
  for (let i = 0; i < numSps; i++) {
    const len = buf.readUInt16BE(q)
    const bytes = buf.subarray(q + 2, q + 2 + len)
    if (!sps) sps = bytes
    q += 2 + len
  }
  let fromSps = null
  if (sps && sps.length > 4) {
    try {
      fromSps = readSps(sps)
    } catch (err) {
      fromSps = {error: String(err?.message ?? err)}
    }
  }
  return {profile, level, sps: fromSps}
}

/* ------------------------------------------------------------------ */
/* the verdict                                                         */

/*
  What a browser will and will not decode. The video side is the
  interesting one: `avc1` passes a string scan whatever its profile,
  and High 10 / 4:2:2 / 4:4:4 are what an editing timeline hands you
  unless you tell it otherwise.
*/
const VIDEO_OK = new Set([66, 77, 88, 100])

const AUDIO = {
  'mp4a': ['AAC', true],
  'ac-3': ['Dolby Digital (AC-3)', false],
  'ec-3': ['Dolby Digital Plus (E-AC-3)', false],
  'Opus': ['Opus in MP4', false],
  'alac': ['Apple Lossless', false],
  'sowt': ['uncompressed PCM', false],
  'twos': ['uncompressed PCM', false],
  'lpcm': ['uncompressed PCM', false],
  'in24': ['uncompressed PCM (24-bit)', false],
  'in32': ['uncompressed PCM (32-bit)', false],
  'fl32': ['uncompressed PCM (float)', false],
  'ipcm': ['uncompressed PCM', false],
  '.mp3': ['MP3', true],
  'mp3 ': ['MP3', true],
}

const VIDEO_FOURCC = {
  'avc1': 'H.264 / AVC',
  'avc3': 'H.264 / AVC (in-band parameter sets)',
  'hvc1': 'HEVC / H.265',
  'hev1': 'HEVC / H.265',
  'dvh1': 'Dolby Vision',
  'dvhe': 'Dolby Vision',
  'av01': 'AV1',
  'vp09': 'VP9 in MP4',
  'ap4h': 'Apple ProRes 4444',
  'apch': 'Apple ProRes 422 HQ',
  'apcn': 'Apple ProRes 422',
  'apcs': 'Apple ProRes 422 LT',
  'apco': 'Apple ProRes 422 Proxy',
  'mp4v': 'MPEG-4 Part 2',
  'jpeg': 'Motion JPEG',
  'mjpa': 'Motion JPEG A',
}

function describeTrack(t) {
  const size = t.w && t.h ? `${t.w}x${t.h}, ` : ''
  if (t.kind === 'video') {
    const name = VIDEO_FOURCC[t.fourcc] ?? `unknown video codec (${t.fourcc})`
    if (t.fourcc !== 'avc1' && t.fourcc !== 'avc3') {
      return {line: `${size}${name}`, ok: false, why: 'browsers do not decode this on the open web'}
    }
    /*
      "COULD NOT READ IT" IS NOT "IT IS WRONG".

      With the avcC offset wrong, every file reported "?-bit H.264 -
      the web only decodes 8-bit": a confident verdict about a number
      the probe had failed to read. That is worse than no answer,
      because it looks like an answer. Unknown is now its own state.
    */
    if (!t.avc || t.avc.profile == null) {
      return {
        line: `${size}${name}, but its avcC configuration could not be read`,
        ok: null,
        why: 'so this says nothing either way about whether a browser will play it',
      }
    }
    const prof = PROFILES[t.avc.profile] ?? `profile ${t.avc.profile}`
    const chroma = CHROMA[t.avc.sps?.chroma] ?? '?'
    const depth = t.avc.sps?.depth?.luma ?? '?'
    const ok = VIDEO_OK.has(t.avc.profile) && depth === 8 && t.avc.sps?.chroma === 1
    const level = t.avc.level != null ? (t.avc.level / 10).toFixed(1) : '?'
    /*
      LEVEL, WHICH IS NOT THE CODEC BUT REFUSES LIKE ONE.

      A level is a promise about resolution, frame rate and bitrate.
      Phones decode H.264 in hardware, and that hardware tops out -
      iOS at 5.2, most Android around 5.1 - so a file tagged above
      that is handed back as "format not supported" however ordinary
      its profile is. Desktop browsers fall back to software and play
      it, which is exactly the shape of a bug that looks like "it
      works for me".
    */
    const warn =
      t.avc.level > 52
        ? `level ${level} is above what phone hardware decoders accept (iOS tops out at 5.2), so a phone can refuse it while a desktop plays it`
        : null
    return {
      line: `${size}${name}, ${prof} profile, level ${level}, ${chroma}, ${depth}-bit`,
      ok,
      warn,
      why: ok
        ? null
        : depth !== 8
          ? `${depth}-bit H.264 - the web only decodes 8-bit`
          : t.avc.sps?.chroma !== 1
            ? `${chroma} chroma - the web only decodes 4:2:0`
            : `the ${prof} profile is not decodable in a browser`,
    }
  }
  const [name, ok] = AUDIO[t.fourcc] ?? [`unknown audio codec (${t.fourcc})`, false]
  return {
    line: name,
    ok,
    why: ok ? null : 'most browsers refuse the whole file over an audio track they cannot decode',
  }
}

/* ------------------------------------------------------------------ */
/* moov, found honestly                                               */

async function get(url, from, to) {
  const res = await fetch(url, {headers: {Origin: ORIGIN, Range: `bytes=${from}-${to}`}})
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
  const cr = res.headers.get('content-range')
  const total = cr ? Number(cr.split('/')[1]) : null
  return {buf: Buffer.from(await res.arrayBuffer()), total, type: res.headers.get('content-type')}
}

/*
  WALK THE TOP LEVEL, DO NOT SEARCH IT.

  "Is the string 'moov' in the first 512KB" is not the question - mdat
  is compressed data and can contain those four bytes anywhere, so the
  old check could call a back-loaded file fast-started. Following each
  box's own size is exact: either moov comes before mdat or it does
  not, and we learn its offset and length for free.
*/
async function findMoov(url) {
  let offset = 0
  const order = []
  for (let i = 0; i < 64; i++) {
    const {buf} = await get(url, offset, offset + 15)
    if (buf.length < 8) break
    let size = buf.readUInt32BE(0)
    const type = buf.toString('latin1', 4, 8)
    let header = 8
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(8))
      header = 16
    }
    order.push(type)
    if (type === 'moov') return {offset, size, header, order}
    if (size < 8) break
    offset += size
  }
  return {offset: null, size: null, header: null, order}
}

async function probe(url) {
  console.log(url)
  let total = null
  let type = null
  try {
    const first = await get(url, 0, 31)
    total = first.total
    type = first.type
    const brand = first.buf.toString('latin1', 4, 12)
    if (!/ftyp/.test(brand)) {
      console.log(`  not an MP4 (first bytes: ${brand.replace(/[^\x20-\x7e]/g, '.')})`)
      console.log('')
      return false
    }
    console.log(
      `  ${type ?? '(no content-type)'}, ${total ? (total / 1024 / 1024).toFixed(1) + ' MB' : 'size unknown'}, brand ${brand.slice(4).trim()}`,
    )
  } catch (err) {
    console.log(`  could not read: ${String(err?.message ?? err)}`)
    console.log('')
    return false
  }

  const moov = await findMoov(url)
  const mdatFirst = moov.order.indexOf('mdat')
  const moovAt = moov.order.indexOf('moov')
  const fast = moovAt !== -1 && (mdatFirst === -1 || moovAt < mdatFirst)
  console.log(`  top level: ${moov.order.join(' ')}`)
  console.log(
    `  fast start: ${fast ? 'yes' : 'NO - the index is after the movie data, so nothing shows until it all downloads'}`,
  )
  if (moov.offset === null) {
    console.log('  moov is not in the first 64 boxes, so the tracks cannot be read from here.')
    console.log('')
    return false
  }
  if (moov.size > 32 * 1024 * 1024) {
    console.log(`  moov is ${(moov.size / 1024 / 1024).toFixed(1)} MB - not fetching it.`)
    console.log('')
    return false
  }

  const {buf} = await get(url, moov.offset, moov.offset + moov.size - 1)
  if (process.argv.includes('--tree')) {
    console.log(`  moov @${moov.offset} size ${moov.size}, fetched ${buf.length} bytes`)
    tree(buf, 0, buf.length)
  }
  /*
    Duration and bitrate, because a level is a claim about bitrate and
    a reader deserves to see whether the file is anywhere near it.
  */
  const outer = boxesIn(buf, 0, buf.length)
  const moovBox = outer.find((b) => b.type === 'moov')
  const mvhd = moovBox ? findBox(buf, moovBox.body, moovBox.start + moovBox.size, 'mvhd') : null
  if (mvhd) {
    const v = buf[mvhd.body]
    const timescale = v === 1 ? buf.readUInt32BE(mvhd.body + 20) : buf.readUInt32BE(mvhd.body + 12)
    const dur =
      v === 1 ? Number(buf.readBigUInt64BE(mvhd.body + 24)) : buf.readUInt32BE(mvhd.body + 16)
    const secs = timescale ? dur / timescale : 0
    if (secs > 0) {
      const mbps = total ? ((total * 8) / secs / 1_000_000).toFixed(1) : '?'
      console.log(`  ${secs.toFixed(1)}s, about ${mbps} Mbit/s`)
    }
  }

  const tracks = readTracks(buf, 0, buf.length)
  if (!tracks.length) console.log('  no tracks found in moov')
  let bad = false
  let unknown = false
  const warns = []
  for (const t of tracks) {
    const d = describeTrack(t)
    if (d.ok === false) bad = true
    if (d.ok === null) unknown = true
    if (d.warn) warns.push(d.warn)
    console.log(`  ${t.kind}: ${d.line}${d.ok === true ? '' : `  <- ${d.why}`}`)
    if (d.warn) console.log(`    note: ${d.warn}`)
  }
  console.log(
    bad
      ? '  -> a browser can refuse this file. That is MediaError code 3 or 4.'
      : unknown
        ? '  -> could not tell. Something in this file is not laid out as expected.'
        : warns.length
          ? '  -> the codec is fine, but a phone can still refuse it. See the note.'
          : '  -> every track is a format browsers decode.',
  )
  console.log('')
  return !bad && !unknown && !warns.length
}

/*
  moov > trak > mdia > {hdlr, minf > stbl > stsd > sample entries}.
  hdlr says whether the track is picture or sound, which beats guessing
  from the codec - a track with an unknown fourcc still needs naming.
*/
function readTracks(buf, start, end) {
  /*
    The buffer handed in is the moov BOX, header and all - that is what
    a ranged fetch of moov.offset..moov.offset+size returns. Reading
    children from byte zero therefore finds one box, 'moov' itself, and
    no traks: which is exactly how the first version of this reported
    nothing for four files in a row while three of the four self-tests
    still said "ok", because a file with no tracks reads as unplayable
    and three of the cases expected unplayable. Descend first.
  */
  const outer = boxesIn(buf, start, end)
  const moov = outer.find((b) => b.type === 'moov')
  const from = moov ? moov.body : start
  const to = moov ? moov.start + moov.size : end
  const out = []
  for (const trak of boxesIn(buf, from, to).filter((b) => b.type === 'trak')) {
    const mdia = findBox(buf, trak.body, trak.start + trak.size, 'mdia')
    if (!mdia) continue
    const mdiaEnd = mdia.start + mdia.size
    const hdlr = findBox(buf, mdia.body, mdiaEnd, 'hdlr')
    const handler = hdlr ? buf.toString('latin1', hdlr.body + 8, hdlr.body + 12) : ''
    const kind = handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : handler || 'other'
    const minf = findBox(buf, mdia.body, mdiaEnd, 'minf')
    if (!minf) continue
    const stbl = findBox(buf, minf.body, minf.start + minf.size, 'stbl')
    if (!stbl) continue
    const stsd = findBox(buf, stbl.body, stbl.start + stbl.size, 'stsd')
    if (!stsd) continue
    // stsd: 4 bytes version/flags, 4 bytes entry count, then entries.
    const entries = boxesIn(buf, stsd.body + 8, stsd.start + stsd.size)
    for (const e of entries) {
      const t = {kind, fourcc: e.type}
      if (kind === 'video' && e.size >= 86) {
        // width and height live in the visual sample entry itself.
        t.w = buf.readUInt16BE(e.start + 32)
        t.h = buf.readUInt16BE(e.start + 34)
      }
      if (e.type === 'avc1' || e.type === 'avc3') {
        // A visual sample entry's children begin 86 bytes in.
        const avcC = childOfSampleEntry(buf, e, 'avcC', 86)
        if (avcC) t.avc = readAvcC(buf, avcC)
      }
      out.push(t)
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* looking, when the parse disagrees with reality                      */

/*
  Sixteen of sixteen real files came back "profile undefined" from a
  parser whose self-tests all passed, which means the hand-built MP4s
  are not shaped like the real ones somewhere. Guessing where is how
  the last three bugs happened, so: print the tree, with offsets and
  sizes, and the first bytes of each video sample entry.
*/
const CONTAINERS = new Set([
  'moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex', 'moof', 'traf', 'udta', 'wave',
])

function tree(buf, start, end, depth = 0) {
  if (depth > 6) return
  for (const b of boxesIn(buf, start, end)) {
    const pad = '  '.repeat(depth + 1)
    console.log(
      `${pad}${b.type} @${b.start} size ${b.size}${b.truncated ? '  <- TRUNCATED' : ''}`,
    )
    if (CONTAINERS.has(b.type)) {
      tree(buf, b.body, b.start + b.size, depth + 1)
    } else if (b.type === 'stsd') {
      tree(buf, b.body + 8, b.start + b.size, depth + 1)
    } else if (/^(avc1|avc3|hvc1|hev1|mp4a|av01)$/.test(b.type)) {
      const head = buf.subarray(b.start, Math.min(b.start + 112, b.start + b.size))
      console.log(`${pad}  bytes: ${head.toString('hex').replace(/(.{48})/g, '$1\n' + pad + '         ')}`)
      console.log(`${pad}  ascii: ${head.toString('latin1').replace(/[^\x20-\x7e]/g, '.')}`)
    }
  }
}

/* ------------------------------------------------------------------ */
/* a check that can fail                                              */

/*
  THIS IS HERE BECAUSE THE LAST CHECK WAS GREEN AND WRONG.

  check-video-cors.mjs reported "H.264 - the one browsers all support"
  for a file the browser refuses, and nothing about that run looked
  suspicious. A parser that cannot be seen failing is the same trap one
  layer up, so: two MP4s built by hand here, one the web plays and one
  it does not, and the probe has to tell them apart.
*/
function selftest() {
  const box = (type, ...parts) => {
    const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))))
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length + 8, 0)
    head.write(type, 4, 'latin1')
    return Buffer.concat([head, body])
  }

  // ue(v) as a bit string, so the SPS is built the way it is read.
  const ue = (v) => {
    const bits = (v + 1).toString(2)
    return '0'.repeat(bits.length - 1) + bits
  }
  const sps = (profile, chroma, depth, level = 40) => {
    let s = ''
    s += '01100111' // NAL header 0x67
    s += profile.toString(2).padStart(8, '0')
    s += '00000000' // constraint flags
    s += level.toString(2).padStart(8, '0')
    s += ue(0) // sps id
    const HIGH = [100, 110, 122, 244]
    if (HIGH.includes(profile)) {
      s += ue(chroma)
      if (chroma === 3) s += '0'
      s += ue(depth - 8)
      s += ue(depth - 8)
    }
    s += '0'.repeat((8 - (s.length % 8)) % 8)
    const bytes = []
    for (let i = 0; i < s.length; i += 8) bytes.push(parseInt(s.slice(i, i + 8), 2))
    return Buffer.from(bytes)
  }
  const avcCRaw = (profile, level, spsProfile, spsLevel, chroma = 1, depth = 8) => {
    const s = sps(spsProfile, chroma, depth, spsLevel)
    const len = Buffer.alloc(2)
    len.writeUInt16BE(s.length, 0)
    return box(
      'avcC',
      Buffer.from([1, profile, 0, level, 0xff, 0xe1]),
      len,
      s,
      Buffer.from([0]), // no PPS
    )
  }
  const avcC = (profile, chroma, depth) => avcCRaw(profile, 40, profile, 40, chroma, depth)
  /*
    78 bytes of visual sample entry after the 8-byte box header, which
    is what a real file looks like - checked against the hex of
    /v/1787172684321-4b784531.mp4, where avcC begins at byte 86 of the
    entry. The first version of this used 70 because the parser did,
    and so the pair agreed with each other and not with any MP4.

    `extra` puts a box in front of avcC, as most encoders do with pasp
    or colr, so the walk is tested rather than the constant.
  */
  const videoEntry = (profile, chroma, depth, extra = []) =>
    box('avc1', Buffer.alloc(78), ...extra, avcC(profile, chroma, depth))
  const audioEntry = (fourcc) => box(fourcc, Buffer.alloc(28))
  const trak = (handler, entry) =>
    box(
      'trak',
      box(
        'mdia',
        box('hdlr', Buffer.alloc(8), Buffer.from(handler, 'latin1'), Buffer.alloc(12)),
        box('minf', box('stbl', box('stsd', Buffer.alloc(8), entry))),
      ),
    )
  const moov = (...traks) => box('moov', ...traks)

  const cases = [
    {
      name: 'High 8-bit 4:2:0 + AAC',
      buf: moov(trak('vide', videoEntry(100, 1, 8)), trak('soun', audioEntry('mp4a'))),
      want: true,
      tracks: 2,
    },
    {
      name: 'High 10 10-bit 4:2:2 + AAC',
      buf: moov(trak('vide', videoEntry(110, 2, 10)), trak('soun', audioEntry('mp4a'))),
      want: false,
      tracks: 2,
    },
    {
      name: 'High 8-bit 4:2:0 + PCM audio',
      buf: moov(trak('vide', videoEntry(100, 1, 8)), trak('soun', audioEntry('sowt'))),
      want: false,
      tracks: 2,
    },
    {
      name: 'ProRes',
      buf: moov(trak('vide', box('apcn', Buffer.alloc(78)))),
      want: false,
      tracks: 1,
    },
    {
      // pasp and colr in front of avcC, which is the normal case.
      name: 'avcC behind a pasp and a colr box',
      buf: moov(
        trak(
          'vide',
          videoEntry(100, 1, 8, [
            box('pasp', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1])),
            box('colr', Buffer.from('nclx', 'latin1'), Buffer.alloc(7)),
          ]),
        ),
      ),
      want: true,
      tracks: 1,
      expect: 'High profile',
    },
    {
      /*
        The real thing: Main profile at level 6.0, read by hand out of
        the avcC of /v/1787172684321-4b784531.mp4 (01 4d 40 3c, SPS
        67 4d 40 3c). The profile is fine and a phone still refuses it,
        so the probe has to say both at once.
      */
      name: 'Main profile at level 6.0 (the clip Chris cannot play)',
      buf: moov(trak('vide', box('avc1', Buffer.alloc(78), avcCRaw(77, 60, 77, 60)))),
      want: true,
      tracks: 1,
      expect: 'Main profile, level 6.0',
      warn: true,
    },
  ]

  let failures = 0
  for (const c of cases) {
    const tracks = readTracks(c.buf, 0, c.buf.length)
    const all = tracks.map(describeTrack)
    const ok = all.length > 0 && all.every((d) => d.ok)
    /*
      The track COUNT is asserted too. "No tracks found" reads as
      unplayable, so a parser that finds nothing agrees with every case
      that expects a refusal - three green ticks for a parser that was
      not working at all.
    */
    /*
      And the TEXT, where asked. A boolean can come out right for the
      wrong reason; "Main profile, level 6.0" cannot.
    */
    const text = all.map((d) => d.line).join(' | ')
    const said = !c.expect || text.includes(c.expect)
    const warned = c.warn == null || Boolean(all.some((d) => d.warn)) === c.warn
    const pass = ok === c.want && tracks.length === c.tracks && said && warned
    if (!pass) failures++
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${c.name}`)
    for (let i = 0; i < tracks.length; i++) {
      console.log(`        ${tracks[i].kind}: ${all[i].line}${all[i].ok ? '' : `  <- ${all[i].why}`}`)
      if (all[i].warn) console.log(`          note: ${all[i].warn}`)
    }
  }
  console.log('')
  if (failures) {
    console.log(`${failures} self-test(s) failed - do not trust this probe's output.`)
    process.exit(1)
  }
  console.log('Self-tests pass: the probe separates a web-playable MP4 from one that is not.')
}

/* ------------------------------------------------------------------ */

/*
  EVERY VIDEO WE SERVE, NOT JUST THE ONE THAT COMPLAINED.

  If an export preset is what produced an unplayable file, it will not
  have produced only one. The documents are scanned whole rather than
  by schema path, because a media row keeps its clips two levels deeper
  than anywhere I would have thought to look.
*/
async function fromSanity() {
  const TOKEN = process.env.SANITY_API_TOKEN
  if (!TOKEN) {
    console.error('SANITY_API_TOKEN is required for --all, or pass URLs.')
    process.exit(2)
  }
  const query = `*[!(_id in path("drafts.**"))]`
  const res = await fetch(
    `https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(query)}`,
    {headers: {Authorization: `Bearer ${TOKEN}`}},
  )
  if (!res.ok) {
    console.error(`Sanity: ${res.status} ${res.statusText}`)
    process.exit(2)
  }
  const blob = JSON.stringify((await res.json()).result ?? [])
  const urls = []
  // .mp4 only: this probe parses MP4 boxes, and a WebM would be read
  // as "not an MP4" rather than usefully.
  for (const m of blob.matchAll(/https?:\/\/[^"'\s\\]+\.mp4/gi)) {
    if (!urls.includes(m[0])) urls.push(m[0])
  }
  return urls
}

const args = process.argv.slice(2).filter(Boolean)
if (args.includes('--selftest')) {
  selftest()
} else if (!args.length) {
  console.error('Usage: node scripts/probe-mp4-codec.mjs <url> [url ...]   (--all, --selftest)')
  process.exit(2)
} else {
  selftest()
  console.log('')
  const urls = args.includes('--all')
    ? await fromSanity()
    : args.filter((a) => /^https?:\/\//.test(a))
  if (!urls.length) {
    console.log('No MP4 URLs to probe.')
    process.exit(0)
  }
  console.log(`${urls.length} MP4(s)\n`)
  let bad = 0
  for (const url of urls) {
    const ok = await probe(url)
    if (!ok) bad++
  }
  if (bad) {
    console.log(`${bad} of ${urls.length} file(s) marked above.`)
    process.exit(1)
  }
}
