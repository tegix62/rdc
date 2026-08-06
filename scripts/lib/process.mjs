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

  // Dimensions as displayed. EXIF orientations 5-8 include a quarter turn, so
  // the stored width and height are the wrong way round for those.
  const swapped = (probe.orientation ?? 1) >= 5;
  const srcW = swapped ? probe.height : probe.width;
  const srcH = swapped ? probe.width : probe.height;
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
  const markPlacements = new Map();

  for (const long of widths) {
    const scale = long / srcLong;
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    // Decoded from the original every time rather than from one shared
    // intermediate. `sharp(input).rotate().toBuffer()` re-encodes to the input
    // format at *default* quality — on this photo that turned a 5.7 MB master
    // into 2.0 MB before any watermarking happened, spending a whole lossy
    // generation for nothing. Re-decoding costs a little CPU and no fidelity.
    // Decoded from the original every time rather than from one shared
    // intermediate, and held as uncompressed PNG rather than whatever
    // `toBuffer()` would have picked.
    //
    // `toBuffer()` keeps the *input* format at default quality, so a JPEG
    // master used to be re-encoded twice before delivery — once into the
    // shared oriented buffer and once into this one. Measured on a 5.7 MB
    // photo that was 5.7 MB -> 2.0 MB -> 0.3 MB of intermediates, with
    // artifacts of ±32 levels in the result. compressionLevel 0 is lossless
    // and, at 461ms against 637ms here, actually faster than the JPEG encode
    // it replaces.
    const base = await sharp(input)
      .rotate() // honour EXIF orientation; the tag itself is dropped on write
      .resize({ width: w, height: h, fit: 'fill', kernel: 'lanczos3' })
      .toColourspace('srgb')
      .png({ compressionLevel: 0 })
      .toBuffer();

    const { buffer: stamped, marks } = await stamp(base, w, h, config, key);
    // Where the covert marks landed, at this width. Surfaced so a preview can
    // crop to them at 100% — they are deliberately hard to spot, which makes
    // "is that one actually legible?" impossible to answer by eye otherwise.
    markPlacements.set(long, marks);

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
    const tiny = await sharp(input)
      .rotate()
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
    marks: markPlacements.get(widths[widths.length - 1]) ?? [],
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
    // The base image is handed to the veil so `auto` ink can be decided per
    // region rather than once for the whole frame.
    const veil = await buildVeil(w, h, config.veil, rng, analyzer?.global(), base);
    layers.push({ input: veil.buffer, left: 0, top: 0, blend: config.veil.blend || 'over' });
  }

  let placed = [];
  if (config.marks?.enabled) {
    const marks = await buildMarks(analyzer, w, h, config.marks, rng);
    layers.push(...marks.composites);
    placed = marks.placed;
  }

  if (!layers.length) return { buffer: base, marks: [] };
  return {
    // removeAlpha because compositing RGBA layers over an opaque base yields
    // an RGBA result, and an alpha channel every pixel of which is 255 is pure
    // overhead in the delivered WebP and PNG.
    buffer: await sharp(base)
      .composite(layers)
      .removeAlpha()
      .png({ compressionLevel: 0 })
      .toBuffer(),
    marks: placed,
  };
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
