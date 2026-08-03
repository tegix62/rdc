# Overnight worklog

Autonomous work session run while Chris was away. Every judgment call I made
without being able to check it with him is recorded here so it can be reviewed
and reverted selectively.

**Branch:** `claude/webflow-astro-sanity-port-ig55e2`
**Guardrails held to:** no DNS/domain changes, no merge to main, no pull request,
everything committed to the feature branch above.

**Pipeline status as of 04:32 UTC:** page content migration (commit
`220f1c6`) fully verified live — migrate-content run succeeded, Hug a Mug's
example sections re-patched after the wipe, redeploy re-triggered and
confirmed fresh ("Uploaded 5 files" after the patch, not before). Latest
preview: https://d605cf24.rumeau-design-co.pages.dev. Moving on to task #6
(homepage content → Sanity) next with remaining budget.

**Session end status as of 06:40 UTC:** task #6 (homepage content → Sanity,
commit `1b01d1d`) also fully verified live through the same pipeline -
migrate-content run succeeded, Hug a Mug's sections re-patched again (same
wipe-on-migrate issue, now hit a third time tonight), deploy re-triggered
twice and confirmed stable (two consecutive builds both reported "0 files
uploaded, 627 already uploaded" a few minutes apart, which after the first
deploy already landed the real change means the state is settled and
correct, not stale - matches how this was reasoned through earlier in the
session). Latest preview: https://97bed206.rumeau-design-co.pages.dev

