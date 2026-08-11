# Rumeau Design Co — site brief

**Written to be handed to someone with no access to the repo, the hosting, or
this conversation.** Everything needed to reason about the site and propose new
work is in this file. Nothing here is secret: the Sanity project ID and dataset
already ship in the browser bundle. No API tokens, keys or credentials are
included, and none are needed to think about the site.

Status: pre-launch. Content parity with the old site is reached; the domain has
not been moved yet.

---

## 1. What this is

Chris Rumeau is a one-person brand identity and merch designer in New Jersey.
He works with heritage apparel brands and musicians — hand-drawn logomarks,
lettering, merch, packaging. His own words for the practice:

> I sketch extensively before anything goes digital. Most reference comes from
> pre-internet sources: type specimens, vintage packaging, hand-painted
> signage, ephemera from flea markets and library archives.

The site is his portfolio. It is being moved off Webflow ($39/mo) onto a static
stack costing roughly nothing. The original driver was cost; the more important
one now is presenting well to agencies and brand clients.

---

## 2. Stack and hosting

| Layer | What | Where |
|---|---|---|
| Site | **Astro 5**, fully static (SSG). No server, no SSR, no API routes. | `github.com/tegix62/rdc` |
| Content | **Sanity** CMS. Project `8337vjtf`, dataset `production`. | `rumeau-design-co.sanity.studio` |
| Hosting | **Cloudflare Pages** | preview: `preview.rumeau-design-co.pages.dev` |
| Domain | `rumeaudesign.co` — **still pointed at Webflow.** Not cut over yet. | |
| CI | GitHub Actions, 22 workflows | |

**Everything is static.** Pages are built at deploy time and served as files.
There is no runtime backend, no database the browser talks to, and no server
code. Any proposal that needs a server, a login, a form handler, or per-visitor
data will not work as-is — it would need a Cloudflare Worker or Pages Function
added, which is possible but is a new moving part.

**Content changes require a rebuild.** Editing in Sanity does not update the
live site until a deploy runs.

---

## 3. Pages that exist today

Static routes:

```
/                 homepage
/portfolio        the main grid — 68 tiles, filters, shuffle, zoom, archive view
/about            bio + thresholded portrait
/video            video work
/collage          collage work
/merchfolio       merch work
/blog             index
/privacy-policy
/style-guide      internal: every layout block rendered from fixtures
/image-license-info
/404              lists every route, since old Webflow URLs land here
```

Generated from Sanity:

```
/work/<slug>      6 case studies
/blog/<slug>      5 posts
```

Note the URL prefixes: the **old Webflow site used `/case-studies/` and
`/post/`**; this site uses `/work/` and `/blog/`. Redirects are in place
(`public/_redirects`).

---

## 4. Content model

Four document types in Sanity.

**`caseStudy`** — does double duty, split by a `pageType` field:
- `"Case Study"` (6) — gets a page at `/work/<slug>`
- `"Grid Item"` (67) — a supporting piece with **no page of its own**; links to
  its `parentBrand` instead

Both appear as tiles on the Portfolio grid, case studies first. The intended
division is that a Case Study is the project and a Grid Item is a detail from
it, so the same image should not appear as both.

Notable fields on it:
- `thumbnail`, `mainImage`, `heroVideo`, `accentColor` (drives the case study's
  section band, and text colour is computed from its luminance)
- `category` — Brand Identity / Merch & Apparel / Typography / Illustration /
  Photography. Drives the Portfolio filters.
- `assetType` — e.g. "Identity / Brand Sheet", "Vinyl / Record". Used to decide
  whether a tile reads as a standalone mark or a photograph.
- `tileTreatment` — `mark` or `bleed`, overriding the above.
- `heroTile` — boolean. Spans two grid columns and crops to 3:2 landscape.
- `archiveMark` — a hand-thresholded black-and-white alternate, swapped in when
  Archive view is on.
- `principalType` + `principalTypeUrl` — the typeface a project is built on and
  who drew it, credited the way a typography book lists principal type. Chris
  considers this distinctive to his practice.
- `resultStat` — one headline number per project. Mostly empty.
- `sections[]` — the page body, see below.

**`blogPost`** — title, slug, excerpt, body, publishedAt, author, mainImage.

**`page`** — for `/`, `/about`, `/portfolio` etc. Holds title, SEO description,
and an optional `sections[]` array.

**`siteSettings`** — one document, split into three tabs (Brand & contact,
Homepage, Footer). Logo, favicon, tagline, default social-share image, bio text,
client logos, social links, contact URL, footer text, legal entity name, proof
stats/testimonials, checklist, closer copy, and `featuredWork` (the homepage
grid picker).

