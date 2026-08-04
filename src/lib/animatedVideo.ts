/*
  Looks up video versions of animated images, produced by
  `studio/migration/convert-animations.mjs` and stored in the single
  `animatedVideoMap` document.

  Fetched once per build and cached, because Img is used on every page and
  this must not become one query per image.

  Everything degrades gracefully: no map, an empty map, or a missing entry all
  return null, and the caller falls back to serving the animation as an image.
  That's how the site behaves before the conversion has ever been run.
*/
import {sanityClient} from './sanity';
import {urlFor, cappedWidth} from './image';

export interface AnimatedVideo {
  mp4: string | null;
  webm: string | null;
  width: number | null;
  height: number | null;
  poster: string | null;
}

type Entry = {
  assetId?: string;
  mp4?: {asset?: {url?: string}};
  webm?: {asset?: {url?: string}};
  width?: number;
  height?: number;
};

let mapPromise: Promise<Map<string, Entry>> | null = null;

function loadMap(): Promise<Map<string, Entry>> {
  if (mapPromise) return mapPromise;
  mapPromise = sanityClient
    .fetch(
      `*[_id == "animatedVideoMap"][0]{
        entries[]{
          assetId, width, height,
          mp4{asset->{url}},
          webm{asset->{url}}
        }
      }`,
    )
    .then((doc: {entries?: Entry[]} | null) => {
      const entries = doc?.entries ?? [];
      return new Map(entries.filter((e) => e.assetId).map((e) => [e.assetId as string, e]));
    })
    .catch(() => new Map<string, Entry>());
  return mapPromise;
}

/** The asset hash from a Sanity image reference, which is how the map is keyed. */
function assetHash(source: any): string | null {
  const ref: string | undefined = source?.asset?._ref ?? source?._ref;
  if (typeof ref !== 'string') return null;
  const match = ref.match(/^image-([a-zA-Z0-9_-]+)-\d+x\d+-[a-z0-9]+$/i);
  return match ? match[1] : null;
}

/**
 * Video versions of this animated image, or null when there aren't any.
 * `posterWidth` sizes the still frame used before the video paints.
 */
export async function getAnimatedVideo(
  source: any,
  posterWidth: number,
): Promise<AnimatedVideo | null> {
  const hash = assetHash(source);
  if (!hash) return null;

  const entry = (await loadMap()).get(hash);
  if (!entry) return null;

  const mp4 = entry.mp4?.asset?.url ?? null;
  const webm = entry.webm?.asset?.url ?? null;
  if (!mp4 && !webm) return null;

  /*
    The poster matters for the case where muted autoplay is blocked anyway -
    iOS low power mode being the common one - since without it the visitor sees
    an empty box instead of the artwork.

    `fm=jpg` is forced rather than left to auto-format. A JPEG cannot be
    animated, so this is guaranteed to be one frame and cannot re-trigger the
    ballooning that comes from asking the pipeline to resize an animation.
  */
  let poster: string | null = null;
  try {
    poster = urlFor(source).width(cappedWidth(source, posterWidth)).format('jpg').url();
  } catch {
    poster = null;
  }

  return {
    mp4,
    webm,
    width: entry.width ?? null,
    height: entry.height ?? null,
    poster,
  };
}
