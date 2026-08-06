#!/usr/bin/env node
/**
 * Portfolio watermarking pipeline.
 *
 *   node scripts/watermark.mjs --source local --in ~/masters
 *   node scripts/watermark.mjs --source sanity
 *   node scripts/watermark.mjs --preview ~/masters/hero.jpg
 *
 * Run `--help` for the full flag list.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

import { listLocal, slugify } from './lib/sources/local.mjs';
import { listSanity } from './lib/sources/sanity.mjs';
import { processImage } from './lib/process.mjs';
import { buildContactSheet } from './lib/sheet.mjs';
import { fingerprint, hashBuffer, loadManifest, saveManifest, isFresh } from './lib/manifest.mjs';

const MANIFEST = '.watermark/manifest.json';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage(0);

  const config = await loadConfig(args.config ?? 'watermark.config.json', args);

  if (args.preview) return preview(args.preview, config, args);
  if (args.sheets) return previewSet(args, config);

  const outDir = path.resolve(args.out ?? config.output.dir);
  await fs.mkdir(outDir, { recursive: true });

  const items = await collect(args, config);
  if (!items.length) {
    console.log('No source images found. Nothing to do.');
    return;
  }

  const filtered = args.only
    ? items.filter((i) => i.key.toLowerCase().includes(args.only.toLowerCase()))
    : items;

  console.log(`${filtered.length} source image(s) → ${path.relative(process.cwd(), outDir) || '.'}`);
  if (args.dryRun) {
    for (const i of filtered) console.log(`  would process ${i.key} → ${i.slug}`);
    return;
  }

  const manifest = await loadManifest(MANIFEST);
  const results = [];
  let built = 0;
  let skipped = 0;
  let skippedIntentionally = 0;
  let failed = 0;

  await pool(filtered, args.concurrency, async (item) => {
    try {
      // The cache check needs the source bytes anyway, so read first and
      // hash — the expensive part we are avoiding is the compositing, not I/O.
      const buf = await item.read();
      const fp = fingerprint(hashBuffer(buf), config);
      const cached = manifest.entries[item.key];

      if (!args.force && (await isFresh(cached, fp, outDir))) {
        results.push(cached.result);
        skipped++;
        process.stdout.write(`  · ${item.key} (cached)\n`);
        return;
      }

      const result = await processImage({
        key: item.key, slug: item.slug, input: buf, config, outDir,
      });
      manifest.entries[item.key] = { fingerprint: fp, updated: new Date().toISOString(), result };
      results.push(result);
      built++;
      const px = `${result.source.width}×${result.source.height}`;
      process.stdout.write(`  ✓ ${item.key} (${px} → ${result.variants.length} files)\n`);
    } catch (err) {
      // A skip is a deliberate refusal (an animated source), not a failure —
      // it must not fail the build or it would block every deploy.
      if (err.skip) {
        skippedIntentionally++;
        process.stdout.write(`  – ${item.key}: ${err.message}\n`);
        return;
      }
      failed++;
      process.stderr.write(`  ✗ ${item.key}: ${err.message}\n`);
    }
  });

  await saveManifest(MANIFEST, manifest);
  await writeMap(config, results, outDir, args);

  const parts = [`${built} built`, `${skipped} cached`];
  if (skippedIntentionally) parts.push(`${skippedIntentionally} left untouched`);
  if (failed) parts.push(`${failed} failed`);
  console.log(`\nDone — ${parts.join(', ')}.`);
  if (failed) process.exitCode = 1;
}

/**
 * Render one image so settings can be judged before committing to a full run.
 *
 * `--sheet` is the mode worth using: it renders the same image under several
 * strengths side by side and adds 100% crops of each covert mark, which is the
 * only way to actually see whether a mark is legible — at contact-sheet scale
 * they are, by design, invisible.
 */
async function preview(file, config, args) {
  const outDir = path.resolve(args.out ?? '.watermark/preview');
  await fs.mkdir(outDir, { recursive: true });
  const stem = slugify(path.basename(file).replace(/\.[^.]+$/, ''));

  const buf = await fs.readFile(file);

  if (args.sheet) {
    const dest = await writeSheet({
      input: buf, name: path.basename(file), stem, config, outDir, args,
    });
    console.log(`contact sheet → ${path.relative(process.cwd(), dest)}`);
    return;
  }

  const cfg = {
    ...config,
    output: { ...config.output, widths: [args.width ?? 1600], formats: ['jpg'], lqip: false },
  };
  const result = await processImage({
    key: path.basename(file),
    slug: `${stem}-preview`,
    input: buf, config: cfg, outDir,
  });
  for (const v of result.variants) {
    console.log(`preview → ${path.join(path.relative(process.cwd(), outDir), v.file)}  (${v.width}×${v.height}, ${(v.bytes / 1024).toFixed(0)} KB)`);
  }
  for (const m of result.marks) {
    console.log(`  mark: "${m.text}" on the ${m.edge} edge at ${m.left},${m.top} (${m.width}×${m.height}px)`);
  }
}

async function writeSheet({ input, name, stem, config, outDir, args }) {
  const sheet = await buildContactSheet({
    input, name, config, outDir, panelWidth: args.width ?? 620,
  });
  const dest = path.join(outDir, `${stem}-sheet.png`);
  await fs.writeFile(dest, sheet);
  return dest;
}

/**
 * Contact sheets for the first N images of whatever source is configured.
 *
 * This is the mode that answers "what will this look like on my actual work"
 * without anything installed locally: run it in CI against Sanity and the
 * sheets come back as a downloadable artifact.
 */
