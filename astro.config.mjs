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
*/
