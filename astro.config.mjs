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
