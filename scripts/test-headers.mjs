/*
  public/_headers, checked against the BUILT copy in dist/ - not the source
  file - because what actually ships is whatever Astro's static-file copy
  step produced, and that step is exactly the kind of thing that could
  someday be reconfigured to skip `public/` or rename it.

  Cloudflare's own format: a path pattern line, followed by one or more
  indented "Header-Name: value" lines, blank lines and comments allowed
  between blocks. There is no official validator to call out to, so this
  checks the properties that would actually break something if wrong:
  every header line is indented under a path, every path is a real pattern
  (not empty), and the specific rules this file exists for are present.

  Usage: node scripts/test-headers.mjs [dir]     (default: dist)
*/
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.resolve(root, process.argv[2] ?? 'dist');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures += 1;
};

let text;
try {
  text = await readFile(path.join(dir, '_headers'), 'utf8');
} catch {
  console.log(`FAIL  no _headers file at ${path.relative(root, dir)}/_headers - run \`npm run build\` first`);
  process.exit(1);
}

const lines = text.split('\n');

// --- structural validity -------------------------------------------------
// Every non-blank, non-comment, non-indented line must be a path pattern;
// every indented line must immediately follow a path (not float on its own,
// which Cloudflare silently ignores rather than erroring on - so a
// misplaced header line fails open, invisibly, unless something checks).
let currentPath = null;
const orphanHeaders = [];
for (const raw of lines) {
  const line = raw.replace(/\r$/, '');
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (/^\s/.test(line)) {
    if (!currentPath) orphanHeaders.push(line.trim());
    continue;
  }
  currentPath = line.trim();
}
check('no header line is orphaned outside a path block', orphanHeaders.length === 0, orphanHeaders.join(', '));

// --- the rules this file exists to state --------------------------------
check(
  'hashed build assets are cached forever',
  /\/_astro\/\*[\s\S]{0,120}max-age=31536000[\s\S]{0,40}immutable/.test(text),
  'expected /_astro/* with a one-year immutable Cache-Control',
);
check(
  'HTML is explicitly NOT cached client-side',
  /^\/\*\s*$/m.test(text) && /no-cache/.test(text),
  'a catch-all /* rule with no-cache - stale HTML after an auto-deploy is the failure this guards',
);
// The opposite mistake would be worse than no file at all: caching HTML
// aggressively would mean a visitor keeps seeing pre-fix content for as long
// as the browser trusts the header, on a site that now auto-deploys within
// minutes of a Sanity publish.
check(
  'HTML is not ALSO given a long max-age by a later, more specific rule',
  !/^\/\*[\s\S]{0,200}max-age=(?!0)\d/m.test(text.replace(/max-age=31536000/g, '')),
  'a stray long max-age on the catch-all would silently override the no-cache intent',
);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
