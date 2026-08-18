/*
  One-off diagnostic: confirm the hero <img> conversion (fb2ef0a) reached
  production. Sandbox has no egress to rumeaudesign.co, so this runs inside
  a GitHub Actions job instead. Deleted after use - see
  scripts/debug-css-non-blocking-live.mjs for the same pattern previously.
*/
const res = await fetch('https://rumeaudesign.co/', {
  headers: {'User-Agent': 'Mozilla/5.0 (diagnostic check)'},
});
const html = await res.text();

const commitMatch = html.match(/<meta[^>]+name="build-commit"[^>]+content="([^"]+)"/);
console.log('status:', res.status);
console.log('build-commit:', commitMatch ? commitMatch[1] : '(not found)');

const heroImgMatch = html.match(/<img[^>]+class="statement__bg"[^>]*>/);
console.log('hero <img class="statement__bg">:', heroImgMatch ? heroImgMatch[0] : '(not found)');

const oldBgVar = html.includes('--hero-bg-image');
console.log('old --hero-bg-image inline style still present:', oldBgVar);
