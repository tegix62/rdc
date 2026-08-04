/*
  Detects animated WebP files at build time.

  Needed because a static and an animated WebP have identical Sanity asset
  references, and the difference matters a lot: asking the CDN to resize an
  animated WebP produced a 10,721 KB response from a source file under 1 MB.
  Animated sources have to bypass the transform pipeline, so the build has to
  know which ones they are.

  How: a WebP is a RIFF container. An animated one carries a VP8X chunk whose
  feature flags include the animation bit, and an "ANIM" chunk follows. Both
  live in the first few dozen bytes, so a Range request for the header is
  enough - no need to pull whole multi-megabyte files.

  Results are cached per asset for the life of the build, so an image reused
  across pages is probed once. Failures resolve to `false`: if the probe
  cannot tell, the image keeps its normal responsive treatment rather than the
  build breaking.
*/
import {originalUrl, mayBeAnimated} from './image';

const cache = new Map<string, Promise<boolean>>();

async function probe(url: string): Promise<boolean> {
  try {
    // 4 KB, not 256 bytes. A GIF's NETSCAPE application extension - the loop
    // block that marks it animated - sits after the logical screen descriptor
    // AND the global colour table, and a 256-colour table alone is 768 bytes.
    // So on a typical GIF the marker lives around offset 780+ and the old
    // window could never reach it. Measured: 13 animated GIFs in this dataset
    // were reported static, including the 400x400 one that the CDN turns from
    // 867 KB into 4,602 KB.
    const res = await fetch(url, {headers: {Range: 'bytes=0-4095'}});
    if (!res.ok && res.status !== 206) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ascii = (start: number, len: number) =>
      String.fromCharCode(...bytes.slice(start, start + len));

    /*
      Dispatch on what the bytes ARE, not on what the asset reference claims.
      The dataset contains references ending `-webp` whose contents are JPEG
      and references ending `-gif` whose contents are static PNG, so the
      extension cannot be trusted to pick a parser either.
    */

    // The whole fetched window, rather than an arbitrary prefix of it. Marker
    // positions depend on palette and chunk sizes, so any fixed small number
    // is a guess - and the previous guess (64) was wrong for every real GIF
    // here.
    const window = ascii(0, bytes.length);

    // GIF: a Netscape looping extension is a positive animation signal. A
    // single-frame GIF does not carry one.
    if (ascii(0, 3) === 'GIF') {
      return window.includes('NETSCAPE');
    }

    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      // Only the extended format (VP8X) can be animated.
      if (ascii(12, 4) !== 'VP8X') return false;
      // Byte 20 holds the feature flags; bit 1 (0x02) is the animation flag.
      const animationFlag = (bytes[20] & 0x02) !== 0;
      // Belt and braces: an ANIM chunk sits early, but read the whole window
      // for the same reason as above.
      return animationFlag || window.includes('ANIM');
    }

    /*
      PNG can animate. An APNG carries an acTL (animation control) chunk, which
      the spec requires to appear before the first IDAT - so it is inside this
      window. Missing this mattered: the dataset holds 400x400 PNGs that the
      transform pipeline turns from 279 KB into 1,256 KB, which is not something
      a still image does.
    */
    if (ascii(1, 3) === 'PNG') {
      return window.includes('acTL');
    }

    // JPEG and anything else here cannot animate.
    return false;
  } catch {
    return false;
  }
}

/**
 * True when this source's actual bytes are an animated GIF or animated WebP.
 * Formats that cannot animate skip the network call entirely.
 */
export function isAnimatedSource(source: any): Promise<boolean> {
  if (!mayBeAnimated(source)) return Promise.resolve(false);
  const url = originalUrl(source);
  if (!url) return Promise.resolve(false);

  const existing = cache.get(url);
  if (existing) return existing;

  const pending = probe(url);
  cache.set(url, pending);
  return pending;
}
