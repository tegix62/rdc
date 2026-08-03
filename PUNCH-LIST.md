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
