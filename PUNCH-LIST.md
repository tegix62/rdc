# Parity punch list: Astro port vs. live Webflow site

Compiled from a structural audit of the live Webflow site (page inventory,
forms, real case-study content) plus a code-level review of the Astro port.
Ordered roughly by impact. Nothing here has been actioned unless marked done.

## Done

- [x] About/Video/Collage/Privacy Policy real content migrated (was showing
  "Content coming soon" - see `WORKLOG-overnight.md` decision #2)
- [x] Footer built out with real logo/social/contact/legal (prior session)
- [x] Work page identity band + homepage full-bleed fixes (prior session)
- [x] Homepage content moved into Sanity - `contactUrl`, `bioText`,
  `checklist`, `proofStats`, closer heading, final CTA heading are all
  editable in Studio now (`WORKLOG-overnight.md` decision #7)
- [x] Case study pages rebuilt with real content for Hug a Mug, DumpStat,
  and Adelante, including 4 new block types (`WORKLOG-overnight.md`
  decision #8). Along the way, fixed Adelante's lorem-ipsum summary and
  wrong hero/logo images, and DumpStat's wrong hero/logo images - these were
  real content bugs on the live Webflow site or in the migration data, not
  new work.
- [x] `work/[slug].astro` now imports the shared `src/components/Sections.astro`
  instead of duplicating the block-rendering switch statement.
- [x] **Migration no longer overwrites Studio edits.** Re-running the content
  migration used to reset hand-edited content back to the JSON snapshot (hit
  three times during the port). It now only fills fields that are still
  empty; anything you've typed in Studio survives. Overwriting is still
  possible but only via a deliberate manual run with the "force" box ticked -
  never automatically (`WORKLOG-overnight.md` decision #9).

- [x] **`/ms-paint` ported** - the last real content gap vs the live Webflow
  site (`WORKLOG-overnight.md` decision #11). Note it carries the live page's
  own "(UNDER CONSTRUCTION)" line; say the word and I'll drop it.
- [x] **Responsive images.** Every image now carries dimensions and a srcset,
  fixing both the layout shift that made scrolling feel worse than Webflow
  and the oversized payloads on phones (decision #10).

## Performance — measured, mostly fixed, one thing needs you

Full numbers and reasoning in `WORKLOG-overnight.md` decisions #20-21.

- [x] Homepage **10,938 KB → 4,445 KB** (−59%), `/portfolio` mobile
  **12,318 KB → 8,021 KB** (−35%), `/merchfolio` desktop −33%. Cause was the
  CDN being asked to *enlarge* small images, plus an animation probe that
  could never detect an animated GIF (it searched 64 bytes for a marker that
  lives past byte 780).
- [x] Reading measure capped: `/video` **141 → 71 characters** a line,
  `/about` 94 → 71. `.prose` had no `max-width` at all.
- [x] Tap targets: the hamburger was 32×32 — smallest control on the site and
  the first one any phone visitor hits. Now 44×44, along with the portfolio
  filter row, print swatches and footer links.
- [x] Smallest text on the site was 11px (homepage tagline on phones). Now 13px.

- [ ] **One source file needs re-exporting — this one is yours.** The homepage
  hero background is an 800×800 file that is **3,981 KB**. No code change fixes
  a 4 MB source; it wants a re-export at a sane quality. Everything else on the
  site is now within reason.
- [ ] **`/portfolio` desktop CLS is 0.4722** (under 0.1 is "good"). This is the
  worst number left and it is precisely the jank you can feel: Isotope lays the
  masonry grid out *after* the page paints, so everything jumps once. Fixing it
  means reserving the grid's height before layout.
- [ ] **`/portfolio` is still ~7.3–8.0 MB** for 68 thumbnails. The rule
  "animated images never go through the resize pipeline" turns out to be too
  absolute — at small widths the re-encode genuinely beats the original, and
  which way it goes depends on the width being asked for. The fix is a
  per-asset, per-width decision made from measured bytes and cached in Sanity.
  Deliberately not attempted at 4am.
- [ ] `/work/adelante-barbell-club` went **446 KB → 1,270 KB** as a side effect
  of fixing the GIF detection: its converted videos started being served. Same
  root cause as the item above, and it is the clearest case for fixing it.

## Dead CMS fields (found by `npm run audit:cms`)

An audit of all 170 schema fields found eight that no template read: editing
them in Studio changed nothing on the site. Asset Type was the one you
noticed; it was not alone, and three of them made an explicit promise in
their description that no code kept.

Four are now wired up:

- [x] `siteSettings.siteTitle` - drives `og:site_name`, the logo's alt text,
  the text fallback when no logo is set, and the copyright line.
- [x] `siteSettings.footerText` - renders as a short line beside the footer
  columns, capped at 28 characters of measure so it can't unbalance the row.
- [x] `caseStudy.resultStat` - the one headline number per project, shown
  under the summary at the top of the case study. This is the metrics
  surface you asked about.
- [x] `caseStudy.filmEmbed` - a YouTube/Vimeo link embedded below the
  project intro (distinct from Hero Video, which replaces the hero image).

Four describe features this site doesn't have. Rather than invent them
unasked, their Studio descriptions now start with NOT WIRED UP YET so the
field stops lying, and the decision is yours:

- [ ] **`assetType`** ("Asset Type"). Migrated cleanly - 22 items are
  Identity / Brand Sheet, 21 are Apparel, 37 are untagged. The obvious job
  for it is giving the portfolio grid deliberate shape instead of ragged
  masonry: Apparel to a 4:5 portrait crop, Social Card and Vinyl to a
  square, Wide Video to 16:9 across two columns. That is a visible change to
  how the whole grid reads, so it wants your eye on a before/after rather
  than me choosing at 4am.
- [ ] **`heroTile`** ("Spans two columns in the homepage grid"). There is no
  homepage work grid in this port - the homepage leads with proof and a call
  to action. Either build the grid or drop the field.
- [ ] **`archiveMark`** ("Black and white logomark shown in Archive view").
  There is no Archive view. The marks you uploaded are safe either way.
- [ ] **`principalType`**. A Webflow leftover whose purpose didn't survive
  the move. Candidate for deletion once you confirm it meant nothing.

## High impact - visible to every visitor

- [ ] Nothing outstanding here - see "Needs your input" below.

## Custom code on the live site that the port does not have

Found by reading the live site's head/footer custom code and registered
scripts - a blind spot in the original audit, which covered pages and content
but not custom code. Two of these are real:

- [ ] **Meta Pixel is missing** (`fbq('init', '1641640693737739')` +
  PageView). If any Meta/Instagram ads, retargeting audiences, or conversion
  tracking depend on this, they go dark at cutover and the loss is silent -
  nothing breaks visibly. Needs a decision: port it, replace it, or drop it
  deliberately.
- [ ] **JSON-LD structured data is missing.** The live site has a registered
  `SchemaMarkupJSONLD` script (v1.0.1, added Feb 2026). This means the SEO
  parity report in decision #12 was incomplete - it covered meta/OG/canonical
  /sitemap/robots but not structured data.

Loaded on the live site but apparently unused - no matching content found in
the full Webflow extraction, so these look like leftovers rather than
features. Worth confirming before assuming:

- [ ] ShareThis inline share buttons + Finsweet `socialshare` attributes.
- [ ] `webflow-lottie-lazy-loader` - no Lottie animations found anywhere in
  the extracted content.

Already ported, no action needed:

- [x] Image protection (right-click and drag blocking, `user-drag: none`) is
  in `Layout.astro`.
- [x] The Ctrl+Shift+G baseline grid overlay is a debug tool, not site
  functionality - deliberately not ported.

## Medium impact

- [ ] **14 animated GIFs are the last real weight problem.** One of them (the
  Pisces animation) is 10.7 MB and single-handedly makes the homepage 42%
  heavier than Webflow, which served the same animation at 4 MB. Sanity does
  not usefully re-encode animated GIFs. Converting them to MP4/WebM would cut
  that to a few hundred KB, but it swaps `<img>` for `<video>` - a behaviour
  change, so it needs your say-so (`WORKLOG-overnight.md` decision #14).

- [ ] **The site has no favicon.** `Layout.astro` points every page at
  `/favicon.svg`, but `public/` has never contained one, so every page load
  404s and browser tabs show a blank icon. Pre-existing, found while
  debugging visual editing. Needs an actual icon from Chris (or derive one
  from the logomark) - not something to invent.
- [ ] Privacy Policy is legally incomplete on the REAL site (cuts off after
  section 4, no rights/retention/cookies/contact sections, no last-updated
  date, references UK "HM Revenue & Customs" despite being a NJ business).
  Ported faithfully as-is; flagging that it needs real legal review
  independent of any migration work.

## Low impact / cleanup

- [ ] **Case study page titles are weaker than Webflow's.** Ours use the
  project name ("DumpStat, a D&D Podcast"); Webflow has a real SEO title
  ("DumpStat Podcast — Brand Identity | Rumeau Design Co"). Needs an
  `seoTitle` field on the caseStudy schema and a line of copy per project -
  your writing, not mine to invent.
- [ ] **"actions target Node.js 20" warnings in every workflow log.** Cosmetic
  today: GitHub already force-runs those actions on Node 24. The fix is
  bumping `actions/checkout` and `actions/setup-node` to v5, left undone
  because this session couldn't verify those tags exist before pushing to
  five pipelines (`WORKLOG-overnight.md` decision #13).
- [ ] **Before pointing the real domain here:** set `PUBLIC_IS_PREVIEW` and
  `PUBLIC_SANITY_VISUAL_EDITING` to false in `deploy-pages.yml`. The first
  makes the site noindex itself; the second embeds invisible editing markers
  in page text.

- [ ] Several duplicate/draft Webflow pages exist (`Home 2`, `Home Copy`,
  `Home Copy 2`, `Portfolio Copy`, `Portfolio Copy 2`, `Portfolio Copy 3`,
  `Turbo`, `Chateau Seven` [case study, in-progress draft]) - all correctly
  excluded from the port since they're drafts/abandoned. No action needed,
  noted for completeness.
- [ ] `image-license-info` intentionally dropped - it's unedited Webflow
  template boilerplate about Unsplash stock licensing, not real content.

## Needs your input before I can act

1. **The "(UNDER CONSTRUCTION)" line on `/ms-paint`.** Ported because it's
   your copy on the live page, but it probably shouldn't follow you onto the
   new site. One word and it's gone.
2. **Hug a Mug's static hero vs. its new video hero.** Every case study page
   shows a static `mainImage` hero above the title band. Hug a Mug's real
   page doesn't have one of those at all - it opens straight into the new
   video hero section. Worth suppressing the static hero specifically when a
   video hero section exists, but that's a layout call, not made
   unilaterally - see `WORKLOG-overnight.md` decision #8.
3. **A few video sources are still unresolved** - two Instagram-video grids
   on Hug a Mug and DumpStat's 3 audiogram clips have no recoverable source
   URLs from Webflow's API. Left out of the rebuilt pages entirely rather
   than filled with placeholders. If you have the real Instagram/audiogram
   links, they can be added as `videoSection`s once you do.
