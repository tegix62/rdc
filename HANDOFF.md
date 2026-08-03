# Handoff — Rumeau Design Co, Webflow → Astro + Sanity

State as of 3 Aug 2026. Read this first in a new session; then
`WORKLOG-overnight.md` for the reasoning behind each decision, and
`PUNCH-LIST.md` for what's still open.

---

## The project in one paragraph

Chris Rumeau's portfolio is being moved off Webflow ($39/mo) to Astro +
Sanity on Cloudflare Pages (~$0/mo). Content parity is reached. The driver is
cost and speed; the newer and more important goal is **presenting to agencies
and higher-tier clients**, which means the old site's structure is no longer
the target — Chris has said it "was never fully polished" and sections were
"jumbled". Faithful porting is done; design work is what's left.

## Where things live

| | |
|---|---|
| Repo | `tegix62/rdc`, branch `claude/webflow-astro-sanity-port-ig55e2` |
| Preview site | https://preview.rumeau-design-co.pages.dev |
| Studio | https://rumeau-design-co.sanity.studio |
| Live Webflow (still authoritative) | https://www.rumeaudesign.co |
| Sanity | project `8337vjtf`, dataset `production` |
| Webflow site id | `66295bdafa62074ef5551950` |

## Measured facts (not estimates)

Real Chromium, cold cache, wire bytes:

- `/portfolio` 25,455 KB → 5,027 KB (**−80%**), loading 12.6s → 1.5s
- `/about` 2,961 KB → 425 KB (**−86%**; −95% once the preview-only
  visual-editing script is discounted)
- Webflow spends ~2.2 MB per page before any of Chris's work loads: 1,619 KB
  fonts, 168 KB `webflow.js`, 333 KB reCAPTCHA, 108 KB Meta Pixel
- Fonts are **not** a problem in the port (75–87 KB vs Webflow's 1,619 KB)
- jQuery Isotope on `/portfolio` is 282 KB vs Webflow's 871 KB of script

## RESOLVED — the portfolio filter bug

Cause: **stega**. Sanity's visual editing embeds invisible zero-width
characters into strings so Studio can trace text back to its field.
`lib/sanity.ts` already excluded fields that are parsed rather than read
(`accentColor`, `href`, `url`, `slug`) — but not `category`. So the lookup key
became `"Brand Identity"` plus invisible markers, the map returned undefined,
every tile got an empty class and all four filters matched nothing.

Invisible in the data, the markup and the page, and every local test passed
because mock data carries no stega. Three rounds of inference failed on it.

Fixed by excluding `category`, `pageType`, `parentType`, `assetType`, `inkMode`
from stega, plus a `cleanKey()` helper that strips zero-width characters at the
point of use so later fields inherit the protection.

Verified by real clicks on the deployed site: 18 brand-identity, 20
merch-apparel, 24 type-lettering, all restoring to 66.

Two content facts it surfaced: **4 of 66 tiles have no usable category** (2 with
none, 2 with an unmapped Webflow id), and **Photography has zero tagged items**,
so its button is now hidden — an empty filter reads as a broken site. The build
warns about both.

## Traps that have already caused real bugs

1. **No lockfile is committed.** Two deploys broke on floating dependency
   versions. Suspect this whenever CI and local disagree.
2. **`MIGRATE_FORCE=1` overwrites whole documents.** Fill-in-the-blanks is
   the default and only writes empty fields. Force preserves `noRecompress`
   flags by asset id, but nothing else.
3. **Fill-in-the-blanks can preserve *wrong* data.** It only writes empty
   fields, so a populated-but-incorrect value can never be corrected by a
   normal migration run. "kept Studio version" means nothing was filled — it
   does **not** prove a field is populated.
4. **Sanity's stored file extension lies.** The dataset has `-webp`
   references holding JPEG and `-gif` references holding static PNG. Detect
   format from bytes, never from the reference.
5. **Before pointing the real domain here**, set `PUBLIC_IS_PREVIEW` and
   `PUBLIC_SANITY_VISUAL_EDITING` to `false` in `deploy-pages.yml`. The first
   makes the site noindex itself; the second embeds invisible editing markers
   in page text.
6. **This sandbox cannot reach external hosts** — shell `curl` and `WebFetch`
   both get 403. Anything needing the open internet (measuring the live site,
   reading reference sites, transcoding, querying Sanity) must run in CI.

## Assumptions that turned out to be wrong

Recorded so they aren't repeated. Chris's own judgment was right each time.

- *"Video will be 10–20× smaller than GIF."* False here — his GIFs are
  already hand-optimised (one is literally named `Crush-Timelapse-800kb`).
  10 of 13 transcodes came out **larger** and were correctly rejected.
- *"A 10.7 MB homepage image is being ballooned by the CDN."* False. That
  asset is 71 KB. The figure came from `sizes().responseBodySize` in the perf
  script being wrong by ~135×. It now reads `Content-Length`.
- *"Trust the CDN to optimise images."* True for photography (57× smaller,
  invisible). **False for flat art** — at q80 a wordmark is 6× *larger* than
  lossless and shows visible ringing.
- General lesson: every time something was asserted from reasoning rather
  than measured, it was wrong. Scripts that download real bytes or click real
  buttons have been right every time.

## Done

Content parity (all 9 pages, 5 posts, 80 work items) · responsive images with
dimensions + srcset · SEO (OG, canonical, sitemap, robots, preview noindex) ·
Node 22 CI · `/ms-paint` · per-image "serve exactly as uploaded" · animated
sources bypass the transform pipeline · GIF→video pipeline (3 converted, rest
correctly rejected) · portfolio jump-to-project button · the recovered
"trending styles" icon tray as a placeable block · page-section slots on
home/about/portfolio · print mode (one ink on coloured stock, 5 papers +
grain, per-image treatment) · visual editing gated to iframes only.

## Needs Chris

- Real SEO titles per case study (his copy to write)
- A favicon — none has ever existed, every page 404s on it
- Decide on the Meta Pixel: port, replace, or drop deliberately. Losing it is
  silent.
- JSON-LD structured data (the live site has it; the port doesn't)
- Icons for the aesthetic-range tray — the Webflow original never had any
- Whether `(UNDER CONSTRUCTION)` stays on `/ms-paint`
- Hug a Mug shows a static hero above its video hero; the real page has only
  the video
- Two Instagram video grids and 3 audiogram clips have no recoverable source
  URLs
- **Analytics**: there is none on the new site, so the quiet Tally funnel
  can't be diagnosed — low traffic and poor conversion need opposite fixes
- Reference portfolios to work from (a CI job reads their structure):
  itsalexward.com, colourandshape.com, sabrinalau.com, fleshandbonedesign.com,
  leannawhite.com, lotusyuhacho.com, muntasirmohamed.com, trabuc.co, mvtbcn.net

## Standing constraints on the assistant

- **Nobody has seen this site.** All assessment is structural, from built
  markup and measurements. Chris's eye is the only visual check.
- Design control: Sanity holds **content**, not design. Two design fields
  exist (`accentColor`, blog `color`); everything else is ~1,270 lines of CSS.
  Tokens exist (8 colours, 2 fonts, 6-step spacing, content width) but 51
  padding/margin values are still hardcoded and would ignore token changes.
  Exposing tokens in Studio is the agreed path to real design control.
