import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Incremental build cache.
 *
 * Watermarking a full portfolio is minutes of CPU; doing it on every deploy
 * for the sake of one new photo is waste. We fingerprint (source bytes +
 * watermark config) and skip anything whose fingerprint and outputs are both
 * still intact. Config is part of the hash because nudging `edgeOpacity` has
 * to invalidate every image, not just the new ones.
 */
export function fingerprint(sourceHash, config) {
  const relevant = {
    seed: config.seed,
    identity: config.identity,
    veil: config.veil,
    marks: config.marks,
    output: {
      widths: config.output.widths,
      formats: config.output.formats,
      quality: config.output.quality,
      lqip: config.output.lqip,
    },
  };
  return crypto
    .createHash('sha256')
    .update(sourceHash)
    .update(JSON.stringify(relevant))
    .digest('hex')
    .slice(0, 32);
}

export function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

export async function loadManifest(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return { version: 1, entries: {} };
  }
}

export async function saveManifest(file, manifest) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
}

/** A cache hit is only a hit if the files it claims to have produced exist. */
export async function isFresh(entry, fp, outDir) {
  if (!entry || entry.fingerprint !== fp) return false;
  const checks = await Promise.all(
    (entry.result?.variants ?? []).map((v) =>
      fs.access(path.join(outDir, v.file)).then(() => true, () => false)
    )
  );
  return checks.length > 0 && checks.every(Boolean);
}
