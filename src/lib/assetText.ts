/*
  Alt text written once on the ASSET, not once per place the asset is used.

  THE PROBLEM THIS SOLVES

  Every image field on this site carries its own `alt`, so a photograph used
  on a case study, in a Media Row and on the Portfolio grid is described three
  times - and described differently, or twice and not the third time, which is
  the usual outcome. The description belongs to the picture, not to the slot
  the picture happens to be sitting in.

  Sanity already has the right place for it. Every uploaded file is a
  `sanity.imageAsset` document with built-in `title`, `description` and
  `altText` fields, editable from the media library when you select an image
  and open its details. Nothing on this site was reading them.

  WHY A SEPARATE QUERY RATHER THAN A PROJECTION

  Because of how this site queries. `getCaseStudy` and friends fetch with
  `...`, which returns an image field as `{_type, asset: {_ref, _type}}` - the
  reference, unresolved. Reaching `asset->altText` means adding `asset->` to
  every image in every projection, and images are nested at a dozen depths:
  section.image, section.imageLeft, items[].image, items[].videoPoster,
  thumbnail, mainImage, archiveMark, clientLogo, and the blog's own. Each one
  a place to forget, and forgetting is silent - the alt just comes back empty.

  So: one query for every asset that HAS alt text, once per build, looked up
  by reference. Nothing else has to change and nothing can be forgotten. The
  same shape as isAnimatedSource's per-asset cache, for the same reason.

  PRECEDENCE, WHICH IS THE WHOLE DESIGN

  The asset's alt is a FALLBACK, never an override. A specific description
  beats a general one, and the same picture genuinely can need different words
  in different places - a logo shown as a logo is "Hug a Mug logotype", and
  the same file in a row of client marks might want the client's name. So:

    1. an explicit alt passed at the call site
    2. the alt written on that image field in the document
    3. the alt written on the asset itself, here
    4. empty, which is what a decorative image should be

  Which means adopting this needs no migration: fields that already have alt
  text keep winning, and the asset's text fills in behind them.
*/
import {sanityClient} from './sanity';

/*
  One query, resolved once, awaited by every caller.

  Stored as the PROMISE rather than the result so that concurrent page builds
  share a single request instead of each starting their own - Astro renders
  routes in parallel and this module is imported by every image on the site.
*/
let pending: Promise<Map<string, string>> | null = null;

function load(): Promise<Map<string, string>> {
  if (pending) return pending;
  pending = sanityClient
    .fetch<Array<{_id: string; altText?: string}>>(
      // Only the assets that actually carry text, so the response stays small
      // on a dataset where most images have none yet.
      `*[_type == "sanity.imageAsset" && defined(altText) && altText != ""]{_id, altText}`,
    )
    .then((rows) => {
      const map = new Map<string, string>();
      for (const row of rows ?? []) {
        if (row?._id && typeof row.altText === 'string') map.set(row._id, row.altText.trim());
      }
      return map;
    })
    .catch((error) => {
      /*
        A failure here must not break the build. Alt text falling back to what
        the document already carries is exactly the behaviour this site had
        before, so the worst case is no improvement rather than no site.
      */
      console.warn(
        `[assetText] could not read asset alt text, falling back to the alt on ` +
          `each field: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Map<string, string>();
    });
  return pending;
}

/*
  An asset document's _id IS the reference an image field holds - both are
  `image-<hash>-<w>x<h>-<ext>` - so the lookup needs no translation.

  Accepts either shape because both occur: a projected image is
  `{asset: {_ref}}`, and a few call sites hand over the reference object
  directly.
*/
export async function assetAlt(image: any): Promise<string | null> {
  const ref: unknown = image?.asset?._ref ?? image?._ref;
  if (typeof ref !== 'string' || !ref) return null;
  const map = await load();
  return map.get(ref) ?? null;
}
