import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGE_RE = /\.(jpe?g|png|webp|tiff?|avif)$/i;

/**
 * Read originals from a directory tree on disk.
 *
 * Intended for masters that live *outside* the repo (see README) — pass
 * `--in ~/Pictures/portfolio-masters` rather than committing full-resolution
 * files into git, where every previous revision stays fetchable forever.
 */
export async function listLocal(dir) {
  const root = path.resolve(dir);
  const out = [];

  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error(`source directory not found: ${root}`);
      throw err;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && IMAGE_RE.test(e.name)) {
        const rel = path.relative(root, full);
        out.push({
          key: rel.split(path.sep).join('/'),
          slug: slugify(rel.replace(IMAGE_RE, '')),
          read: () => fs.readFile(full),
        });
      }
    }
  }

  await walk(root);
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'image';
}
