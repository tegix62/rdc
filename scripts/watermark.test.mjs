/**
 * Behavioural tests for the watermark pipeline.
 *
 * These assert the properties that actually matter — the vignette really is
 * stronger at the edge, the ink really does flip on bright images, nothing
 * upscales, output is reproducible — rather than just that the code runs.
 *
 *   node scripts/watermark.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import { processImage } from './lib/process.mjs';
import { contrastingColor } from './lib/marks.mjs';
import { createAnalyzer, scoreRegion } from './lib/analyze.mjs';
import { makeRng } from './lib/rng.mjs';
import { fingerprint } from './lib/manifest.mjs';
import { makeAnimatedGif } from './lib/testfixtures.mjs';
import { buildContactSheet } from './lib/sheet.mjs';

const BASE = JSON.parse(await fs.readFile(new URL('../watermark.config.json', import.meta.url), 'utf8'));
delete BASE.$schema;

const cfg = (over = {}) => ({
  ...BASE,
  ...over,
  output: { ...BASE.output, widths: [1200], formats: ['png'], lqip: false, ...(over.output ?? {}) },
});

let tmp;
const outDir = async () => {
  tmp ??= await fs.mkdtemp(path.join(os.tmpdir(), 'wm-test-'));
  const d = await fs.mkdtemp(path.join(tmp, 'run-'));
  return d;
};

/** A smooth, photo-like field at a given luminance — no high-frequency grain
 *  of its own, so measurements reflect the watermark and nothing else. */
async function field(w, h, level, format = 'png') {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, level + Math.sin(x / w * 3) * 6 + Math.cos(y / h * 3) * 6));
      const i = (y * w + x) * 3;
      buf[i] = v; buf[i + 1] = v; buf[i + 2] = v;
    }
  }
  const p = sharp(buf, { raw: { width: w, height: h, channels: 3 } });
  return format === 'png' ? p.png().toBuffer() : p.jpeg({ quality: 96 }).toBuffer();
}

/** Largest absolute difference against the un-watermarked render, in a box.
 *  Peak rather than mean: glyph coverage varies between regions, so the mean
 *  measures where the strokes happened to land, while the peak measures how
 *  strongly a stroke is drawn — which is the thing the vignette controls. */
async function peakDelta(plain, marked, box) {
  const A = await sharp(plain).extract(box).greyscale().raw().toBuffer();
  const B = await sharp(marked).extract(box).greyscale().raw().toBuffer();
  let max = 0;
  for (let i = 0; i < A.length; i++) max = Math.max(max, Math.abs(A[i] - B[i]));
  return max;
}

async function run(input, config) {
  const dir = await outDir();
  const r = await processImage({ key: 'k.png', slug: 'k', input, config, outDir: dir });
  const file = path.join(dir, r.variants[0].file);
  return { result: r, file, buffer: await fs.readFile(file), dir };
}

