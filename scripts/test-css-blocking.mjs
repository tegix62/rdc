/*
  Asserts every built page either loads its stylesheet blocking (the
  original safe default) OR inlines critical CSS and defers the rest (the
  performance-safe alternative).

  WHY THIS GUARD EXISTS

  On 18 August 2026 the stylesheet was deferred WITHOUT critical CSS
  inlining. CLS went to 1.001 (poor). The page painted in browser default
  styles, then 75 KiB gzip of CSS arrived and moved every element.

  WHEN DEFERRING IS CORRECT

  Only after above-the-fold CSS is extracted per template and inlined, so
  the first paint is already correct and the deferred remainder changes
  nothing visible. scripts/inline-critical-css.mjs does this with critters
  as a post-build step.

  WHAT THIS CHECKS

  For each HTML file, exactly one of these must be true:

    A) A plain blocking <link rel="stylesheet"> (the original approach)
    B) An inline <style> with meaningful critical CSS AND a deferred
       external stylesheet (the critters approach)

  Deferring without inlining is the thing this guard blocks - that is the
  path that caused the CLS regression.

  Usage: node scripts/test-css-blocking.mjs [dist]
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] ?? 'dist';

const htmlFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.html')) htmlFiles.push(full);
  }
};
walk(dist);

let failures = 0;
let blocking = 0;
let criticalInlined = 0;

// Minimum bytes of inline CSS to count as "meaningful critical CSS". The
// Layout already has a small is:global <style> block for img drag
// prevention (~200 bytes). Real critical CSS is thousands of bytes.
const MIN_CRITICAL_CSS_BYTES = 500;

for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8');

  // Strip <noscript> blocks - critters puts a fallback <link> inside one,
  // and that's correct. Only the live, outside-noscript markup matters.
  const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');

  const hasBlockingLink = /<link rel="stylesheet" href="[^"]+">/.test(outsideNoscript);

  const isDeferred =
    /rel="preload"\s+as="style"/.test(outsideNoscript) ||
    /as="style"\s+rel="preload"/.test(outsideNoscript) ||
    /<link[^>]+rel="stylesheet"[^>]+media="print"/.test(outsideNoscript) ||
    /<link[^>]+rel="stylesheet"[^>]+onload=/.test(outsideNoscript);

  // Measure inline <style> content, excluding tiny utility blocks.
  const styleBlocks = [...outsideNoscript.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  const totalInlineCSS = styleBlocks.reduce((sum, m) => sum + m[1].length, 0);
  const hasCriticalCSS = totalInlineCSS >= MIN_CRITICAL_CSS_BYTES;

  if (hasBlockingLink && !isDeferred) {
    // Path A: plain blocking stylesheet. Always fine.
    blocking++;
  } else if (isDeferred && hasCriticalCSS) {
    // Path B: deferred external + inlined critical CSS. The safe upgrade.
    criticalInlined++;
  } else if (isDeferred && !hasCriticalCSS) {
    // Deferred WITHOUT critical CSS - the CLS regression.
    failures++;
    console.log(
      `FAIL  ${f} defers its stylesheet without inlining critical CSS ` +
        `(${totalInlineCSS} bytes of inline CSS, need >= ${MIN_CRITICAL_CSS_BYTES})`,
    );
  } else {
    // No stylesheet at all.
    failures++;
    console.log(`FAIL  ${f} has no stylesheet link`);
  }
}

console.log();
if (blocking) console.log(`${blocking} page(s) load their stylesheet blocking`);
if (criticalInlined) console.log(`${criticalInlined} page(s) inline critical CSS and defer the rest`);
console.log(`${htmlFiles.length} page(s) total`);
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
process.exit(failures ? 1 : 0);
