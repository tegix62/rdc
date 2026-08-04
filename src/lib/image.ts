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
/*
  True pass-through: the asset's own URL with no query string at all, so the
  CDN hands back the exact bytes that were uploaded.

  This is built from the asset reference rather than via the URL builder on
  purpose. The builder is where auto('format') and quality(80) live, and a
  future edit there would silently start re-encoding images that are meant to
  ship untouched. Constructing the URL directly means there is no code path
  from here to a transform parameter.

  Reference format: image-<assetId>-<width>x<height>-<ext>
*/
export function originalUrl(source: any): string | null {
  const ref: string | undefined = source?.asset?._ref ?? source?._ref;
  if (typeof ref !== 'string') return null;
  // Deliberately permissive on the asset id. Sanity uses hex digests today,
  // but a stricter pattern that fails to match returns null here, and null
  // silently falls back to the transform pipeline - which would re-encode the
  // very animations this exists to protect. Failing open to "no pass-through"
  // is the one outcome that must not happen quietly.
  const match = ref.match(/^image-([a-zA-Z0-9_-]+)-(\d+x\d+)-([a-z0-9]+)$/i);
  if (!match) return null;
  const [, assetId, dimensions, ext] = match;
  const {projectId, dataset} = sanityClient.config();
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${assetId}-${dimensions}.${ext}`;
}

/** The asset's file extension, from its reference. */
export function sourceExtension(source: any): string | null {
  const ref: string | undefined = source?.asset?._ref ?? source?._ref;
  if (typeof ref !== 'string') return null;
  const match = ref.match(/-([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : null;
}

/*
  Animated images must never go through the resize/re-encode pipeline: the CDN
  re-encodes frame by frame and the result can be several times the original.
  Measured on this dataset, one 867 KB GIF comes back as 4,602 KB.

  What this must NOT do is trust the file extension in the asset reference.
  Sanity's stored extension is unreliable here - a diagnostic over the whole
  dataset found assets whose reference ends `-webp` whose actual bytes are
  JPEG, and assets labelled `-gif` that are static PNG. An earlier version of
  this decided pass-through from the extension alone, which forced dozens of
  perfectly ordinary static images to ship at full size with no srcset and made
  /portfolio 7 MB heavier.

  So animation is determined by reading the file header - see ./animated.ts -
  and the extension is used only to decide whether a probe is worth doing.
*/
/**
 * Whether this source is worth probing for animation. Only these containers
 * can hold one, so everything else skips the network call. This is a hint
 * about where to look, never a verdict - see the note above.
 */
export function mayBeAnimated(source: any): boolean {
  const ext = sourceExtension(source);
  return ext === 'gif' || ext === 'webp';
}

/**
 * Whether this image ships untouched: either marked "serve exactly as
 * uploaded" in Studio, or confirmed animated by reading its bytes.
 */
export function isPassThrough(source: any, animated = false): boolean {
  return source?.noRecompress === true || animated;
}

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

/*
  The width to actually ask the CDN for, never larger than the file itself.

  Upscaling is not just wasteful, it is catastrophic on an animated source:
  the CDN re-encodes every frame at the requested size, so a 200x200 animated
  WebP asked for at w=800 came back at 2,539 KB, and an 800x800 one asked for
  at w=1800 came back at 10,704 KB - by itself 98% of the homepage's weight.

  buildSrcSet has always clamped. The single `src` attribute and the two CSS
  background images did not, and those are where every one of the measured
  offenders came from. Clamping lives here so no call site has to remember:
  ask for whatever width the layout wants and get back the largest width that
  is real.
*/
export function cappedWidth(source: unknown, requested: number): number {
  const intrinsic = imageDimensions(source);
  if (!intrinsic) return requested;
  return Math.min(requested, intrinsic.width);
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
  const ceiling = cappedWidth(source, maxWidth);
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
