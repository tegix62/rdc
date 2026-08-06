import { slugify } from './local.mjs';

/**
 * Read originals straight from Sanity's asset store.
 *
 * This is the mode meant for CI: the masters stay in Sanity (the one place
 * they already live), the build pulls them, watermarks them, and only the
 * derivatives are ever deployed. Nothing full-resolution touches the repo.
 *
 * Needs SANITY_PROJECT_ID and SANITY_DATASET; SANITY_READ_TOKEN as well if the
 * dataset is private.
 */
export async function listSanity(opts = {}) {
  const projectId = opts.projectId || process.env.SANITY_PROJECT_ID;
  const dataset = opts.dataset || process.env.SANITY_DATASET || 'production';
  // A read token is only needed for a private dataset; a public one answers
  // unauthenticated, which is why the token is optional throughout.
  const token = opts.token || process.env.SANITY_READ_TOKEN;
  const apiVersion = opts.apiVersion || '2024-01-01';

  if (!projectId) {
    throw new Error('Sanity source requires SANITY_PROJECT_ID (or --project-id).');
  }

  const query =
    opts.query ||
    `*[_type == "sanity.imageAsset"]{_id, url, originalFilename, "w": metadata.dimensions.width, "h": metadata.dimensions.height} | order(_id asc)`;

  const url =
    `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${encodeURIComponent(dataset)}` +
    `?query=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Sanity query failed: ${res.status} ${res.statusText} — ${(await res.text()).slice(0, 300)}`);
  }

  const { result } = await res.json();
  if (!Array.isArray(result)) throw new Error('Sanity returned no result array.');

  return result
    .filter((a) => a && a.url)
    .map((asset) => {
      const name = asset.originalFilename?.replace(/\.[^.]+$/, '') || asset._id;
      return {
        key: asset._id,
        // Asset id is appended so two files both called "final.jpg" cannot
        // collide and silently overwrite one another's outputs.
        slug: `${slugify(name)}-${shortId(asset._id)}`,
        meta: { sourceWidth: asset.w, sourceHeight: asset.h },
        read: async () => {
          const r = await fetch(asset.url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!r.ok) throw new Error(`failed to download ${asset._id}: ${r.status} ${r.statusText}`);
          return Buffer.from(await r.arrayBuffer());
        },
      };
    });
}

function shortId(id) {
  return String(id).replace(/^image-/, '').slice(0, 8);
}
