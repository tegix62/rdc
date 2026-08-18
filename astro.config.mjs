import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rumeaudesign.co',
  vite: {
    build: {
      /*
        PageSpeed Insights' "Legacy JavaScript" finding (13 KiB estimated
        savings): Vite/esbuild's default compile target is conservative
        enough to include down-level transforms and small polyfills this
        site's own script - a nav toggle, the ink-mode switch, the contact
        form's step logic - never needs. None of it uses anything exotic;
        there is no reason to pay for compatibility with browsers this studio
        has no reason to still support.

        es2020 rather than esnext: esnext means "assume the latest engine
        available," which can emit syntax that is too new for some visitors
        still on last year's Safari. es2020 is the standard "modern but
        broadly safe" baseline - everything evergreen has supported it for
        years - and is the usual fix recommended for this exact Lighthouse
        finding, not a maximalist "skip all transforms" setting.

        Whether this actually resolves the specific 13 KiB Lighthouse
        flagged is worth confirming with a live re-check after deploy -
        this sandbox cannot run Lighthouse against a real page to verify the
        number moves, only reason about why it should.
      */
      target: 'es2020',
    },
  },
});

/*
  DECIDED: the CSS bundle stays external and cached. It is not inlined.

  This was an open question ("inline for a better PageSpeed score, or leave
  it cached?") with no numbers behind it. The numbers, from a real build on
  18 August 2026 (scripts/debug-css-size.mjs):

    - One shared stylesheet, ~218 KiB raw / ~75 KiB gzipped.
    - All 21 pages on the site link that exact same file.

  Inlining would put ~75 KiB of gzip-equivalent weight into the <head> of
  EVERY page, EVERY time, with no caching possible - HTML is not cached the
  way a fingerprinted CSS file is. Kept external, a visitor pays for it
  ONCE across an entire session; every page after the first is a cache hit
  and costs nothing. Inlining pays that cost again on every navigation.

  That trade only makes sense if visitors overwhelmingly land on one page and
  leave - and this site's own copy actively works against that: internal
  linking, a Portfolio grid meant to be browsed tile to tile, case studies
  that link to related work. Optimizing the CSS strategy for a single-page
  visit while the rest of the site is built for a multi-page one would be
  fixing the wrong metric.

  PageSpeed Insights audits one URL in isolation, which is exactly the frame
  where inlining looks like a win and multi-page caching is invisible to the
  score. Real visitors are not one URL in isolation.

  The textbook middle ground - extract just the above-the-fold CSS per
  template and inline ONLY that, deferring the rest - is the right answer
  IF the render-blocking cost of this specific file turns out to matter in
  practice. It needs tooling this repo does not have yet (a critical-CSS
  extractor, per-template) and is worth building only if a real Lighthouse
  trace shows the full stylesheet is actually costing meaningful render time
  on a real deploy - not assumed from the file size alone.

  ---

  TRIED AND REVERTED, 18 AUGUST 2026: deferring WITHOUT the critical-CSS step.

  A real PageSpeed run did arrive, flagging this exact file as render-blocking
  for ~1,410 ms, so the "middle ground" above got attempted - but only its
  second half. The built <link> was rewritten post-build to
  `rel="preload" as="style"` with an onload handler swapping rel back, plus a
  <noscript> fallback. No critical CSS was extracted or inlined first.

  It deployed and worked mechanically. The next PageSpeed run measured
  Cumulative Layout Shift 1.001 on the homepage; "poor" begins at 0.25.

  That outcome is inherent to the technique when the whole stylesheet is
  deferred, not a defect in the implementation. Nothing styles the first
  paint, so the page renders in browser default styles - then global.css
  arrives and the nav, the type scale, and every layout container resolve at
  once, moving essentially the entire viewport.

  The trade was backwards. CLS is a Core Web Vital and feeds ranking.
  "Render-blocking requests" is an advisory diagnostic that does not, and its
  estimated saving models a cold-cache single-page visit - the frame this
  whole comment block already explains is the wrong one for this site.

  So the conclusion is unchanged and now has evidence behind it: the
  stylesheet loads blocking. The ONLY route to deferring it is to inline
  above-the-fold CSS per template FIRST, so first paint is already correct
  and the deferred remainder is invisible. scripts/test-css-blocking.mjs
  fails the build if the link stops being a plain blocking one, so this has
  to be a deliberate decision rather than something that creeps back.
*/
