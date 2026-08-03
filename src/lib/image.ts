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
  Animated images must never go through the resize/re-encode pipeline.

  This is not a preference, it's a measured failure: the homepage's
  `Pisces-Anim-under1mb.webp` - an animated WebP hand-compressed to under 1 MB
  - came back from the CDN at 10,721 KB, having asked for it at w=800&q=80.
  Re-encoding an animation frame by frame at a new size is not something the
  image pipeline does well, and the result was ~11x larger than the original
  file and larger than what Webflow served.

  GIF is detectable from the asset reference. Animated WebP is not - a static
  and an animated WebP have identical references - so those are detected by
  reading the RIFF header, which is what `probeAnimatedWebp` in ./animated.ts
  does.
*/
export function isAnimatedByExtension(source: any): boolean {
  return sourceExtension(source) === 'gif';
}

/**
 * Whether this image ships untouched: either marked "serve exactly as
 * uploaded" in Studio, or animated (where re-encoding actively makes it
 * worse).
 */
export function isPassThrough(source: any, animated = false): boolean {
  return source?.noRecompress === true || animated || isAnimatedByExtension(source);
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