### Section blocks

`sections[]` accepts twelve block types, all rendered on `/style-guide`:

```
fullImageSection    twoUpSection      threeUpSection     imageTextSection
videoSection        videoHeroSection  mediaRowSection    mediaTextSection
textSection         statCalloutSection  achievementsSection  aestheticRangeSection
```

`mediaRowSection` takes 2–4 slots, each independently an image or a video.
`statCalloutSection`, `achievementsSection` and `aestheticRangeSection` are
built but **empty in every document** — the pieces exist, the content doesn't.

---

## 5. Features already built

Worth knowing so a proposal doesn't reinvent them.

- **Portfolio grid** — Isotope masonry, category filters, shuffle, zoom in/out
  (column count), click a tile to expand it and reveal a jump link to its
  project. Hero tiles span two columns.
- **Archive view** — a switch at the end of the Portfolio control row,
  deliberately shaped unlike the filters beside it because it is a mode, not a
  filter. Converts the whole
  page to one ink on white stock: greyscale → contrast crank → multiply. Swaps
  in hand-drawn `archiveMark` alternates where they exist, and switches the
  grid from masonry to ruled rows so it reads as a plate book. There is shelved
  machinery for five additional coloured "riso" paper stocks, currently not
  exposed.
- **Homepage work grid** — a miniature of the Portfolio grid under the hero
  buttons. Curated in Studio, falls back to most-recent while empty. Plain CSS
  grid, no JS.
- **Video** — uploaded files autoplay silently and loop with no player script.
  YouTube/Vimeo load behind a poster and only fetch the player **on click**, so
  no third-party code runs unless someone chooses to watch.
- **Images** — every image carries width/height and a srcset; per-image "serve
  exactly as uploaded" for work Chris compressed himself; animated sources
  bypass the CDN's re-encode and ship as-is; hotspot/crop from Studio is respected.
- **Visual editing** — Sanity Presentation works against the preview build.
  **Deliberately off in production.**
- **SEO** — meta, OG, Twitter, canonicals, sitemap, robots, and JSON-LD
  (`Organization` / `WebSite` / `WebPage`, plus `CreativeWork` on case studies
  and `BlogPosting` on posts, with breadcrumbs). Titles carry the site name;
  every page emits an `og:image`, falling back to the wordmark padded onto
  white; a project page with no written summary gets a description derived from
  its category, client and principal type, so no two are identical.
- **Accessibility** — skip link on every page, Escape closes the mobile menu
  and returns focus, 44px tap targets, alt text throughout.

---

## 6. Design language

- **Colour**: navy `#002885` on white. That's essentially it — one brand colour,
  plus greys. There is deliberately **no black**; a black button variant was
  removed for being off-palette.
- **Type**: Inter Tight (headings) + Gothic A1 (body), both bundled locally, no
  font CDN. Worth knowing: this pairing is neutral and arguably at odds with a
  practice built on hand-drawn heritage lettering — an open design question,
  not a settled decision.
- **Grid**: dense, tight gutters, images nearly touching. The work carries the
  page; there are no captions on tiles by default.
- Measure is capped at ~62–75 characters. Tap targets are 44px on touch.

---

## 7. Hard constraints

Things that will sink a proposal if ignored.

1. **Static only.** No server, no sessions, no per-visitor logic, no form
   handling. Contact goes to an external Tally form. Adding server behaviour
   means adding Cloudflare Functions.
2. **Analytics are one switch, currently off.** The site sets zero cookies and
   loads zero trackers today. Site Settings → **Meta Pixel ID** turns that
   around: empty means no script is emitted at all, and pasting the ID from
   Events Manager loads Meta's pixel on production only, never on the preview.
   The privacy policy reads the same field, so its description follows the
   actual state rather than drifting from it. Chris intends to run Meta ads, so
   expect this to be on at some point.

   Not yet handled: **consent**. The pixel fires on load, which is not
   compliant for EU/UK visitors without prior consent. A banner is a real piece
   of work - it must block the pixel until a choice is made, remember it, and
   allow changing it - and is a gap if the site starts drawing meaningful EU
   traffic.
3. **Content changes need a deploy.** Nothing is live-editable at runtime.
4. **Third parties are kept to a minimum.** Current outbound hosts: Sanity's
   CDN (images), Cloudflare (hosting), `i.ytimg.com` (video posters), Tally
   (contact) — plus `connect.facebook.net` and `facebook.com` once the Meta
   Pixel ID is set, which also adds ~70KB of script to every page. The Portfolio grid's two layout scripts used to be pulled from
   `cdnjs` and `unpkg` at request time; they're self-hosted now, so that's two
   fewer companies seeing every visitor's IP.
