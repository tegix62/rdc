/*
  One-off diagnostic, not a kept test: drives a real Chromium against
  https://rumeaudesign.co/contact, walks the form to step 4, and dumps the
  actual computed geometry of the budget slider - because Chris reported the
  numbers still overlapping the track AFTER check-contact-live.mjs confirmed
  the fixed CSS rule text is present in the shipped stylesheet.

  That gap matters: confirming the RULE TEXT is present is not the same as
  confirming it WINS the cascade and produces non-overlapping layout. This
  renders the real page with a real browser and measures the real boxes,
  which is the only way to tell "the fix isn't live" apart from "the fix is
  live and is not what I thought it was."

  Run from GitHub Actions (needs `npm install playwright && npx playwright
  install chromium` first - this repo's own sandbox cannot reach the public
  internet).

  Usage: node scripts/debug-budget-slider-live.mjs [url]
*/
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'https://rumeaudesign.co/contact';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
/*
  domcontentloaded, not networkidle: the Turnstile widget on this page keeps
  a connection open indefinitely (it polls / holds a socket for its
  challenge), so "networkidle" never fires and the first run of this script
  timed out at 30s waiting for a quiet network that was never coming.
*/
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#contact-form', { state: 'visible' });

// Step 1
await page.fill('input[name="name"]', 'Diagnostic Check');
await page.fill('input[name="email"]', 'diagnostic@example.com');
await page.click('.contact-form__next');

// Step 2
await page.fill('textarea[name="businessDescription"]', 'Testing.');
await page.fill('textarea[name="goals"]', 'Testing.');
await page.click('.contact-form__next');

// Step 3 - the scale. Click value 5.
await page.click('.contact-form__scale-option input[value="5"]');
await page.click('.contact-form__next');

// Now on step 4, where the budget slider lives.
await page.waitForSelector('.budget-slider', { state: 'visible' });

const box = async (sel) => {
  const el = await page.$(sel);
  if (!el) return null;
  const rect = await el.boundingBox();
  const styles = await el.evaluate((node) => {
    const cs = getComputedStyle(node);
    return { marginTop: cs.marginTop, position: cs.position, top: cs.top, height: cs.height };
  });
  return { rect, styles };
};

console.log('\n.budget-slider            ', JSON.stringify(await box('.budget-slider')));
console.log('.budget-slider__track     ', JSON.stringify(await box('.budget-slider__track')));
console.log('.budget-slider__labels    ', JSON.stringify(await box('.budget-slider__labels')));
console.log(
  '.budget-slider__value--low',
  JSON.stringify(await box('.budget-slider__value--low')),
);

// The actual cascade-winning rule, straight from the browser rather than
// grepped from a stylesheet - this is what tells "present in the file" apart
// from "present and winning."
const winningRule = await page.evaluate(() => {
  const el = document.querySelector('.budget-slider__labels');
  const cs = getComputedStyle(el);
  return { marginTop: cs.marginTop };
});
console.log('\ngetComputedStyle(.budget-slider__labels).marginTop =', winningRule.marginTop);

await page.screenshot({ path: 'budget-slider-live.png', clip: { x: 0, y: 0, width: 900, height: 900 } });

// Overlap check: does the labels row's top edge sit above the track's bottom edge?
const trackBox = await box('.budget-slider__track');
const labelsBox = await box('.budget-slider__labels');
const overlap = labelsBox.rect.y < trackBox.rect.y + trackBox.rect.height;
console.log(`\nOVERLAP: ${overlap ? 'YES - labels row starts above the track\'s bottom edge' : 'no - labels row is fully below the track'}`);

await browser.close();
process.exit(overlap ? 1 : 0);