async function plainAt(input, w, h) {
  return sharp(input).rotate()
    .resize({ width: w, height: h, fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('srgb').png().toBuffer();
}

test('veil is markedly stronger at the edge than the centre', async () => {
  const src = await field(1600, 1200, 120);
  const { result, buffer } = await run(src, cfg({ marks: { ...BASE.marks, enabled: false } }));
  const { width: w, height: h } = result.variants[0];
  const plain = await plainAt(src, w, h);

  const S = Math.round(Math.min(w, h) * 0.22);
  const corner = await peakDelta(plain, buffer, { left: 0, top: 0, width: S, height: S });
  const centre = await peakDelta(plain, buffer, {
    left: Math.round(w / 2 - S / 2), top: Math.round(h / 2 - S / 2), width: S, height: S,
  });

  assert.ok(corner > 8, `edge watermark too faint to see (peak ${corner})`);
  assert.ok(centre < corner * 0.5, `centre is not meaningfully cleaner (centre ${centre}, corner ${corner})`);
});

test('veil ink flips to dark on a bright image so it stays visible', async () => {
  const bright = await field(1200, 1200, 244);
  const config = cfg({ marks: { ...BASE.marks, enabled: false } });

  const auto = await run(bright, config);
  const forcedLight = await run(bright, {
    ...config, veil: { ...config.veil, color: '#ffffff' },
  });

  const { width: w, height: h } = auto.result.variants[0];
  const plain = await plainAt(bright, w, h);
  const box = { left: 0, top: 0, width: Math.round(w * 0.3), height: Math.round(h * 0.3) };

  const autoDelta = await peakDelta(plain, auto.buffer, box);
  const lightDelta = await peakDelta(plain, forcedLight.buffer, box);

  // White ink on a near-white frame is the failure this guards against.
  assert.ok(lightDelta < 6, `fixture is not bright enough to be a real test (${lightDelta})`);
  assert.ok(autoDelta > 12, `auto ink did not rescue the bright case (${autoDelta})`);
  assert.ok(
    autoDelta > lightDelta * 3,
    `auto ink is not meaningfully stronger than white ink here (${autoDelta} vs ${lightDelta})`
  );
});

test('veil survives on both halves of a split-brightness frame', async () => {
  // Dark on the left, blown-out on the right — the shape of any photo with
  // real dynamic range. A single ink chosen from the frame average is wrong
  // for one half of this by construction.
  const W = 1600, H = 1000;
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = x < W / 2 ? 26 : 242;
      const i = (y * W + x) * 3;
      raw[i] = v; raw[i + 1] = v; raw[i + 2] = v;
    }
  }
  const src = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

  const adaptive = await run(src, cfg({ marks: { ...BASE.marks, enabled: false } }));
  const white = await run(src, cfg({
    marks: { ...BASE.marks, enabled: false },
    veil: { ...BASE.veil, color: '#ffffff' },
  }));

  const { width: w, height: h } = adaptive.result.variants[0];
  const plain = await plainAt(src, w, h);
  // Sample the top corners. The vignette is elliptical and follows the frame,
  // so even the middle of a long edge is only about a third of full strength —
  // measuring there would confound ink choice with the fade. The corners are
  // where the veil is actually at `edgeOpacity`.
  const S = Math.round(h * 0.22);
  const darkSide = { left: 6, top: 6, width: S, height: S };
  const brightSide = { left: w - S - 6, top: 6, width: S, height: S };

  const aDark = await peakDelta(plain, adaptive.buffer, darkSide);
  const aBright = await peakDelta(plain, adaptive.buffer, brightSide);
  const wBright = await peakDelta(plain, white.buffer, brightSide);

  assert.ok(aDark > 10, `veil lost on the dark half (${aDark})`);
  assert.ok(aBright > 10, `veil lost on the bright half (${aBright})`);
  // The point of per-region ink: fixed white ink is the failing case here.
  assert.ok(
    aBright > wBright * 2,
    `per-region ink is no better than fixed white on the bright half (${aBright} vs ${wBright})`
  );
});

test('the path to the final encode is lossless', async () => {
  // A white veil can only ever lighten a pixel. Any darkened pixel means
  // something lossy happened to the base before the watermark was applied —
  // which is exactly the bug that an intermediate re-encode introduced.
  const src = await field(1200, 900, 120, 'jpeg');
  const { result, buffer } = await run(src, cfg({
    marks: { ...BASE.marks, enabled: false },
    veil: { ...BASE.veil, color: '#ffffff' },
  }));
  const { width: w, height: h } = result.variants[0];
  const plain = await plainAt(src, w, h);

  const A = await sharp(plain).raw().toBuffer();
  const B = await sharp(buffer).raw().toBuffer();
  assert.equal(A.length, B.length, 'channel count changed — a stray alpha channel?');

  let darkened = 0;
  for (let i = 0; i < A.length; i++) if (B[i] < A[i]) darkened++;
  assert.equal(darkened, 0, `${darkened} pixels were darkened by a white veil`);
});

test('marks stay legible on a near-black image', async () => {
  const dark = await field(1400, 1000, 14);
  const { result, buffer } = await run(dark, cfg({ veil: { ...BASE.veil, enabled: false } }));
  const { width: w, height: h } = result.variants[0];
  const plain = await plainAt(dark, w, h);
  const full = await peakDelta(plain, buffer, { left: 0, top: 0, width: w, height: h });
  assert.ok(full > 5, `marks invisible on a dark frame (peak ${full})`);
});