async function previewSet(args, config) {
  const outDir = path.resolve(args.out ?? '.watermark/preview');
  await fs.mkdir(outDir, { recursive: true });

  const items = await collect(args, config);
  const filtered = args.only
    ? items.filter((i) => i.key.toLowerCase().includes(args.only.toLowerCase()))
    : items;

  const limit = Number(args.sheets) || 6;
  const chosen = filtered.slice(0, limit);
  if (!chosen.length) {
    console.log('No source images found. Nothing to preview.');
    return;
  }

  console.log(`Building ${chosen.length} contact sheet(s) → ${path.relative(process.cwd(), outDir)}`);
  for (const item of chosen) {
    try {
      const dest = await writeSheet({
        input: await item.read(), name: item.key, stem: item.slug, config, outDir, args,
      });
      console.log(`  ✓ ${item.key} → ${path.basename(dest)}`);
    } catch (err) {
      if (err.skip) console.log(`  – ${item.key}: ${err.message}`);
      else console.error(`  ✗ ${item.key}: ${err.message}`);
    }
  }
}

async function collect(args, config) {
  const source = args.source ?? 'local';
  if (source === 'sanity') {
    // Flags beat config, config beats env — the project id and dataset are
    // public (they already ship in the browser bundle), only the token isn't.
    return listSanity({
      projectId: args.projectId ?? config.sanity?.projectId,
      dataset: args.dataset ?? config.sanity?.dataset,
      token: args.token,
      query: config.sanity?.query,
    });
  }
  if (source === 'local') {
    return listLocal(args.in ?? config.input?.dir ?? 'originals');
  }
  throw new Error(`unknown --source "${source}" (expected local or sanity)`);
}

/**
 * Emit the lookup the site renders from: key → slug, dimensions, LQIP and the
 * list of generated files. The Astro component reads this, so the templates
 * never need to guess a filename.
 */
async function writeMap(config, results, outDir, args) {
  const mapFile = args.map ?? config.output.mapFile;
  if (!mapFile) return;
  const dest = path.resolve(mapFile);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  const publicBase = config.output.publicBase ?? guessPublicBase(outDir);
  const images = {};
  for (const r of results.sort((a, b) => a.key.localeCompare(b.key))) {
    images[r.key] = { ...r, basePath: publicBase };
  }

  await fs.writeFile(
    dest,
    JSON.stringify({ generatedAt: new Date().toISOString(), basePath: publicBase, images }, null, 2) + '\n'
  );
  console.log(`map → ${path.relative(process.cwd(), dest)} (${Object.keys(images).length} entries)`);
}

/** `public/portfolio` is served at `/portfolio` — strip the leading `public`. */
function guessPublicBase(outDir) {
  const rel = path.relative(process.cwd(), outDir).split(path.sep);
  const i = rel.indexOf('public');
  const parts = i === -1 ? rel : rel.slice(i + 1);
  return '/' + parts.join('/');
}

async function loadConfig(file, args) {
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`config not found: ${file}`);
    throw new Error(`could not parse ${file}: ${err.message}`);
  }
  delete raw.$schema;

  raw.output ??= {};
  raw.output.widths ??= [1280];
  raw.output.formats ??= ['webp'];
  raw.output.dir ??= 'public/portfolio';
  if (args.noVeil && raw.veil) raw.veil.enabled = false;
  if (args.noMarks && raw.marks) raw.marks.enabled = false;

  for (const [k, v] of Object.entries(raw.identity ?? {})) {
    if (typeof v === 'string') raw.identity[k] = v.replace('{year}', String(new Date().getFullYear()));
  }
  return raw;
}

/** Bounded-concurrency map. sharp releases the event loop, so this scales. */
async function pool(items, limit, fn) {
  const n = Math.max(1, Math.min(limit || 4, 16));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) await fn(items[cursor++]);
  });
  await Promise.all(workers);
}

function parseArgs(argv) {
  const out = { concurrency: 4 };
  const alias = { h: 'help', i: 'in', o: 'out', c: 'config', f: 'force', j: 'concurrency' };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('-')) continue;
    a = a.replace(/^--?/, '');
    const key = alias[a] ?? camel(a);
    const flags = ['help', 'force', 'dryRun', 'noVeil', 'noMarks', 'sheet'];
    if (flags.includes(key)) out[key] = true;
    else out[key] = argv[++i];
  }
  if (out.concurrency) out.concurrency = Number(out.concurrency) || 4;
  if (out.width) out.width = Number(out.width);
  return out;
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function usage(code) {
  console.log(`
Portfolio watermarking

  --source <local|sanity>   where originals come from        (default: local)
  --in, -i <dir>            local source directory           (default: originals)
  --out, -o <dir>           output directory                 (default: config output.dir)
  --config, -c <file>       config file                (default: watermark.config.json)
  --map <file>              where to write the image map     (default: config mapFile)
  --only <substring>        process matching keys only
  --preview <file>          render one image and stop
  --sheet                   with --preview: a labelled comparison sheet plus
                            100% crops of each edge mark
  --sheets <n>              contact sheets for the first n images of the
                            source, instead of a full run
  --width <px>              preview long edge   (default: 1600, or 620 a panel
                            with --sheet)
  --no-veil / --no-marks    disable one layer (useful for A/B)
  --force, -f               ignore the cache and rebuild
  --dry-run                 list what would be processed
  --concurrency, -j <n>     parallel images                  (default: 4)

Sanity mode reads SANITY_PROJECT_ID, SANITY_DATASET and SANITY_READ_TOKEN.
`);
  process.exitCode = code;
}

main().catch((err) => {
  console.error(`\nwatermark: ${err.message}`);
  process.exitCode = 1;
});
