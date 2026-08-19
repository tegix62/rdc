/*
  One-off diagnostic, not a kept test: drives a real Chromium against the
  live case study pages and reports what every <video> element is actually
  doing - because three rounds of "should work" fixes (preload=auto, a
  currentTime nudge, an autoplay retry) have shipped and Chris still sees
  grey boxes and autoplay videos that do not play.

  For each video it dumps:
    - the served markup (which reveals whether the latest build is even live:
      data-force-muted and preload="auto" only exist in the newest commits)
    - the live playback state after settling: readyState, networkState,
      paused, currentSrc, duration, videoWidth/Height, error
    - a direct probe of each source URL from Node: HTTP status, content-type,
      accept-ranges, content-length - the difference between "Chrome chose
      not to load it" and "the URL never answers".

  Run from GitHub Actions (this repo's own sandbox cannot reach the public
  internet).

  Usage: node scripts/diagnose-live-videos.mjs [url ...]
*/
import { chromium } from 'playwright';

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://rumeaudesign.co/work/dumpstat', 'https://rumeaudesign.co/work/two-point-oh'];

const probe = async (src) => {
  try {
    // GET with a range, not HEAD: R2/CDNs can answer HEAD differently from
    // the range GETs the <video> element actually issues.
    const res = await fetch(src, { headers: { Range: 'bytes=0-1023' } });
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      acceptRanges: res.headers.get('accept-ranges'),
      contentRange: res.headers.get('content-range'),
      contentLength: res.headers.get('content-length'),
    };
  } catch (e) {
    return { error: String(e) };
  }
};

const browser = await chromium.launch();

for (const url of urls) {
  console.log(`\n===================== ${url} =====================`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log(`HTTP ${response?.status()}  title: ${await page.title()}`);

  // Give preload, the decode nudge, and the autoplay retry time to act -
  // the retry fires at 500ms, so 5s is generous.
  await page.waitForTimeout(5000);

  const videos = await page.evaluate(() =>
    [...document.querySelectorAll('video')].map((v) => ({
      outerHTMLStart: v.outerHTML.slice(0, 400),
      sources: [...v.querySelectorAll('source')].map((s) => ({ src: s.src, type: s.type })),
      currentSrc: v.currentSrc,
      readyState: v.readyState,
      networkState: v.networkState,
      paused: v.paused,
      muted: v.muted,
      hasAutoplayAttr: v.hasAttribute('autoplay'),
      preload: v.preload,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      hidden: v.hidden,
    })),
  );

  if (!videos.length) {
    console.log('NO <video> elements found on this page.');
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/work/"]')].map((a) => a.getAttribute('href')),
    );
    console.log('work links seen on page:', JSON.stringify([...new Set(links)]));
  }

  for (const [i, v] of videos.entries()) {
    console.log(`\n--- video[${i}] ---`);
    console.log(v.outerHTMLStart);
    const { outerHTMLStart, sources, ...state } = v;
    console.log('state:', JSON.stringify(state, null, 2));
    for (const s of sources) {
      console.log(`source ${s.src} (type="${s.type}")`);
      console.log('  probe:', JSON.stringify(await probe(s.src)));
    }
  }

  const shot = `videos-${new URL(url).pathname.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`screenshot: ${shot}`);
  await page.close();
}

await browser.close();
