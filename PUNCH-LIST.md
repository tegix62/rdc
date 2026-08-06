# Punch list — Rumeau Design Co

Three lists, in the order they matter:

1. **[Finish the port](#1-finish-the-port)** — what's still missing or wrong versus the live Webflow site.
2. **[Launch](#2-launch)** — the cutover itself, in order.
3. **[Ideas and loose ends](#3-ideas-and-loose-ends)** — half-built things and "wouldn't it be cool".

Reasoning for every decision is in `WORKLOG-overnight.md`. Current measurements
are in the `ci-reports` branch — see `HANDOFF.md` for how to read them without
the GitHub API.

---

## 1. Finish the port

### Needs something only you have

- [ ] **Meta Pixel: port it, replace it, or drop it.** The live site runs
  `fbq('init', '1641640693737739')` + PageView. If any Meta/Instagram ads,
  retargeting audiences or conversion tracking lean on it, they go dark at
  cutover **silently** — nothing visibly breaks. This is the one item on the
  list that can quietly cost money.
- [ ] **Upload a favicon.** It's now a field in Studio (Site Settings →
  Favicon) so no code change is needed. Until something is there, every page
  load 404s on `/favicon.svg` and tabs show a blank icon. You sent a portrait
  earlier that I couldn't read as a file — re-send or upload it directly.
- [ ] **SEO titles per case study.** Ours use the project name ("DumpStat, a
  D&D Podcast"); Webflow has real titles ("DumpStat Podcast — Brand Identity |
  Rumeau Design Co"). Needs an `seoTitle` field (mine to add) and one line of
  copy per project (yours to write, not mine to invent).
- [ ] **Missing video sources.** Two Instagram-video grids on Hug a Mug and
  DumpStat's three audiogram clips have no URL recoverable from Webflow's API.
  Left out entirely rather than filled with placeholders. Send the links and
  they drop straight into a Media Row.
- [ ] **Photography has no tagged work.** The filter button is hidden rather
  than shown-and-broken, and a warning is logged at build time. Tag anything
  Photography in Studio and the button returns by itself.
- [ ] **Privacy Policy needs real legal review.** Not a migration issue — the
  *live* page is already incomplete: it stops after section 4, has no
  rights/retention/cookies/contact sections, no last-updated date, and cites
  UK "HM Revenue & Customs" for a New Jersey business. Ported faithfully,
  flagged as-is.

### The four dead fields — all resolved

Every one turned out to be a real idea rather than a leftover, and all four are
now built. The CMS audit reports **0 dead fields across 233**.

- [x] **`principalType`** — the typeface a project is built on, credited the way
  a typography book lists principal type, with an optional link to the foundry.
  The most distinctive field on the schema, and I had it filed for deletion.
- [x] **`archiveMark`** — your hand-thresholded alternate, swapped in whenever
  print mode is on, falling back to the CSS threshold where you haven't made
  one. Gets better as you draw more; never breaks while you haven't.
- [x] **`heroTile`** — spans two columns *and* crops to 3:2 landscape, so it
  reads as a spread among the vertical tiles. Doesn't grow when clicked.
- [x] **`assetType`** — not retired after all. It carries exactly the signal
  needed to tell a logomark from an image, so it's the fallback for
  `tileTreatment` and your 43 tagged items work with no re-entry.

### Mine to build

- [x] **JSON-LD structured data.** Every page now carries one `@graph`:
  Organization (name, logo, and your social links as `sameAs`), WebSite, and a
  WebPage node for itself. Case studies add a CreativeWork naming the client
  and the category; blog posts add a BlogPosting; both add breadcrumbs. Built
  only from filled Sanity fields — an empty field states nothing rather than
  guessing. The production gate parses the block on every page and fails the
  deploy if it is malformed, missing a node, or describing a different URL,
  because a broken JSON-LD block is invisible and is discarded silently.
- [x] **A production deploy workflow.** Built:
  `.github/workflows/deploy-production.yml`. Runs only when you ask it to, and
  *doesn't publish unless you tick the box* — dispatching it builds the real
  bundle and puts it through a gate, which you can do as often as you like
  without anything going live. The gate
  (`scripts/check-production-build.mjs`) reads the built files rather than
  trusting the workflow's own settings: robots.txt rules, every canonical
  host and path, the sitemap's contents, invisible stega markers, the editing
  overlay, and whether every page is stamped with the commit being deployed.
  Nothing deploys unless it passes. The gate is itself tested — 18 cases,
  each a dist broken one specific way — and that test runs first in the same
  job, because this project has shipped a check that could never fail before.
- [ ] **Production builds read Sanity through its CDN** (`useCdn: !VISUAL_EDITING`),
  which is right for speed but means a deploy fired seconds after you hit
  Publish can build from a slightly stale copy. Usually fresh within a few
  seconds; worth knowing if a change ever seems not to have shipped. The fix,
  if it bites, is one line.
- [ ] **Confirm two live scripts are genuinely unused** before assuming:
  ShareThis inline share buttons (+ Finsweet `socialshare` attributes) and
  `webflow-lottie-lazy-loader`. No matching content turned up in the full
  extraction, so they look like leftovers.
- [ ] **Hug a Mug: static hero vs video hero.** Every case study shows a static
  `mainImage` hero above the title band. Hug a Mug's real page has no such
  hero — it opens straight into video. Worth suppressing the static one when a
  video hero exists, but that's a layout call I didn't make unilaterally.

### Performance still open

Verified numbers, not estimates. Homepage is already down 59% and `/video` 89%.

- [ ] **`/portfolio` is ~7.3 MB** for 68 thumbnails — the heaviest page left.
  The rule "animated images never go through the resize pipeline" is too
  absolute: at small widths the CDN's re-encode genuinely beats the original,
  and which way it falls depends on the width being requested. The fix is a
  per-asset, per-width decision from measured bytes, cached in Sanity.
- [ ] **`/portfolio` desktop CLS is 0.4722** (under 0.1 is "good"). The worst
  number on the site and precisely the jank you can feel: Isotope lays the
  masonry grid out *after* the page paints, so everything jumps once. Fix means
  reserving the grid's height before layout. Mobile measures 0, which is
  suspicious enough to be worth understanding before trusting.
- [ ] **One source file is 3,981 KB** — the homepage hero background, an
  800×800 file. No code change fixes a 4 MB export; it needs re-saving. Yours.
- [ ] Three anchors on the homepage measure 36–43px wide (44px tall). Height is
  fine, width slightly short. The audit reports size but not a selector and
  their labels are empty, so I left them rather than guess.

---

## 2. Launch

In order. Nothing here is hard; the risk is doing it in the wrong sequence.

1. [ ] **Map the URLs first.** Compare every live Webflow URL against this
   site's routes and write redirects for anything that moved. Skipping this
   silently drops whatever SEO the old URLs have earned. Cloudflare Pages does
   this with a `_redirects` file.
2. [x] **Build the production deploy** — done, see above. Both preview flags
   are absent, and the gate refuses the deploy if either reappears.
3. [ ] **Decide how you edit privately.** Once visual editing is off in
   production you need somewhere it *is* on: either password-protect the
   preview with Cloudflare Access, or run `npm run dev` locally (which also
   gives live-as-you-type editing). Your call; nothing is blocked on it.
4. [x] **Check the paperwork on a real build** — this is now the gate in step
   2 rather than a thing to remember. It also re-checks the live URL after
   publishing, because "the file on disk is right" and "the CDN is serving it"
   are different claims.
5. [ ] **Point DNS at Cloudflare Pages.** Keep Webflow running. Then run the
   production workflow once with **publish** ticked. Worth knowing: the
   production build is also reachable at `rumeau-design-co.pages.dev`, which
   is crawlable once `Allow: /` ships. Every canonical points at
   `rumeaudesign.co`, which is the normal fix for that, but if it ever shows
   up in search results the answer is a Cloudflare redirect from the pages.dev
   host to the real domain.
6. [ ] **Walk the site on a real phone.** Every page, every Contact button
   through to the Tally form, print mode, the portfolio filters. Automated
   checks cover bytes and layout, not whether a form actually submits.
7. [ ] **Then cancel Webflow.** Not before. $39/month is cheap insurance for a
   week of overlap, and the Webflow site is the only copy of some source
   content.
8. [ ] **Decide on analytics.** No analytics is a legitimate choice; noticing
   in three months that you have no data is not.

---

## 3. Ideas and loose ends

### Half-built, waiting on you

- [ ] **Aesthetic Range tray needs icons.** The block is built and renders; each
  item shows a placeholder marker that holds its shape until artwork exists.
  Three icons and it's done.
- [ ] **Print mode is functional and experimental.** Grain is now ~16× coarser
  and the bar collapses to a corner handle. Two knobs if it still isn't right:
  `--ink-grain-scale` and `--ink-grain-opacity` in `global.css`.
- [ ] **The `resultStat` field is live but empty** on most projects. One
  headline number per case study — "+22% yearly revenue" — is the thing an
  agency scans for. Your copy.

### Wouldn't it be cool

- [ ] **`assetType` driving the portfolio grid.** Apparel to a 4:5 portrait
  crop, Social Card and Vinyl square, Wide Video 16:9 across two columns.
  Turns ragged masonry into deliberate rhythm — a real change to how the whole
  page reads, so it wants your eye on a before/after rather than my judgement.
- [ ] **An Archive view.** Would make `archiveMark` mean something: a dense
  black-and-white index of every logomark, which is a genuinely different way
  to show range.
- [ ] **A homepage work grid**, which would make `heroTile` mean something.
- [ ] **An achievements / metrics surface.** You said your metrics are worth
  having somewhere and the contact buttons all lead to Tally. There's a
  `statCalloutSection` and an `achievementsSection` already built but empty in
  every document — the pieces exist, the arrangement doesn't.
- [ ] **Cloudflare R2 for video** if uploads outgrow Sanity. Not needed yet:
  only short silent loops get uploaded, and the long sets stay on YouTube.
- [ ] **Design tokens editable in Studio** — colours and type scale from the
  CMS rather than CSS. Powerful and easy to make a mess with; worth it only if
  you actually want to reskin the site without touching code.
- [ ] **Case study page transitions / view transitions.** You mentioned wanting
  to get experimental. Astro has this built in and the site is static, so it's
  cheap to try.

### Deferred deliberately

- [ ] `actions/checkout` and `actions/setup-node` are on v4 and log Node 20
  deprecation warnings. Cosmetic — GitHub already force-runs them on Node 24.
  Bumping to v5 across six workflows wasn't verifiable before pushing.
- [ ] No lockfile is committed, so a clean CI install can float to an
  incompatible version — which broke two deploys earlier in this port. Adding
  `package-lock.json` would fix that class of failure permanently.
- [x] `/ms-paint` removed at your request; its Sanity document is retained.
- [x] `image-license-info` dropped — unedited Webflow boilerplate about
  Unsplash licensing, not real content.
- [x] Duplicate Webflow drafts (`Home 2`, `Home Copy`, `Portfolio Copy 1-3`,
  `Turbo`, `Chateau Seven`) correctly excluded as abandoned.
- [x] The Ctrl+Shift+G baseline grid overlay is a debug tool, not site
  functionality — deliberately not ported.
- [x] Image protection (right-click/drag blocking) is ported and live.

---

## Already done

Kept short; the detail is in `WORKLOG-overnight.md`.

- [x] **Content parity** with the live site, all pages and case studies.
- [x] **Speed.** Homepage 10,938 → 4,445 KB (−59%). `/video` 1,199 → 130 KB
  (−89%). `/portfolio` 12,318 → 7,307 KB on mobile. Causes were the CDN being
  asked to *enlarge* small images, an animation probe that could never detect
  an animated GIF, and YouTube players loading on pages nobody watched.
- [x] **Typography.** `/video` 141 → 71 characters a line, `/about` 94 → 71.
  Nothing on the site now exceeds 75.
- [x] **Mobile.** No page scrolls sideways at either width. Tap targets at 44px
  — the hamburger was 32×32, the first thing any phone visitor touches.
- [x] **Images.** Every one carries dimensions and a srcset; per-image
  "serve exactly as uploaded" for work you compressed yourself; animated
  sources bypass the re-encode pipeline; alt text on every image field.
- [x] **Layout blocks.** Twelve, including Media Row (2–4 across, each slot
  independently an image or a video) and Media + Text. Every one rendered from
  fixtures on `/style-guide` so they're actually exercised.
- [x] **Video.** Uploads autoplay silently and loop with no player script;
  YouTube/Vimeo load behind a poster on click.
- [x] **Visual editing** confirmed working end to end — handshake, toggle, and
  hover-to-edit — against the live preview using the Studio's own code.
- [x] **CMS.** 231 fields audited; eight were dead, four now wired
  (`siteTitle`, `footerText`, `resultStat`, `filmEmbed`).
- [x] **Migration no longer overwrites Studio edits.**
- [x] **SEO**: meta, OG, Twitter, canonical, sitemap, robots.
- [x] **The measurement loop itself**, which is what makes the numbers above
  trustworthy: every audit states which build it describes and fails hard if
  it cannot confirm it's measuring its own commit. That check caught a broken
  deploy that three earlier runs had papered over.
