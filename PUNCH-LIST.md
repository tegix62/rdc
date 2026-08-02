# Parity punch list: Astro port vs. live Webflow site

Compiled from a structural audit of the live Webflow site (page inventory,
forms, real case-study content) plus a code-level review of the Astro port.
Ordered roughly by impact. Nothing here has been actioned unless marked done.

## Done tonight

- [x] About/Video/Collage/Privacy Policy real content migrated (was showing
  "Content coming soon" - see `WORKLOG-overnight.md` decision #2)
- [x] Footer built out with real logo/social/contact/legal (prior session)
- [x] Work page identity band + homepage full-bleed fixes (prior session)

## High impact - visible to every visitor

- [ ] **Case study pages don't match their real Webflow counterparts.**
  Only Hug a Mug has example sections, and even those are placeholder copy -
  the REAL Hug a Mug page is far richer (video hero, stats, 4 text sections,
  awards) than our current 5-block system can express. DumpStat and Adelante
  have zero sections at all right now. Full real content for all three is
  preserved in `WORKLOG-overnight.md`'s Appendix. This needs new block types
  before it can be done properly - see "Needs your input" below.
- [ ] **`/ms-paint` page is live on the real site and completely missing from
  our port.** It's real, published content (a design-constraint experiment
  write-up), not a draft or duplicate. Needs to be extracted and added as a
  new route, same treatment as About/Video.

## Medium impact

- [ ] **Homepage content is hardcoded, not CMS-editable.** The 3 proof/stat
  cards, the 3-item checklist, the bio-row paragraph, the closer/CTA heading,
  and the final CTA heading all live directly in `index.astro` as JS
  constants. Chris said he wants to edit the site himself like Webflow -
  this is the biggest blocker to that for the homepage specifically. Needs
  schema fields + migration + template changes (tracked as task #6, not
  started).
- [ ] `work/[slug].astro` still has its own copy of the section-rendering
  switch statement instead of using the new shared `src/components/Sections.astro`
  extracted tonight. Low risk, but the two will drift if not unified.
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

1. **New block types for case studies.** The real Hug a Mug/DumpStat/Adelante
   pages need types our schema doesn't have: a text-only section (heading +
   rich text, no image), a video-grid section (multiple videos in a row,
   several of which are background-video loops whose source URLs Webflow's
   API won't expose), a stats/services section (the "+22% revenue" card),
   and a full-image section with an overlay caption. This is a real schema
   design conversation, not something to guess at solo.
2. **Homepage content → Sanity.** Confirmed you want to self-edit like
   Webflow (see your message). Straightforward to build, just needs doing -
   queued as task #6.
3. **MS Paint page** - want this added as a new route? If yes I need the same
   Designer-API content pull as About/Video got tonight.
