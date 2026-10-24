/*
  WHERE A PICTURE'S ARTWORK ACTUALLY IS, from its tiny preview.

  Chris, of the world page on a phone: "still looking clunky". A tee, a
  hoodie or a mark on transparency - or a mockup shot on white - carries
  its own blank margin, so tiles whose boxes line up exactly still look
  unevenly spaced. The world page trims each tile to its artwork instead.

  Measured from Sanity's LQIP (metadata.lqip, a ~20px copy already in the
  document): no picture is downloaded. On transparency the preview keeps
  its alpha, so the artwork is what is not see-through; on an opaque
  picture whose four corners are one colour (a mockup on white, a mark on
  black), it is what differs from that colour. A full-bleed picture - a
  photograph, a poster - has no margin and is left whole.

  The preview is coarse, so the box is padded by a preview pixel all round:
  trimming too little costs a sliver of air, trimming too much would cut
  the artwork. Build time only (sharp, an optional dependency of Astro):
  without it, nothing is trimmed.
*/

export interface Trim {
  /** The artwork's box, as fractions of the picture: left, top, right, bottom. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

let sharpLoad: Promise<any> | null = null;
const loadSharp = () => (sharpLoad ??= import('sharp').then((m) => m.default).catch(() => null));

export async function trimOf(lqip: string | null | undefined): Promise<Trim | null> {
  if (!lqip?.startsWith('data:image/')) return null;
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const buf = Buffer.from(lqip.slice(lqip.indexOf(',') + 1), 'base64');
    const {data, info} = await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const w: number = info.width;
    const h: number = info.height;
    const at = (x: number, y: number) => (y * w + x) * 4;
    let see = false;
    for (let k = 3; k < data.length; k += 4) if (data[k] < 250) see = true;
    let inArt: (x: number, y: number) => boolean;
    if (see) {
      inArt = (x, y) => data[at(x, y) + 3] > 40;
    } else {
      const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
      const diff = (a: number, b: number) => Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
      if (corners.some((a) => corners.some((b) => diff(a, b) > 40))) return null;
      inArt = (x, y) => diff(at(x, y), corners[0]) > 36;
    }
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (inArt(x, y)) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
    if (x1 < 0) return null;
    const t = {
      x0: Math.max(0, x0 - 1) / w,
      y0: Math.max(0, y0 - 1) / h,
      x1: Math.min(w, x1 + 2) / w,
      y1: Math.min(h, y1 + 2) / h,
    };
    // Hardly any margin: not worth a trim.
    if ((t.x1 - t.x0) * (t.y1 - t.y0) > 0.92) return null;
    return t;
  } catch {
    return null;
  }
}
