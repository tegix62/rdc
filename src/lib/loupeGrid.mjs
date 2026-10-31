/*
  The magnifier's patch grid, shared by the page script that requests
  patches and scripts/warm-loupe.mjs that requests every one of them ahead of
  time. Both must build byte-identical URLs, or the warmed copies are not the
  ones a visitor asks for - so this is the only place the grid is defined.

  Plain .mjs rather than .ts so Node can import it without a build step.

  WHY A FIXED GRID. The image CDN cuts any rectangle on request, but the
  first cut of a given rectangle from a 43 MB original took about 2 seconds,
  measured; the same rectangle again took 9-220 ms. Arbitrary rectangles
  under a moving glass would almost all be first cuts. Fixed patches can be
  warmed once and are then always the fast case.

  WHY 512. Measured patches of 400 source pixels came back around 70 KB as
  WebP. 512 keeps a patch near 100 KB and puts 4-9 of them under the glass,
  which is few enough to request at once and big enough that the grid of a
  7,000px scan is about 200 patches to warm.

  WHY fm=webp AND NOT auto=format. auto picks a format from the browser's
  Accept header, so one rectangle would be cached once per format and a
  warm-up from a script would warm a format no visitor asks for. One
  explicit format is one cache entry. Every browser this site supports
  decodes WebP.
*/
export const TILE = 512

export const QUALITY = 80

/** The URL of one patch, in source pixels. */
export const tileUrl = (base, x, y, w, h) =>
  `${base}?rect=${x},${y},${w},${h}&fm=webp&q=${QUALITY}`

/*
  The same patch as stored in R2 (scripts/lib/r2-images.mjs: the query
  becomes part of the path). The build copies every patch of a scan there
  and marks the magnifier data-r2 with the scan's path once all are in; a
  patch from R2 runs no Function, so hovering costs nothing against the
  daily count. tileUrl stays the fallback.
*/
export const TILE_HOST = 'https://img.rumeaudesign.co'
export const tileR2Url = (path, x, y, w, h) =>
  `${TILE_HOST}/v2/rect_${x},${y},${w},${h}~fm_webp~q_${QUALITY}/${path}`

/** Every patch of a W x H scan, row by row, edge patches clipped to fit. */
export function tileGrid(W, H) {
  const out = []
  for (let y = 0; y < H; y += TILE) {
    for (let x = 0; x < W; x += TILE) {
      out.push({x, y, w: Math.min(TILE, W - x), h: Math.min(TILE, H - y)})
    }
  }
  return out
}
