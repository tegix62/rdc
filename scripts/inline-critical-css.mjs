/*
  Post-build: inline critical CSS and preload fonts.

  Two things, because they attack the same dependency chain:

    HTML (210ms) → CSS (446ms) → fonts (703-839ms)

  1. CRITICAL CSS INLINING (critters)
     Extracts above-the-fold CSS into an inline <style> and defers the
     external stylesheet via media="print" + onload. First paint is already
     styled, so CLS stays at zero while the render-blocking time goes away.

  2. FONT PRELOADING
     The @font-face rules that declare font URLs live inside the CSS file.
     Without preloads, the browser cannot start fetching fonts until it has
     parsed the CSS, built the CSSOM, built the render tree, and matched
     @font-face rules to actual text — even with inlined critical CSS, that
     still takes time. A <link rel="preload"> in the <head> starts the
     fetch immediately during HTML tokenisation, before any of that.

     Only the Latin-range subsets are preloaded — this is an English site,
     and the Korean/Cyrillic/Greek subsets in Gothic A1 are never fetched.

  Runs after `astro build` as part of `npm run build`.
*/
import Critters from 'critters';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] ?? 'dist';

// ── Find HTML and CSS files ─────────────────────────────────────────────

const htmlFiles = [];
const cssFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.html')) htmlFiles.push(full);
    else if (entry.endsWith('.css')) cssFiles.push(full);
  }
};
walk(dist);

// ── Font preloading ─────────────────────────────────────────────────────

/*
  Finds font URLs that serve the Latin unicode range — the only range this
  English-language site actually downloads.

  The Latin range always includes U+0000-007F (Basic Latin / ASCII). A
  unicode-range that contains that span covers the characters every page on
  this site uses. Checking for U+0041 (A) or U+0061 (a) within any range
  entry is enough.
*/
function coversBasicLatin(unicodeRange) {
  if (!unicodeRange) return false;
  for (const part of unicodeRange.split(',')) {
    const trimmed = part.trim();
    // Single codepoint: U+0041
    const single = trimmed.match(/^U\+([0-9a-f]+)$/i);
    if (single) {
      const cp = parseInt(single[1], 16);
      if (cp >= 0x0041 && cp <= 0x007a) return true;
      continue;
    }
    // Range: U+0000-007F
    const range = trimmed.match(/^U\+([0-9a-f]+)-([0-9a-f]+)$/i);
    if (range) {
      const lo = parseInt(range[1], 16);
      const hi = parseInt(range[2], 16);
      if (lo <= 0x0061 && hi >= 0x0041) return true;
    }
    // Wildcard: U+00?? — expand the range.
    const wildcard = trimmed.match(/^U\+([0-9a-f]*)\?+$/i);
    if (wildcard) {
      const prefix = wildcard[1] || '';
      const lo = parseInt(prefix + '0'.repeat(trimmed.length - 2 - prefix.length), 16);
      const hi = parseInt(prefix + 'f'.repeat(trimmed.length - 2 - prefix.length), 16);
      if (lo <= 0x0061 && hi >= 0x0041) return true;
    }
  }
  return false;
}

/*
  Extract font URLs to preload from the built CSS files.

  Parses @font-face blocks, keeps only woff2 sources whose unicode-range
  covers Basic Latin. Returns de-duplicated absolute paths from the site
  root (e.g. /_astro/inter-tight-latin-wght-normal.DX-nOvPD.woff2).
*/
function findLatinFontUrls() {
  const urls = new Set();

  for (const cssPath of cssFiles) {
    const css = readFileSync(cssPath, 'utf8');
    const cssDir = path.dirname(cssPath);

    // Match each @font-face block.
    const faceBlocks = css.matchAll(/@font-face\s*\{([^}]+)\}/g);
    for (const [, block] of faceBlocks) {
      // Extract unicode-range.
      const rangeMatch = block.match(/unicode-range:\s*([^;]+)/i);
      const unicodeRange = rangeMatch ? rangeMatch[1].trim() : null;

      if (!coversBasicLatin(unicodeRange)) continue;

      // Extract the woff2 URL from the src.
      const srcMatch = block.match(/url\(([^)]+\.woff2)\)/i);
      if (!srcMatch) continue;

      // Resolve relative URL to the dist root.
      const fontFile = srcMatch[1].replace(/^['"]|['"]$/g, '');
      let fontPath;
      if (fontFile.startsWith('/')) {
        fontPath = path.join(dist, fontFile);
      } else {
        fontPath = path.resolve(cssDir, fontFile);
      }

      // Convert to site-relative URL.
      const siteRelative = '/' + path.relative(dist, fontPath).replace(/\\/g, '/');
      urls.add(siteRelative);
    }
  }

  return [...urls];
}

/*
  Inject <link rel="preload"> tags for fonts into the <head> of an HTML
  string. Placed right after the opening <head> tag (and any charset meta)
  so the browser encounters them as early as possible.
*/
function injectFontPreloads(html, fontUrls) {
  if (fontUrls.length === 0) return html;

  const preloads = fontUrls
    .map(
      (url) =>
        `<link rel="preload" as="font" type="font/woff2" crossorigin href="${url}">`,
    )
    .join('\n');

  // Insert after <meta charset="..."> if present, otherwise after <head>.
  const charsetMatch = html.match(/<meta\s+charset="[^"]*"\s*\/?>/i);
  if (charsetMatch) {
    const insertAt = charsetMatch.index + charsetMatch[0].length;
    return html.slice(0, insertAt) + '\n' + preloads + html.slice(insertAt);
  }
  return html.replace(/<head>/i, '<head>\n' + preloads);
}

// ── Run ─────────────────────────────────────────────────────────────────

const fontUrls = findLatinFontUrls();
console.log(
  `[critical-css] Found ${fontUrls.length} Latin-range font file(s) to preload` +
    (fontUrls.length ? ':\n  ' + fontUrls.join('\n  ') : ''),
);

const critters = new Critters({
  path: dist,
  preload: 'media',
  inlineFonts: true,
  compress: true,
  logLevel: 'info',
});

let processed = 0;
let failed = 0;

for (const file of htmlFiles) {
  let html = readFileSync(file, 'utf8');
  try {
    html = await critters.process(html);
    html = injectFontPreloads(html, fontUrls);
    writeFileSync(file, html);
    processed++;
  } catch (err) {
    console.error(`FAIL  ${file}: ${err.message}`);
    failed++;
  }
}

console.log(
  `\n[critical-css] ${processed} of ${htmlFiles.length} page(s) processed` +
    (failed ? `, ${failed} failed` : ''),
);
if (failed) process.exit(1);