test('contrastingColor hits the requested luminance delta at both extremes', () => {
  const luma = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  for (const level of [0.02, 0.12, 0.5, 0.88, 0.97]) {
    const rgb = [level * 255, level * 255, level * 255];
    const got = luma(contrastingColor({ rgb, luma: level }, 0.075));
    const expected = level < 0.5 ? level + 0.075 : level - 0.075;
    assert.ok(
      Math.abs(got - Math.min(0.98, Math.max(0.02, expected))) < 0.02,
      `at luma ${level}: expected ~${expected.toFixed(3)}, got ${got.toFixed(3)}`
    );
  }
});

test('never upscales, and collapses duplicate widths', async () => {
  const small = await field(900, 600, 130);
  const { result } = await run(small, cfg({
    output: { ...BASE.output, widths: [640, 1280, 2000], formats: ['png'], lqip: false },
  }));
  const longs = result.variants.map((v) => v.longEdge);
  assert.deepEqual([...new Set(longs)].sort((a, b) => a - b), [640, 900]);
  assert.equal(longs.length, new Set(longs).size, 'the same width was rendered twice');
  for (const v of result.variants) assert.ok(v.width <= 900 && v.height <= 600);
});

test('output is byte-reproducible for the same seed and input', async () => {
  const src = await field(1000, 800, 120);
  const a = await run(src, cfg());
  const b = await run(src, cfg());
  assert.ok(a.buffer.equals(b.buffer), 'two identical runs produced different bytes');
});

test('a different seed moves the marks', async () => {
  const src = await field(1000, 800, 120);
  const a = await run(src, cfg({ seed: 'one', veil: { ...BASE.veil, enabled: false } }));
  const b = await run(src, cfg({ seed: 'two', veil: { ...BASE.veil, enabled: false } }));
  assert.ok(!a.buffer.equals(b.buffer), 'seed had no effect on placement');
});

test('two images do not get identically-placed marks', () => {
  const positions = (key) => {
    const r = makeRng('seed', key);
    return [r.next(), r.next(), r.next()].join(',');
  };
  assert.notEqual(positions('image-a'), positions('image-b'));
  assert.equal(positions('image-a'), positions('image-a'), 'placement is not stable per image');
});

test('ownership metadata is written and source metadata is not carried through', async () => {
  // A hostile source: someone else's Artist tag, which must not survive.
  const src = await sharp(await field(800, 600, 120))
    .withExif({ IFD0: { Artist: 'SOMEONE-ELSE', Copyright: 'STOLEN-NOTICE' } })
    .jpeg()
    .toBuffer();

  const { buffer } = await run(src, cfg({ output: { ...BASE.output, widths: [800], formats: ['jpg'], lqip: false } }));
  const meta = await sharp(buffer).metadata();
  assert.ok(meta.exif, 'no EXIF written at all');

  const exif = meta.exif.toString('latin1');
  assert.ok(exif.includes('Chris Rumeau'), 'artist not written');
  assert.ok(exif.includes('Rumeau Design Co.'), 'copyright not written');
  assert.ok(!exif.includes('SOMEONE-ELSE'), 'source Artist tag leaked into output');
  assert.ok(!exif.includes('STOLEN-NOTICE'), 'source Copyright tag leaked into output');
});

test('EXIF orientation is applied before watermarking', async () => {
  // Orientation 6 = rotate 90° CW on display. A 800x400 source must come out
  // 400x800, or the watermark would be laid onto a sideways frame.
  // withMetadata, not withExif: only the former sets the orientation field
  // that sharp's auto-rotate actually reads back.
  const src = await sharp(await field(800, 400, 120))
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const { result } = await run(src, cfg({ output: { ...BASE.output, widths: [400], formats: ['png'], lqip: false } }));
  assert.equal(result.source.width, 400);
  assert.equal(result.source.height, 800);
});

test('an animated source is refused rather than flattened to a still', async () => {
  const gif = makeAnimatedGif({ width: 40, height: 30, frames: 4 });
  assert.ok((await sharp(gif).metadata()).pages > 1, 'fixture is not actually animated');

  await assert.rejects(
    () => run(gif, cfg()),
    (err) => {
      assert.equal(err.skip, true, 'refusal must be a skip, not a build failure');
      assert.match(err.message, /animated/i);
      return true;
    }
  );
});

test('allowAnimated opts back in to flattening', async () => {
  const gif = makeAnimatedGif({ width: 40, height: 30, frames: 4 });
  const { result } = await run(gif, cfg({
    allowAnimated: true,
    output: { ...BASE.output, widths: [40], formats: ['png'], lqip: false },
  }));
  assert.ok(result.variants.length > 0, 'opt-in did not produce output');
});

