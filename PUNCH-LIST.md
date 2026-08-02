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

## High impact - visible to every visitor

- [ ] **`/ms-paint` page is live on the real site and completely missing from
  our port.** It's real, published content (a design-constraint experiment
  write-up), not a draft or duplicate. Needs to be extracted and added as a
  new route, same treatment as About/Video.

## Medium impact

- [ ] Privacy Policy is legally incomplete on the REAL site (cuts off after
  section 4, no rights/retention/cookies/contact sections, no last-updated
  date, references UK "HM Revenue & Customs" despite being a NJ business).
  Ported faithfully as-is; flagging that it needs real legal review
  independent of any migration work.

## Low impact / cleanup

- [ ] Several duplicate/draft Webflow pages exist (`Home 2`, `Home Copy`,
  `Home Copy 2`, `Portfolio Copy`, `Portfolio Copy 2`, `Portfolio Copy 3`,
  `Turbo`, `Chateau Seven` [case study, in-progress draft]) - all correctly
  excluded from the port since they're drafts/abandoned. No action needed,
  noted for completeness.
- [ ] `image-license-info` intentionally dropped - it's unedited Webflow
  template boilerplate about Unsplash stock licensing, not real content.

## Needs your input before I can act

1. **MS Paint page** - want this added as a new route? If yes I need the same
   Designer-API content pull as About/Video got tonight.
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
