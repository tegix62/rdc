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
    const res = await fetch(url, {headers: {Range: 'bytes=0-255'}});
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

    // GIF: animated when it declares more than one image descriptor. The
    // header window is enough to distinguish the common cases - a single-frame
    // GIF has its one descriptor early, and a Netscape looping extension
    // ("NETSCAPE2.0") is a positive animation signal.
    if (ascii(0, 3) === 'GIF') {
      return ascii(0, 64).includes('NETSCAPE');
    }

    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      // Only the extended format (VP8X) can be animated.
      if (ascii(12, 4) !== 'VP8X') return false;
      // Byte 20 holds the feature flags; bit 1 (0x02) is the animation flag.
      const animationFlag = (bytes[20] & 0x02) !== 0;
      // Belt and braces: an ANIM chunk should appear in the header region.
      return animationFlag || ascii(0, 64).includes('ANIM');
    }

    // JPEG, PNG and anything else cannot animate.
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
