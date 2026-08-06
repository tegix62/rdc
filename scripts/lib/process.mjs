import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { makeRng } from './rng.mjs';
import { createAnalyzer } from './analyze.mjs';
import { buildVeil } from './veil.mjs';
import { buildMarks } from './marks.mjs';

const EXT = { webp: 'webp', jpg: 'jpg', jpeg: 'jpg', avif: 'avif', png: 'png' };

/**
 * Watermark one source image into every configured width/format.
 *
 * Each width is watermarked independently from a fresh resize rather than by
 * downscaling the largest output. Every geometry value is a ratio of the long
 * edge, so the mark keeps the same *relative* weight at 640px as at 2000px —
 * downscaling a finished 2000px render would instead shrink the type until it
 * turned to mush.
 */
export class SkipError extends Error {
  constructor(message) {
    super(message);
    this.skip = true;
  }
}

export async function processImage({ key, slug, input, config, outDir }) {
  const probe = await sharp(input).metadata();

  // Animated sources are read one frame at a time by sharp, so watermarking
  // one would silently flatten an animation into a still. This dataset serves
  // animated assets untouched on purpose, so refuse rather than destroy them —
  // they need watermarking as video, which is a different job.
  if ((probe.pages ?? 1) > 1 && !config.allowAnimated) {
    throw new SkipError(`animated source (${probe.pages} frames) — left untouched`);
  }

  const oriented = await sharp(input).rotate().toBuffer(); // honour EXIF, then drop it
  const meta = await sharp(oriented).metadata();
  const srcW = meta.width;
  const srcH = meta.height;
  if (!srcW || !srcH) throw new Error(`could not read dimensions for ${key}`);

  const srcLong = Math.max(srcW, srcH);

  // Clamp each requested width to the master *before* de-duplicating: we never
  // upscale (a 900px source must not ship a blurry "2000px" file), and once
  // clamped several requested widths can collapse onto the same size, which
  // would otherwise mean rendering the same file two or three times over.
  const widths = [...new Set(
    config.output.widths.filter((w) => w > 0).map((w) => Math.min(w, srcLong))
  )].sort((a, b) => a - b);

  const variants = [];

  for (const long of widths) {
    const scale = long / srcLong;
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const base = await sharp(oriented)
      .resize({ width: w, height: h, fit: 'fill', kernel: 'lanczos3' })
      .toColourspace('srgb')
      .toBuffer();

    const stamped = await stamp(base, w, h, config, key);

    for (const fmt of config.output.formats) {
      const ext = EXT[fmt];
      if (!ext) throw new Error(`unsupported output format: ${fmt}`);
      const filename = `${slug}-${long}.${ext}`;
      const outPath = path.join(outDir, filename);
      const quality = config.output.quality?.[fmt] ?? 82;

      let pipe = sharp(stamped);
      if (ext === 'webp') pipe = pipe.webp({ quality, effort: 5 });
      else if (ext === 'jpg') pipe = pipe.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' });
      else if (ext === 'avif') pipe = pipe.avif({ quality });
      else pipe = pipe.png({ compressionLevel: 9 });

      // Source metadata is deliberately *not* carried over: camera masters
      // routinely embed GPS coordinates, and a portfolio should not publish
      // where the work was shot. We write only our own ownership tags.
      const buf = await pipe.withExif(exifFor(config)).toBuffer();
      await fs.writeFile(outPath, buf);

      variants.push({
        width: w, height: h, longEdge: long,
        format: ext, file: filename, bytes: buf.length,
      });
    }
  }

  let lqip = null;
  if (config.output.lqip) {
    // 20px placeholder — far below any usable resolution, so it can ship
    // un-watermarked without giving anything away.
    const tiny = await sharp(oriented)
      .resize({ width: 20, height: Math.max(1, Math.round((srcH / srcW) * 20)), fit: 'fill' })
      .blur(1.2)
      .webp({ quality: 40 })
      .toBuffer();
    lqip = `data:image/webp;base64,${tiny.toString('base64')}`;
  }

  return {
    key, slug,
    source: { width: srcW, height: srcH },
    aspectRatio: +(srcW / srcH).toFixed(6),
    lqip,
    variants,
  };
}

/** Apply veil + covert marks to one already-resized buffer. */
async function stamp(base, w, h, config, key) {
  const rng = makeRng(config.seed ?? 'seed', key);
  const layers = [];

  // Both layers key off what the image actually looks like, so the analysis
  // thumbnail is built once up front and shared.
  const needsAnalysis = config.marks?.enabled || config.veil?.color === 'auto';
  const analyzer = needsAnalysis ? await createAnalyzer(base, w, h) : null;

  if (config.veil?.enabled) {
    const veil = await buildVeil(w, h, config.veil, rng, analyzer?.global());
    layers.push({ input: veil.buffer, left: 0, top: 0, blend: config.veil.blend || 'over' });
  }

  if (config.marks?.enabled) {
    const marks = await buildMarks(analyzer, w, h, config.marks, rng);
    layers.push(...marks.composites);
  }

  if (!layers.length) return base;
  return sharp(base).composite(layers).toBuffer();
}

function exifFor(config) {
  const id = config.identity ?? {};
  const notice = (id.copyrightNotice ?? '').replace('{year}', String(new Date().getFullYear()));
  const IFD0 = {};
  if (notice) IFD0.Copyright = notice;
  if (id.name) IFD0.Artist = id.name;
  if (id.studio || id.site) {
    IFD0.ImageDescription = [id.studio, id.site].filter(Boolean).join(' — ');
  }
  return Object.keys(IFD0).length ? { IFD0 } : {};
}
