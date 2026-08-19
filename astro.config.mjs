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
  CSS STRATEGY: critical CSS inlined, full bundle deferred.

  The full stylesheet (~218 KiB raw / ~75 KiB gzip) is shared by all 21
  pages. It was kept external and blocking until a real PageSpeed run
  measured 1,390 ms of render-blocking time on it.

  HISTORY

  First attempt (18 August 2026): deferred the stylesheet WITHOUT inlining
  critical CSS first. CLS went to 1.001 (poor) because first paint was
  unstyled. Reverted the same day.

  Current approach: scripts/inline-critical-css.mjs runs critters after
  `astro build`. For each page, critters reads the HTML, finds which CSS
  rules its elements use, inlines them in a <style> in the <head>, and
  changes the external <link> to media="print" + onload so it loads without
  blocking paint. First paint is already correct from the inline styles, so
  the deferred sheet changes nothing visible and CLS stays at zero.

  The full external stylesheet is still cached (fingerprinted, immutable,
  shared across all pages). Multi-page visitors pay for it once. The inline
  critical CSS is a few KB per page — the cost of a styled first paint on a
  cold single-page visit.

  scripts/test-css-blocking.mjs accepts either pattern: plain blocking
  stylesheet OR inlined critical CSS + deferred external sheet. Deferring
  WITHOUT inlining is the one thing the guard blocks.
*/