test('LQIP is a real data URI and far too small to be useful to a thief', async () => {
  const src = await field(1200, 900, 120);
  const { result } = await run(src, cfg({ output: { ...BASE.output, widths: [1200], formats: ['png'], lqip: true } }));
  assert.match(result.lqip, /^data:image\/webp;base64,/);
  const bytes = Buffer.from(result.lqip.split(',')[1], 'base64');
  const m = await sharp(bytes).metadata();
  assert.ok(m.width <= 20, `placeholder is ${m.width}px wide`);
});

test('fingerprint changes when watermark settings change', () => {
  const a = fingerprint('src-hash', BASE);
  const same = fingerprint('src-hash', JSON.parse(JSON.stringify(BASE)));
  const nudged = fingerprint('src-hash', { ...BASE, veil: { ...BASE.veil, edgeOpacity: 0.2 } });
  const other = fingerprint('other-hash', BASE);
  assert.equal(a, same, 'fingerprint is not stable');
  assert.notEqual(a, nudged, 'changing edgeOpacity did not invalidate the cache');
  assert.notEqual(a, other, 'a different source did not change the fingerprint');
});

test('region scoring prefers busy mid-tones over flat extremes', async () => {
  assert.ok(
    scoreRegion({ luma: 0.5, stdev: 0.2 }) > scoreRegion({ luma: 0.5, stdev: 0.005 }),
    'flat region scored at least as well as a textured one'
  );
  assert.ok(
    scoreRegion({ luma: 0.5, stdev: 0.12 }) > scoreRegion({ luma: 0.98, stdev: 0.12 }),
    'blown-out region scored at least as well as a mid-tone'
  );
});

test('analyzer reports region luminance accurately', async () => {
  const half = Buffer.alloc(400 * 200 * 3);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 400; x++) {
      const v = x < 200 ? 30 : 220;
      const i = (y * 400 + x) * 3;
      half[i] = v; half[i + 1] = v; half[i + 2] = v;
    }
  }
  const img = await sharp(half, { raw: { width: 400, height: 200, channels: 3 } }).png().toBuffer();
  const a = await createAnalyzer(img, 400, 200);
  assert.ok(Math.abs(a.region(0, 0, 180, 200).luma - 30 / 255) < 0.05);
  assert.ok(Math.abs(a.region(220, 0, 180, 200).luma - 220 / 255) < 0.05);
  assert.ok(a.global().luma > 0.4 && a.global().luma < 0.6);
});

test('mark placements are reported, inside the frame, and match the config', async () => {
  const src = await field(1600, 1200, 120);
  const { result } = await run(src, cfg());
  const { width: w, height: h } = result.variants[0];

  assert.equal(result.marks.length, BASE.marks.count);
  for (const m of result.marks) {
    assert.ok(BASE.marks.variants.includes(m.text), `unexpected mark text: ${m.text}`);
    assert.ok(BASE.marks.edges.includes(m.edge), `unexpected edge: ${m.edge}`);
    assert.ok(m.left >= 0 && m.top >= 0, `mark starts off-frame at ${m.left},${m.top}`);
    assert.ok(
      m.left + m.width <= w && m.top + m.height <= h,
      `mark overflows the frame: ${m.left + m.width}×${m.top + m.height} vs ${w}×${h}`
    );
    assert.match(m.color, /^#[0-9a-f]{6}$/);
  }
});

test('contact sheet renders every preset plus a detail strip', async () => {
  const dir = await outDir();
  const sheet = await buildContactSheet({
    input: await field(1600, 1200, 120),
    name: 'fixture.jpg',
    config: cfg(),
    outDir: dir,
    panelWidth: 240,
  });

  const meta = await sharp(sheet).metadata();
  assert.equal(meta.format, 'png');
  // 6 presets in a 3-wide grid, so two rows of panels plus header and strip.
  assert.ok(meta.width >= 240 * 3, `sheet too narrow: ${meta.width}`);
  assert.ok(meta.height > 240 * 2, `sheet too short to hold two rows: ${meta.height}`);

  // The working directory of intermediate panel renders must not survive.
  const left = await fs.readdir(dir);
  assert.equal(left.filter((f) => f.startsWith('panels-')).length, 0, 'temp panel dir leaked');
});

test.after(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});
