/*
  FINDING THE SHAPES IN A SCAN - for the Letters tool (../LettersTool.tsx).

  Chris's lettering is mostly ink on paper, so a letter is a patch of ink not
  touching the next one. Find the ink (a threshold picked from the picture
  itself), optionally thicken it a little so a broken scan or the dot of an i
  joins its letter, then gather the touching ink into shapes and keep the
  ones that are letter-sized. Script and joined-up lettering will not split;
  those are boxed by hand in the tool.

  Pure: pixels in, boxes out, so it can be tested without a browser
  (scripts/test-letters-detect.mjs).
*/

export type Box = {x: number; y: number; w: number; h: number}

export type DetectOptions = {
  /** 'auto' picks whichever of dark or light covers less of the picture. */
  ink?: 'dark' | 'light' | 'auto'
  /** Pixels of thickening before shapes are gathered: joins broken strokes. */
  join?: number
}

/** Otsu's threshold over a 256-bin histogram of grey values. */
export function otsu(grey: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < grey.length; i++) hist[grey[i]]++
  const total = grey.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let best = 0
  let at = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      at = t
    }
  }
  return at
}

/** RGBA pixels to grey, transparent counted as paper (white). */
export function toGrey(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const grey = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < grey.length; i++, p += 4) {
    const a = rgba[p + 3] / 255
    const g = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
    grey[i] = Math.round(g * a + 255 * (1 - a))
  }
  return grey
}

/** Square thickening of a 0/1 mask by r pixels (separable: rows, then columns). */
function thicken(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  if (r <= 0) return mask
  const rows = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    let run = -1
    // distance to the last ink seen going right, then going left
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) run = x
      if (run >= 0 && x - run <= r) rows[y * width + x] = 1
    }
    run = -1
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x]) run = x
      if (run >= 0 && run - x <= r) rows[y * width + x] = 1
    }
  }
  const out = new Uint8Array(mask.length)
  for (let x = 0; x < width; x++) {
    let run = -1
    for (let y = 0; y < height; y++) {
      if (rows[y * width + x]) run = y
      if (run >= 0 && y - run <= r) out[y * width + x] = 1
    }
    run = -1
    for (let y = height - 1; y >= 0; y--) {
      if (rows[y * width + x]) run = y
      if (run >= 0 && run - y <= r) out[y * width + x] = 1
    }
  }
  return out
}

/**
 * The letter-sized shapes in a picture, as boxes in its own pixels,
 * in reading order (rows top to bottom, then left to right).
 */
export function findShapes(grey: Uint8Array, width: number, height: number, o: DetectOptions = {}): Box[] {
  const t = otsu(grey)
  let dark = 0
  for (let i = 0; i < grey.length; i++) if (grey[i] <= t) dark++
  const inkDark = o.ink === 'dark' ? true : o.ink === 'light' ? false : dark <= grey.length / 2
  const mask = new Uint8Array(grey.length)
  for (let i = 0; i < grey.length; i++) mask[i] = (inkDark ? grey[i] <= t : grey[i] > t) ? 1 : 0
  const joined = thicken(mask, width, height, Math.max(0, Math.round(o.join ?? 1)))

  // Gather touching ink (8 neighbours) with a stack, one shape at a time.
  const seen = new Uint8Array(grey.length)
  const stack = new Int32Array(grey.length)
  const boxes: (Box & {ink: number})[] = []
  for (let start = 0; start < joined.length; start++) {
    if (!joined[start] || seen[start]) continue
    let top = 0
    stack[top++] = start
    seen[start] = 1
    let x0 = width, y0 = height, x1 = -1, y1 = -1, ink = 0
    while (top) {
      const i = stack[--top]
      const x = i % width
      const y = (i - x) / width
      // The box is drawn round the ink itself, not the thickening.
      if (mask[i]) {
        ink++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width || (!dx && !dy)) continue
          const j = ny * width + nx
          if (joined[j] && !seen[j]) {
            seen[j] = 1
            stack[top++] = j
          }
        }
      }
    }
    boxes.push({x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, ink})
  }

  // Letter-sized: not specks, not the frame or the whole drawing.
  const minSide = Math.max(6, Math.min(width, height) * 0.012)
  const minInk = (width * height) * 0.00005
  const kept = boxes.filter(
    (b) => b.h >= minSide && b.w >= 2 && b.ink >= minInk && b.w <= width * 0.6 && b.h <= height * 0.6 && b.w / b.h < 6 && b.h / b.w < 8,
  )
  // Reading order: band rows by the median height, then left to right.
  const hs = kept.map((b) => b.h).sort((a, z) => a - z)
  const band = Math.max(1, hs[Math.floor(hs.length / 2)] ?? 1)
  kept.sort((a, z) => Math.floor((a.y + a.h / 2) / band) - Math.floor((z.y + z.h / 2) / band) || a.x - z.x)
  return kept.slice(0, 600).map(({x, y, w, h}) => ({x, y, w, h}))
}

/**
 * A box in working pixels as a Sanity crop (fractions trimmed off each side)
 * with a little paper kept round the letter.
 */
export function toCrop(b: Box, width: number, height: number, pad = 0.06) {
  const px = Math.round(Math.max(b.w, b.h) * pad)
  const left = Math.max(0, b.x - px)
  const top = Math.max(0, b.y - px)
  const right = Math.min(width, b.x + b.w + px)
  const bottom = Math.min(height, b.y + b.h + px)
  const crop = {
    _type: 'sanity.imageCrop',
    left: left / width,
    top: top / height,
    right: 1 - right / width,
    bottom: 1 - bottom / height,
  }
  const hotspot = {
    _type: 'sanity.imageHotspot',
    x: (left + right) / 2 / width,
    y: (top + bottom) / 2 / height,
    width: (right - left) / width,
    height: (bottom - top) / height,
  }
  return {crop, hotspot}
}