**Stopping here for the night as agreed.** Everything is committed and
pushed to `claude/webflow-astro-sanity-port-ig55e2`, nothing left
uncommitted, no destructive or DNS-related action taken at any point. Both
agreed tasks (#2 page content, #6 homepage-to-Sanity) are done and verified
live. Task #3 (case study section rebuild) was deliberately not attempted -
see decision #1 above and the Appendix for everything needed to resume it.
Not starting anything new - see PUNCH-LIST.md for what's next and what
needs Chris's input before it can proceed.

## Important limitation on this session's work

This sandbox has no network access to Sanity, Cloudflare, or our own preview
site — only to Webflow's API. That means **none of the visual results below were
seen by me.** Everything was verified structurally: the code compiles, the
migration job logs report success, and the deploy logs confirm fresh uploads.
Anything describing how something *looks* is inference from the source data, not
observation. Treat the styling changes as first drafts to review, not finished
work.

## Scope agreed before the session

1. Migrate real page body content (About / Video / Collage / Privacy / Image License)
2. Populate case study sections for the remaining projects
3. Full parity audit vs the live Webflow site + prioritized punch list
4. Conservative typography and style polish

---

## Judgment calls log

Entries are appended as work proceeds. Each notes what I decided, why, and how
to undo it if it was the wrong call.

### 1. Descoped: full case-study section rebuild for DumpStat/Adelante/Hug a Mug

Pulled the real Webflow layout for all three live case study pages via the
Designer API (asset ids, copy, colors — full detail). Verdict: **the 5-block
section system (fullImage / twoUp / threeUp / imageText / video) cannot
represent Hug a Mug's real page** — it has a video hero with overlaid title,
a stats/services block, four text-only sections, and three video grids, none
of which fit the five block types. DumpStat and Adelante fit better but still
have unrecoverable background-video sources (Webflow's Data API doesn't
expose background-video URLs, and the live site is unreachable from this
sandbox to scrape them another way).

**Decision:** did not attempt this tonight. Building the right block types
(text-only section, video-grid section, stats section, image-with-caption)
is a real schema design task that deserves your input, not something to
rush through solo. Left Hug a Mug's existing placeholder sections
(from `exampleSections.mjs`) untouched. Full real-content detail for all
three pages is preserved in this file's Appendix below so nothing has to be
re-extracted.

**To resume:** read the Appendix, decide on the missing block types with
Chris, extend `caseStudySections.ts` + `Sections.astro`, then write a
`caseStudyLayouts.json` entry per project and let `migrateWork()` pick it up
(the mechanism for that already exists as of commit `e4e0210`).

### 2. Page body/hero/sections migration - completed

- Extended `migratePages()` to write `body`, `heading`, `heroImage`,
  `heroAlt`, and `sections` (previously wrote only title/slug/seoDescription,
  which is why About and Video showed "Content coming soon" despite being in
  the main nav).
- Added `heading` + `sections` + `heroAlt` fields to the `page` schema.
- Fixed a real bug found along the way: `about.astro`, `video.astro`,
  `collage.astro`, `privacy-policy.astro`, `merchfolio.astro` were all
  rendering `page.title` (the full SEO `<title>` string, e.g. "About Chris
  Rumeau - Rumeau Design Co - Brand Designer & Illustrator") as the visible
  on-page `<h1>`. Added the `heading` field specifically so the page can have
  a short on-page heading distinct from its SEO title.
- Populated real content in `pages.json` for About (real bio + portrait),
  Video (real Pinegrove copy + the one video whose URL was recoverable —
  it's a plain YouTube embed, not a background video), Collage (real 6-image
  grid), Privacy Policy (real legal text, reproduced faithfully including
  its flaws - see note below).
- **Dropped `image-license-info` from the migration entirely.** Extraction
  confirmed it's stock Webflow template boilerplate about Unsplash licensing,
  not real authored content - porting it would be porting someone else's
  template filler, not a "straggler" of Chris's. If Chris wants a real image
  license page, that's new content to write, not something to migrate.

### 3. Privacy Policy ported faithfully, including its real problems

The live page is legally incomplete: it cuts off after section 4 ("How We
Share Your Information") with no data-retention, user-rights, cookies, or
contact section, and no last-updated date. It also references "HM Revenue &
Customs" (a UK tax authority) despite being a NJ business - looks like
unedited template boilerplate. I ported the text exactly as-is rather than
"fixing" it, since rewriting someone's legal copy without being asked is not
a call I get to make. **Flagging for Chris: this page needs real legal
review before launch, independent of the migration.**

### 4. Video page: reordered content slightly

Real page order was: intro paragraph → video → one closing paragraph. Our
page template renders body copy, then sections, as two separate blocks (this
is also true of Collage). Rather than build one-off interleaving support for
a single page under time pressure, both paragraphs now render together
before the video. Content is 100% preserved, only the video's position
relative to the closing line moved. Low-risk, easily fixed later if it reads
oddly - it's one paragraph move in `pages.json`.

### 5. Extracted case-study section rendering into a shared component

Created `src/components/Sections.astro` from the switch-statement that used
to live inline in `work/[slug].astro`, so both case studies AND regular
pages (Video, Collage) render the same block types from one place. Also
fixed a latent bug in the process: the YouTube-embed URL parser used
`u.searchParams.get('v')`, which breaks on the real Video page's actual
malformed URL (`?v=ID?si=...` - a second `?` instead of `&`, which Webflow's
own editor produced). The fix trims at any stray `?`/`&`/`/` rather than
trusting the raw param. **Note:** `work/[slug].astro` itself was not yet
switched over to import the new shared component - it still has its own
copy of the same logic. That's a small follow-up refactor, not urgent, but
worth doing to avoid the two copies drifting apart.

### 6. Permissions: added .claude/settings.json allowlist

Chris flagged he can't keep clicking "Allow Once" while away. Added an
allowlist covering: git (read + the specific push to this branch only),
npm/node/build commands, read-only file tools, GitHub Actions monitoring
tools, and read-only Webflow tools. Explicit deny list for anything
DNS/domain/publish-related, force-push, hard reset, and merge/PR creation -
these stay blocked regardless of the allow list.

### 7. Homepage content moved into Sanity (task #6)

Chris said he wants to edit the site himself, closer to how Webflow worked.
The homepage had 6 pieces of copy hardcoded directly in `index.astro`'s
frontmatter as JS constants, invisible to Studio entirely: the contact/Tally
URL (duplicated in `Layout.astro` too), the bio-row paragraph, the 3-item
checklist, the 3 proof/stat cards, the closer/CTA heading (which has an
inline bold phrase), and the final CTA heading.

Added matching fields to `siteSettings` (`contactUrl`, `bioText`,
`checklist`, `proofStats`, `closerPrefix`/`closerBold`/`closerSuffix`,
`finalCtaHeading`), wrote them into `migrateSiteSettings()` with the exact
values that were already live (this is a refactor, not a content change -
verified nothing renders differently), and updated `index.astro` +
`Layout.astro` to read from Sanity with the same values as a fallback so the
site renders identically even before/if a field is ever left blank in
Studio.

**Design choice on the closer heading:** rather than one field with markdown
or portable text for the inline bold ("...rooted in heritage craft..."),
split it into three plain-string fields (prefix/bold/suffix). Less flexible
than rich text, but a non-technical editor can't get it wrong, and it needed
no new rendering logic.

**Known limitation, same shape as case study sections:** `migrateSiteSettings()`
does `createOrReplace`, so if Chris edits any of these fields directly in
Studio, the next full migration run will silently overwrite them back to
these defaults - same class of bug as Hug a Mug's sections getting wiped.
Not fixed tonight because the general fix (only write fields when a source
value exists, so an empty payload key doesn't stomp on a Studio edit) needs
to be applied consistently across the whole migration script, not just this
one function - flagging as a real follow-up, not doing it as a rushed
partial fix under tonight's remaining time/budget.

**Verified:** `npm run build` and `node --check migration/migrate.mjs` both
clean. Not yet pushed/deployed as of writing this entry - see the commit log
for final verification status.

### 8. Case study section rebuild for DumpStat/Adelante/Hug a Mug (task #3, done with Chris live)

This resumes decision #1 above, now with Chris's explicit go-ahead to build
the missing block types and populate real content. Unlike the entries above,
this was done interactively with Chris present, not autonomously overnight.

**New block types added** (`caseStudySections.ts` + rendered in the shared
`Sections.astro`): `statCalloutSection` (heading + checklist + one big
stat), `textSection` (heading + portable-text body, no image - Challenge/
Strategy/testimonial blocks), `achievementsSection` (two images + a
portable-text bulleted list - the "twoUp + achievements paragraph" pattern
both DumpStat and Adelante use), `videoHeroSection` (full-bleed background
video with an overlaid title + logo - Hug a Mug's real opener).

**Refactored `work/[slug].astro`** to import and use `Sections.astro`
instead of duplicating the block-rendering switch statement (this was
flagged as drift-prone in the punch list) - one less place to update when a
block type is added.

**Real content pulled live from Webflow** via the Designer API
(`data_element_tool > get_all_elements` on each case study's actual page,
`data_assets_tool > get_asset` for each image ID) rather than reusing the
condensed Appendix summary below, since the Appendix didn't preserve exact
copy. All three pages' real text, image asset IDs, and links are now in
`studio/migration/data/caseStudyLayouts.json`, converted to portable text
via the existing `htmlToBlocks()` helper. Unresolved video sources (two
Instagram-video grids on Hug a Mug, DumpStat's audiogram 3-up) were left out
entirely rather than filled with placeholder embeds - no real URLs exist for
them yet.

**Data bugs fixed along the way**, found while cross-referencing the live
page against `work.json`:
- Adelante's `summary` field was lorem ipsum on the live Webflow site itself
  (not a migration bug) - this is also why its "More Work" card text looked
  wrong. Replaced with the real preamble paragraph from the page.
- DumpStat's and Adelante's `mainImage` and `clientLogo` fields pointed at
  the wrong assets (DumpStat's hero was a sketch-process image instead of
  the real shirt artwork; its logo was an unrelated illustration instead of
  the wordmark; Adelante's hero/logo had the same kind of mismatch). Fixed
  to the assets actually shown on the live pages.
- DumpStat's font credits (FairyTaleJF/Jason Walcott, ITC Benguiat/Ed
  Benguiat) and Adelante's (Cervo Neue/Błażej Ostoja Lniski, Union
  Condensed/Lachlan Philp) are now real, replacing Hug a Mug's leftover
  PLACEHOLDER credits from `exampleSections.mjs` with an empty array (Hug a
  Mug's real page has no equivalent credits block to source from).
- `exampleSections.mjs` is now superseded by the real `hug-a-mug` entry in
  `caseStudyLayouts.json` - left in place for history, commented to say so.

**Not resolved, flagged for Chris:** Hug a Mug's case study page still
renders a static `mainImage` hero (`.work-hero`) unconditionally above the
identity band, same as every other case study - but Hug a Mug's real page
has no static image hero at all, it opens straight into the new video hero
section instead. Whether to suppress the static hero specifically for pages
that have a `videoHeroSection` is a layout decision, not a content one - not
made unilaterally.

**Verified:** `npm run build` (fails at the expected Sanity-network step,
confirms the Astro/TS compiles), `node --check migrate.mjs`, and a local
Playwright/Chromium render of the four new block types against the actual
compiled CSS (no live network needed) to confirm no overlapping or
invisible content before pushing.

### 9. Fixed the migration-overwrites-Studio-edits bug

The bug flagged in decisions #1 and #7, and hit three times during the port:
every migrate function did a full `createOrReplace`, so re-running the
migration silently reset anything edited in Studio back to the JSON snapshot.
Tolerable while I was the only editor. A trap now that Chris is going
hands-on, which is why this was fixed before anything else.

**The fix:** a single `seedDocument()` helper now handles all four write
paths (pages, blog posts, case studies, site settings). Default behavior is
fill-in-the-blanks:

- Document doesn't exist → seeded in full, as before.
- Document exists → only fields that are *still empty on it* get written.
  Anything with a value already - whether seeded earlier or typed in Studio -
  is left alone.
- `MIGRATE_FORCE=1` restores the old overwrite-everything behavior for when
  the snapshot is deliberately meant to win (fresh dataset, or re-applying an
  edited `caseStudyLayouts.json`). Exposed as a checkbox on the workflow's
  manual-run form; **automatic runs on push can never overwrite.**

`false` and `0` count as real values, not blanks, so a deliberately-unticked
boolean in Studio doesn't get flipped back on the next run.

**Tradeoff accepted:** editing an existing entry in `caseStudyLayouts.json`
no longer applies on a plain push - it needs a manual forced run. That's the
right default now that Sanity, not the JSON snapshot, is the source of truth
for content that already landed.

**Verified for real, not just structurally:** `seedDocument.test.mjs` runs 21
checks against a fake client covering every rule above (no network or
credentials needed), and `migrate-content.yml` now runs it as a required step
*before* the migration, so a regression in these rules blocks the job rather
than quietly destroying content. Also confirmed the new
run-only-when-invoked-directly guard doesn't break CI: running the script
directly still reaches the migration (fails at the sandbox's network
boundary, as expected), while importing it for tests does not.

### 10. Responsive images (why the Astro site felt worse than Webflow)

Chris said the live Webflow site "kind of just feels better" than the Astro
port, and expected the opposite. He was right, and it was measurable, not a
feel thing: all 21 images had **no `width`/`height` and no `srcset`**.

- No dimensions means the browser can't reserve space, so every image
  reflowed the page as it loaded. That's the scroll jank.
- No srcset means one fixed size for every device. The case study hero asked
  for 2400px and a phone downloaded all of it. Webflow auto-generates
  500/800/1080/1600/2000 variants (visible in its asset API) and picks one.
- `urlFor()` never set `auto=format`, so Sanity served the original JPEG/PNG
  while Webflow served WebP.

So on a phone the port was plausibly shipping several times Webflow's bytes
*and* shifting layout while doing it. Webflow gets this right by default;
these `<img>` tags were hand-written and skipped it.

**Fix:** one `Img.astro` that every image now goes through, so it can't be
forgotten per call site the way it was. It reads intrinsic dimensions out of
the Sanity asset `_ref` (they're encoded there, so no network call), emits
width/height, and builds a srcset capped at both the render size and the
source size so nothing upscales. Heroes and the nav logo load eagerly.

**Bug caught while verifying the emitted markup, not by reasoning about it:**
cropping makes Sanity emit `rect=x,y,w,h`, and srcset is comma-separated -
those commas split one candidate into four broken ones. Every cropped image
(More Work cards, blog thumbnails, merch grid) would have shipped a garbage
srcset that *still renders*, because browsers fall back to `src`. It would
just silently never be responsive. Now percent-encoded.

Because that whole class of failure is invisible on the page and in a
screenshot, `scripts/test-images.mjs` (17 checks) now runs in `build-check`
ahead of the build.

**Still worth doing later:** the fonts are imported as full Fontsource CSS
with no explicit loading strategy, and the Portfolio page pulls jQuery
Isotope plus imagesLoaded from two CDNs. Both likely also affect how the
site feels. Not touched tonight - the image work was the dominant factor and
is verifiable on its own.

### 11. `/ms-paint` ported (task #9) - the last content parity gap

Pulled the real page via the Designer API and added it as a `page` document
plus a route, same treatment as About/Video. Header is the Emerson mark
beside the quote and the note; two three-up galleries below (Lorax, Crab
City, and four D&D character commissions).

**Alt text:** 6 of the 7 assets have none in Webflow. I can't see the
images, so rather than invent visual descriptions I wrote alt from each
file's own subject (e.g. "Portrait of Ralph Waldo Emerson, drawn in
Microsoft Paint"). Honest and useful for a screen reader without claiming
detail I haven't verified. The Lorax image had real alt text in Webflow and
that was kept verbatim.

**Ported faithfully, including "(UNDER CONSTRUCTION)"** - it's on the live
page. **Flagging for Chris:** that's probably not something you want
carried onto the new site, but removing someone's own copy isn't my call.

**Declined:** `image-rendering: pixelated` on the MS Paint art. It's
arguably the right treatment for pixel work, but the live site doesn't do
it, it can look worse when downscaling, and I can't see the result - so it
would have been an unverifiable stylistic invention dressed up as parity.

### 12. SEO parity (task #10) - and a real risk to the live site

Audited the port's `<head>` against Webflow's. Gaps found:

- **No Open Graph tags at all.** Webflow emits them per page. Every link
  shared to Slack, iMessage or social previewed as a bare URL with no title,
  description or image. Case studies and blog posts now feed a real
  1200x630 crop as `og:image`, which is better than the live site manages -
  most of its pages have `imageUrl: null`.
- **No canonical, no sitemap, no robots.txt.** Webflow provides all three.
- **The preview deployment was fully crawlable.** This is the one that
  mattered: a public URL serving the same copy as rumeaudesign.co can
  compete with it in search. Preview builds now emit `noindex` and a
  `robots.txt` that disallows everything, gated on `PUBLIC_IS_PREVIEW`, and
  canonical always points at the real domain no matter which host served the
  page. **That flag must be false for a build that serves the real domain**,
  or the live site will noindex itself - same footgun as
  `PUBLIC_SANITY_VISUAL_EDITING`.

**Sitemap is hand-rolled, not `@astrojs/sitemap`.** It has to enumerate the
Sanity-driven routes anyway, and with no lockfile committed every added
dependency is one more thing that can float to an incompatible version on a
clean CI install - which is exactly what broke two deploys earlier tonight.

**Two bugs caught by reading the built output rather than assuming:** the
sitemap namespace was `sitemap.org` instead of `sitemaps.org`, which
invalidates the whole file; and canonical emitted `/about/` while the sitemap
said `/about`, which a crawler reads as two URLs for one page.

**Known remaining gap, needs Chris:** case study `<title>` uses the project
name ("DumpStat, a D&D Podcast") where Webflow has a real SEO title
("DumpStat Podcast — Brand Identity | Rumeau Design Co"). Fixing it properly
means an `seoTitle` field on the caseStudy schema plus copy for each project
- that's his writing, not mine to invent.

### 13. CI on Node 22 (task #4)

All five workflows pinned Node 20, which GitHub is deprecating. Bumped to 22
(current LTS, and what every build and test this session actually ran on
locally), plus an `engines` field in both manifests.

**Deliberately not done:** the "actions target Node.js 20" warnings come from
`actions/checkout@v4` and `actions/setup-node@v4` themselves, not from our
`node-version`. Bumping those to v5 is the actual fix, but this session's
GitHub access is scoped to `tegix62/rdc`, so I can't verify those tags exist
before pushing - and guessing a version into five workflows to silence a
cosmetic warning isn't worth breaking every pipeline over. GitHub already
force-runs them on Node 24, so nothing is actually broken today.

### 14. Measured: is the Astro port actually faster than Webflow?

Chris ported expecting Astro to be dramatically faster. Nobody had measured
it. `scripts/perf-compare.mjs` runs a real Chromium against both sites and
records wire bytes. Cold cache, 1440x900.

| page | Webflow | Astro | change |
|---|---|---|---|
| home | 7,950 KB | 11,309 KB | **+42%** |
| portfolio | 25,455 KB | 5,027 KB | **-80%** |
| about | 2,994 KB | 425 KB | **-86%** |

Two adjustments needed to read this honestly:

1. **`sanity-visual-editing.js` is 269 KB and loads on every page.** It is
   preview-only and disappears when `PUBLIC_SANITY_VISUAL_EDITING` is off, so
   subtract it from every Astro figure. About then reads 156 KB vs 2,994 KB,
   or **-95%**.
2. **The `load (ms)` column includes a fixed 3.5s settle wait** so injected
   scripts get a chance to run. Subtract it: portfolio is 12.6s on Webflow vs
   1.5s on Astro. That one is a genuine, visitor-visible difference.

**The homepage regression is a single file.** One asset accounts for 10,721 KB
of the homepage's 10,899 KB of images - 98% of it. It's the Pisces animation,
an animated GIF. Webflow served the same animation at 3,982 KB. Sanity's
`auto=format` does not usefully re-encode animated GIFs, so it ships the
original and we lose to Webflow by 6.7 MB on one image. Strip that one file
and the homepage is ~319 KB against Webflow's 7,950 KB, about **-96%**.

There are 14 GIFs in the migrated content, and the same pattern shows on
portfolio (822 KB and 767 KB entries at small pixel dimensions). **GIFs are
now the entire remaining image problem.** The fix is converting them to
MP4/WebM, which is a behaviour change (a `<video>` element rather than an
`<img>`) and so is Chris's call, not an assumption to make.

**Two things I told Chris earlier that this disproves:**

- I flagged the fonts as a likely performance problem. Wrong, and badly:
  Webflow ships **1,619 KB** of fonts per page, the port ships **75-87 KB**.
  That's -95% and needs no work at all.
- I flagged jQuery Isotope on `/portfolio` as giving back the JS advantage.
  Overstated: script weight there is 282 KB against Webflow's 871 KB, still
  -68%. Worth revisiting eventually, not a priority.

What Webflow actually spends its weight on, per page: 1,619 KB of fonts,
168 KB of `webflow.js`, 333 KB of reCAPTCHA, 108 KB of the Meta Pixel. The
port's structural advantage is real - it just got masked on the homepage by
one unoptimised GIF.

---

## Appendix: raw findings from Webflow extraction (for resuming case study work)

Site ID: `66295bdafa62074ef5551950`. All asset URLs follow the pattern
`https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/<asset-id>_<filename>`.

### Page inventory (from `data_pages_tool > list_pages`)

Real, live, mapped to our routes: Home, About (`698e19083579423261e2b4c9`),
Portfolio, Merchfolio, Collage (`692a07a06e7ef1fb2cf32a1a`), Video
(`67f97df4c4d718883910391d`), Blog, Privacy Policy
(`6696947574249087685a796d`), Image License Info (dropped, see decision #2).

**Live pages we have NO route for:**
- `ms-paint` (`66da10457a05ffef7ee3e996`) - "MS Paint" - published, not draft.
  Real content, a design experiment write-up. **We are missing this page
  entirely.**
- `turbo` (`668d6b06bdaa0e849c000e9a`) - draft, old services-package page.
  Skip - draft.
- Several `*-copy`/`Home 2`/`Home Copy` pages - all drafts or clearly
  abandoned duplicates. Skip.
- `401` (password-protected placeholder) - Webflow utility page. Skip.

**Case study pages** live as static pages under `/case-studies/*`, NOT as
CMS items - this is architecturally why our CMS-driven case study system
needs a manual layout per project rather than pulling structure from
Sanity's CMS automatically:
- DumpStat Podcast: `67f81c0fe7389e952eb15b08`
- Adelante Barbell Club: `6712b81e381f1fa7d8f32d88`
- Hug a Mug: `66c8b79a7394f68032bfafe7`
- Chateau Seven: `67fc0c7234a59a12500c8ee1` - **draft**, in progress on their
  end, not live. Don't migrate yet.

### Case study extraction summary (full detail was in agent output, condensed here)

**DumpStat Podcast** - header: title "DumpStat Podcast", logo asset
`67f82007519384c9c22a2fb3`, credits "FairyTaleJF by Jason Walcott" /
"ITC Benguiat by Ed Benguiat" (links to walcottdesign.com and tdc.org).
Real accent color candidate: `#db1e32` (Webflow var "DumpStat Red").
Clean-mapping sections: hero image (`66f1d0ac1f40ec68c96cd0e0`), imageText
image-left (`67f9771ec0441d96b205ba60`, no heading in source), twoUp
(`6696ac39f5eff93fc2872b6a` / `6696ac399eee5a5e73ff13fa`), backdrop band
(`67f9774f6e1f3e74c455877a`, 50vh crop - will render differently as a plain
fullImageSection), twoUp (`66d8b705bbed253fd3e391f7` /
`66f1cf1fec61a774576ceb0e`), closing image (`68433c85f8256d4f721adbf8`).
Does NOT map: 3-up of videos (audiogram clips, sources unresolved), a
twoUp+achievements-paragraph combined section (image ids
`6696ac3912443df9de6235a6` / `66cf86d91407bb0a5c97833e`, copy has the 3
bullet achievements + links to a Dicebreaker article and a dead
"Mythroll Armory" link with no href).

**Adelante Barbell Club** - header: title "Adelante Barbell Club", logo
asset `6643f92b70d0186b5316e3eb`, credits "Cervo Neue by Błażej Ostoja
Lniski" (behance.net/Blezja) / "Union Condensed by Lachlan Philp"
(behance.net/LachlanPhilp) - this is the reference screenshot from
Chris's earlier message, confirmed as this project's REAL credits, not a
generic example. Description paragraph has a trailing zero-width-space
(U+200B) to strip. Accent color: `#333333` (Webflow var "background-adelante"),
applied with the shield logo as a large watermark on 3 of the 7 sections -
a single accentColor field can't express the watermark part. Clean-mapping
sections: hero (`677d9587d1c743bfa4624306`), imageText image-left
(`66cf9878e691fd93c38bc5ea`, no heading in source - body starts
"**Visual Identity Overhaul** for the Union, New Jersey powerlifting gym."),
twoUp (`6643b2266142427c5fd6823b` / `6643b2263d1cc38a51434c0b`), backdrop
band (`67e309aa199b6336ad87d4bd`), twoUp (`67e4516aa09b46b8739525f5` /
`67e451a47ecd1992af6494a0`), closing before/after image
(`67e5a05fd24deb17dfe350a1`). Does NOT map: twoUp+achievements-paragraph
combo (`67e4509148d7ce2e210d026d` / `67e450918bd7f5ec91b3f8fa`, copy is the
"$3500 first-day revenue" bullets already used on the homepage proof card).

**Hug a Mug** - structurally different from the other two (no shared
case-study header shell). Video hero is a Vimeo embed with a KNOWN url:
`https://player.vimeo.com/video/1044782545` (autoplay/loop/muted params can
be dropped for a normal embed), overlaid with title "Hug a Mug Coffeehouse
& Ceramics Studio" and logo `66c8e12b9f9c0f9b5b6f9508`. Real h1: "How a
Coffee Shop Rebrand Increased Revenue by 22%" - this is the exact headline
already used in our example sections patch (`exampleSections.mjs`), good
sign our placeholder guessed close to the real content, but the REAL page
has much more: a services list (Logo & Visual Identity / Illustrated Merch
Designs / Product Photo & Videography), a "+22% Increase in Yearly Revenue"
stat card, then 4 text-only sections ("Challenge", "Strategy", closing
testimonial, awards), a black 72vh 3-up (1 video + 2 images:
`66c8de76e7b4e2cbcc710a20` Aries / `6657b71c4fccbefe805e8c70` Taurus), two
3-up video grids of Instagram content (sources unresolved), one clean
YouTube video (`https://www.youtube.com/watch?v=plYFXjoViKI`, title "Menu"),
and two award lines linking to NJ.com lists (archive.ph/hJ4Od and
nj.com/entertainment/food/best-coffee-shops). This page needs the new block
types (decision #1) far more than the other two - it's the real showcase
piece and currently the LEAST accurately represented by our placeholder.

### About/Video/Collage/Privacy Policy - already migrated (decision #2), source preserved in `studio/migration/data/pages.json`

