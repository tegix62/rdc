import imageUrlBuilder from '@sanity/image-url';
import { sanityClient } from './sanity';

const builder = imageUrlBuilder(sanityClient);

export function urlFor(source: unknown) {
  // `auto('format')` lets Sanity's CDN negotiate WebP/AVIF per browser
  // instead of always shipping the original JPEG/PNG. Quality 80 is
  // visually indistinguishable here and materially smaller.
  return builder.image(source as never).auto('format').quality(80);
}

/*
  Sanity encodes an asset's intrinsic size in its reference:
    image-<hash>-<width>x<height>-<ext>
  so the real dimensions are available at build time without fetching
  anything. That's what lets every <img> carry width/height and reserve its
  space before it loads - without them the page reflows as each image
  arrives, which reads as janky scrolling.
*/
export function imageDimensions(source: any): {width: number; height: number} | null {
  const ref: string | undefined = source?.asset?._ref ?? source?._ref;
  if (typeof ref !== 'string') return null;
  const match = ref.match(/-(\d+)x(\d+)-[a-z0-9]+$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return {width, height};
}

// The widths offered to the browser. Chosen to bracket the sizes this site
// actually renders at rather than a generic ladder. Sanity generates each on
// first request and caches it.
const SRCSET_WIDTHS = [320, 480, 640, 800, 1080, 1440, 1920, 2400];

/**
 * Builds a srcset capped at the intrinsic width, so the CDN is never asked
 * to upscale, and at `maxWidth`, so a thumbnail doesn't offer 2400px files.
 */
export function buildSrcSet(
  source: unknown,
  maxWidth: number,
  aspect?: {width: number; height: number},
): string | undefined {
  const intrinsic = imageDimensions(source);
  const ceiling = Math.min(maxWidth, intrinsic?.width ?? maxWidth);
  const widths = SRCSET_WIDTHS.filter((w) => w <= ceiling);
  // Include the ceiling itself so the largest rendering isn't handed a file
  // smaller than it needs.
  if (!widths.includes(ceiling)) widths.push(ceiling);
  if (widths.length < 2) return undefined;

  return widths
    .map((w) => {
      let b = urlFor(source).width(w);
      // Preserve a deliberate crop ratio across every variant, otherwise the
      // wider entries come back at the source aspect and the layout shifts
      // when the browser swaps them.
      if (aspect) b = b.height(Math.round((w * aspect.height) / aspect.width)).fit('crop');
      // srcset is a comma-separated list, and cropping makes Sanity emit a
      // `rect=x,y,w,h` parameter - those commas split the attribute into
      // nonsense entries. Encoding them keeps each candidate intact; the CDN
      // decodes %2C back to a comma.
      return `${b.url().replace(/,/g, '%2C')} ${w}w`;
    })
    .join(', ');
}