5. **Performance is measured, not assumed.** Every page's bytes, LCP and CLS
   are audited in CI against the deployed build. `/portfolio` is the heaviest
   page and is watched closely.
6. **No package lockfile is committed** — a known risk, on the list.

---

## 8. Where things stand for launch

**Done:** content parity, redirects from the old URLs, a production deploy
workflow with a pre-deploy gate, JSON-LD, layout-shift fix on `/portfolio`
(0.4722 → 0.0006), mobile fixes, alt text everywhere, image pipeline.

**Waiting on Chris:** favicon upload, a default social-share image (the
wordmark stands in until then), the **Meta Pixel ID** from Events Manager (the
machinery is built and off until that field is filled), per-case-study SEO
titles, a few missing video links, picking the homepage grid tiles, and writing
the privacy policy — which must describe the tracking state the pixel field
actually produces.

**Known open items:** `/portfolio` page weight; an unexplained desktop LCP
outlier on the homepage; several large animated images that need re-exporting
at a sensible size (one is 3,981 KB and is 90% of the homepage's weight).

**Case study hero resolution.** The hero renders full-bleed at 100vw and every
srcset candidate is capped at the file's own width, so on a 2x display a source
narrower than twice the viewport gets stretched. All six are short, measured at
a 1512px laptop at 2x:

| Project | Source | Stretch |
|---|---|--:|
| Adelante Barbell Club | 2572×1920 | 1.18× |
| DumpStat | 1920×1440 | 1.57× |
| Hug a Mug | 1920×1080 | 1.57× |
| More Kilos, Less Egos | 1300×860 | 2.33× |
| Chateau Seven | 1179×1461 | 2.56× |
| Two Point Oh | 820×360 | 3.69× |

A stretched file is now delivered at q92 and lightly sharpened instead of q80,
which stops artifacts compounding but adds no detail. Two Point Oh needs a new
export; nothing else fixes 820px. The unresolved design question is whether the
hero should cap at the source's own width — small sources would get a margin
instead of a blur. Re-measure with `scripts/diagnose-hero-resolution.mjs`.

None of the six has a hotspot set, so the hero's CSS crop keeps the centre.

One specific, fully diagnosed: **Chateau Seven's `thumbnail` has "serve exactly
as uploaded" on.** Pass-through sends no transform parameters, so it cannot
crop — every surface that asks for one gets the file's own 1.46:1 landscape
shape instead. That is the homepage grid (asks 1:1), the Portfolio grid, and the
More Work card on all twelve other project pages. It is why the tile reads wrong
on desktop and fine on mobile, where the grid is one column.

The asset is `2000x1372 webp`, and the animated-source audit confirms
`animBit=false ANIMchunk=false` — it is **not** animated, so the toggle is the
only thing forcing pass-through and turning it off is sufficient. Doing so also
takes it from 89 KB to about 20 KB at the size it actually renders.

It took days to find because the build warning named the document, and a case
study has six image fields. The warnings name the field now.

---

## 9. Open design questions

These are live, unresolved, and the most useful places to think.

1. **Typography vs the pitch.** The site claims hand-drawn heritage craft and
   is set in a neutral geometric sans. One display face would change the whole
   frame. Unresolved.
2. **What is Archive view for?** It is currently a toggle on one page. It could
   be a permanent, separate way of showing the work — a black-and-white index
   of logomarks with no titles, which is closer to Chris's original reference.
3. **Principal type as its own surface.** Crediting the typographers behind each
   project is unusual and specific to him. It is currently one line at the
   bottom of a case study; it could be an index page or a recurring footer
   element. Chris likes the idea but isn't sold on the form.
4. **"What's Chris up to."** He wants some sense of current activity on the
   site. Options range from a single editable "Currently:" line to a
   sketchbook/process strip to a dated log. Nothing built.
5. **Proof and metrics.** There are real numbers (a 22% revenue increase, 16,000
   weekly listeners, $3,500 first-day merch revenue) shown as homepage
   testimonials, but the per-project `resultStat` field is empty and the
   achievements blocks are unused.

---

## 10. If you are proposing something

Useful to state alongside an idea:

- whether it needs any server behaviour (if yes, say so — it's a real cost)
- what new Sanity fields it would need, and who fills them in
- whether it adds a third-party request
- how it behaves on a phone, and with JavaScript disabled
- whether it can be measured — this project's standing rule is that nothing is
  reported as working until a real build has been measured saying so
