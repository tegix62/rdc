/*
  One-off diagnostic, not a kept test: drives a REAL browser against the
  live case study pages and reports what every <video> element is actually
  doing.

  Round 2 lesson: headless test Chromium waves autoplay through, so the
  first version of this script "confirmed" autoplay while Chris's desktop
  Chrome refused it. This version runs headed (under xvfb) and prefers the
  branded Chrome channel, so the real autoplay policy applies - and when
  play() is refused it captures Chrome's actual rejection instead of
  swallowing it the way the site code (correctly) does.

  It also behaves like a visitor: snapshot on load, then scroll each
  autoplay video into view and snapshot again, because the site now starts
  and stops autoplay from an IntersectionObserver.

  Run from GitHub Actions (this repo's own sandbox cannot reach the public
  internet). Needs xvfb-run for the headed browser.

  Usage: node scripts/diagnose-live-videos.mjs [url ...]
*/
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://rumeaudesign.co/work/dumpstat', 'https://rumeaudesign.co/work/two-point-oh'];

/*
  Round 3 lesson: Playwright quietly launches Chromium with
  --autoplay-policy=no-user-gesture-required, so round 2's "headed, real
  policy" run was still lenient - it measured Playwright's policy, not
  Chrome's. ignoreDefaultArgs strips that flag (a no-op if a Playwright
  version doesn't set it), and the command line is printed from /proc so
  the log PROVES which policy actually applied instead of asserting it.
*/
const STRIP = ['--autoplay-policy=no-user-gesture-required'];

const launch = async () => {
  let b;
  try {
    b = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: STRIP });
    console.log('browser: branded Chrome, headed, autoplay-policy flag stripped');
  } catch {
    b = await chromium.launch({ headless: false, ignoreDefaultArgs: STRIP });
    console.log('browser: bundled Chromium, headed, autoplay-policy flag stripped');
  }
  try {
    const cmd = execSync(
      "ps ax -o command | grep -E '(chrome|chromium)' | grep -v grep | head -1",
      { encoding: 'utf8' },
    );
    console.log(`launched command line:\n  ${cmd.trim()}`);
    console.log(`autoplay flag present: ${cmd.includes('autoplay-policy') ? 'YES - STILL LENIENT' : 'no - real policy applies'}`);
  } catch {
    console.log('(could not read the browser command line)');
  }
  return b;
};

const snapshot = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('video')].map((v) => ({
      src: (v.currentSrc || '').split('/').pop(),
      readyState: v.readyState,
      paused: v.paused,
      muted: v.muted,
      autoplayAttr: v.hasAttribute('autoplay'),
      inViewport: (() => {
        const r = v.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      })(),
      time: v.currentTime,
    })),
  );

const browser = await launch();

for (const url of urls) {
  console.log(`\n===================== ${url} =====================`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => console.log(`  [page console] ${m.type()}: ${m.text()}`));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log(`HTTP ${response?.status()}  title: ${await page.title()}`);

  await page.waitForTimeout(2500);
  console.log('\n-- on load (900px viewport, no scrolling) --');
  console.log(JSON.stringify(await snapshot(page), null, 1));

  // Scroll like a visitor: bring the first autoplay video into view.
  const scrolled = await page.evaluate(() => {
    const v = document.querySelector('video[autoplay]');
    if (!v) return false;
    v.scrollIntoView({ block: 'center' });
    return true;
  });
  if (scrolled) {
    await page.waitForTimeout(2500);
    console.log('\n-- after scrolling an autoplay video into view --');
    console.log(JSON.stringify(await snapshot(page), null, 1));
  } else {
    console.log('\n(no autoplay videos on this page - skipping the scroll pass)');
  }

  // The decisive measurement: call play() the way the site's observer does,
  // but KEEP the rejection. NotAllowedError means the autoplay policy said
  // no and names why-shaped territory; anything else is a different bug.
  const attempts = await page.evaluate(async () => {
    const out = [];
    for (const v of document.querySelectorAll('video[autoplay]')) {
      try {
        await v.play();
        out.push({ src: (v.currentSrc || '').split('/').pop(), played: true, muted: v.muted });
      } catch (e) {
        out.push({
          src: (v.currentSrc || '').split('/').pop(),
          played: false,
          muted: v.muted,
          errorName: e.name,
          errorMessage: String(e.message).slice(0, 300),
        });
      }
    }
    return out;
  });
  console.log('\n-- explicit play() attempts --');
  console.log(JSON.stringify(attempts, null, 1));

  const shot = `videos-${new URL(url).pathname.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`screenshot: ${shot}`);
  await page.close();
}

await browser.close();
