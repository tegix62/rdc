/*
  One-off diagnostic, not a kept test: drives a real Chromium against
  https://rumeaudesign.co/contact, walks the form to step 4, and dumps the
  actual computed geometry around the budget slider.

  Two rounds so far, two different overlaps:

    round 1  numbers overlapped the TRACK - a margin-top on the label row
             was collapsing through .budget-slider's top edge instead of
             creating space inside it.
    round 2  fixing that (display:flow-root) pushed the numbers below the
             track, straight into the "Not sure yet" checkbox underneath -
             .budget-slider still declared a fixed height sized for the
             track/thumbs alone, so it never grew to contain the label row
             now properly inside it.

  Both were real, both were confirmed live on the real page by this script,
  and neither was visible from reading the CSS alone - "the rule text is
  correct" is not the same claim as "the rendered boxes don't collide",
  which is why this checks THREE gaps rather than trusting the fix by
  inspection: track-to-labels, and now labels-to-the-next-field too.

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
console.log('.budget-slider__handles   ', JSON.stringify(await box('.budget-slider__handles')));
console.log('.budget-slider__track     ', JSON.stringify(await box('.budget-slider__track')));
console.log('.budget-slider__labels    ', JSON.stringify(await box('.budget-slider__labels')));
console.log('.contact-form__checkbox   ', JSON.stringify(await box('.contact-form__checkbox')));

await page.screenshot({ path: 'budget-slider-live.png', clip: { x: 0, y: 0, width: 900, height: 900 } });

// Two gaps, because both have collided before: track-vs-labels (round 1) and
// labels-vs-the-checkbox-underneath (round 2).
const trackBox = await box('.budget-slider__track');
const labelsBox = await box('.budget-slider__labels');
const checkboxBox = await box('.contact-form__checkbox');

const trackOverlap = labelsBox.rect.y < trackBox.rect.y + trackBox.rect.height;
const checkboxOverlap = checkboxBox && labelsBox.rect.y + labelsBox.rect.height > checkboxBox.rect.y;

console.log(
  `\nOVERLAP (track/labels):    ${trackOverlap ? 'YES - labels row starts above the track\'s bottom edge' : 'no'}`,
);
console.log(
  `OVERLAP (labels/checkbox): ${checkboxOverlap ? 'YES - the "Not sure yet" checkbox starts above the labels row\'s bottom edge' : 'no'}`,
);

const failed = trackOverlap || checkboxOverlap;
await browser.close();
process.exit(failed ? 1 : 0);
