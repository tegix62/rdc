# Streamlining Sanity Studio

Written 2026-08-10, from measured fill-rates across all 91 documents
(`ci-reports` branch, `latest/cms.json`) rather than from opinion. Every
"never used" below is a count, not a guess.

Nothing here changes the site. It changes what Chris sees when he opens a
document.

---

## The headline number

`caseStudy` is one document type doing two jobs:

| | count | fields it can use |
|---|--:|--:|
| Case Study (has a page at `/work/…`) | 13 | 31 |
| Grid Item (a tile, no page of its own) | 62 | **11** |

Every one of those 62 Grid Items shows all 31 fields. Twenty of them —
headline, subtitle, result stat, client, client logo, summary, body, services,
three legacy galleries, film embed, accent colour, credits, sections, principal
type and its link, main image, hero video — can only ever do something on a
page that exists. A Grid Item has no page.

Summed across the dataset that is **1,426 field slots that are always empty and
always on screen.** It is the single biggest reason the Studio feels heavy, and
it costs nothing to fix.

---

## 1. Hide what cannot apply (biggest win, no data migration)

Sanity takes a `hidden` callback per field:

```ts
hidden: ({document}) => document?.pageType !== 'Case Study',
```

Applied to those 20 fields, opening a Grid Item shows 11 fields instead of 31.
Opening a Case Study is unchanged. No content moves, nothing is deleted, and
removing the line puts a field back.

The same trick retires two more bits of noise:

- `parentBrand` — only meaningful **on** a Grid Item; hide it on Case Studies.
- `heroVideoFile` / `heroVideoWebm` / `heroVideoPlayback` — four fields for a
  feature used on **1 of 75** documents. Hide them unless a hero video is
  actually being set.

**Alternative considered and rejected:** splitting into two document types.
Conceptually cleaner, but it means migrating 75 documents and rewriting every
GROQ query for a purely cosmetic gain. Not worth the risk this close to launch.

## 2. Group the rest into tabs

Sanity supports field groups, which render as tabs across the top. Nothing in
this schema uses them today — all 31 fields are one flat scroll.

Proposed for `caseStudy`:

| Tab | Fields |
|---|---|
| *(always visible)* | title, slug, pageType |
| **Tile** | thumbnail, archiveMark, category, assetType, heroTile, tileTreatment, parentBrand |
| **Story** | mainImage, heroVideo, headline, subtitle, summary, resultStat, client, clientLogo, sections |
| **Credits** | principalType, principalTypeUrl, credits |
| **Legacy** | body, servicesRendered, merchGrid, flyerGrid, processGrid, filmEmbed, accentColor |

`siteSettings` (21 flat fields) wants the same treatment: **Brand** (title,
logo, favicon, tagline, portrait) / **Homepage** (hero background, featured
work, bio, proof stats, checklist, closer, final CTA) / **Footer & social**.

## 3. The image options panel

Chris's own note: the compression toggle "takes up a lot of the user interface."
Confirmed — `imageBehaviourFields` appends three fields to **every** image on
the site, and one of them (`inkMode`) renders as a four-option radio with a
live image preview under each. That is the tallest control in the Studio and it
is on roughly twenty image fields.

Three changes:

**a. Keep `alt` visible and prominent.** It is empty on all 75 case studies and
all 5 blog posts, which is why every image in a case study body currently ships
`alt=""`. This field needs *more* attention, not less.

**b. Collapse `noRecompress` into a collapsed fieldset** — "Delivery options",
shut by default. The setting matters everywhere, so it stays available
everywhere; it just stops occupying the page when nobody is changing it.

**c. Drop `inkMode` from image fields where it cannot do anything.** Print mode
only runs on `/portfolio`. The treatment therefore only affects the grid tile —
`thumbnail`, and `mainImage` when it stands in for one. It is currently offered
on blog images, the logo, the favicon, the portrait, both page backgrounds,
every section-block image, and on `archiveMark`, which *is* the hand-made print
version — asking how to auto-threshold it is nonsense.

That means two helpers instead of one:

```
imageFields      -> alt + [Delivery options: noRecompress]      (~18 fields)
tileImageFields  -> alt + [Delivery options: noRecompress, inkMode]  (thumbnail, mainImage)
```

## 4. Retire outright

Confirmed dead — nothing in `src/` reads them, so editing them changes nothing:

| Field | Filled | Note |
|---|--:|---|
| `caseStudy.featured` | 74/75 | migration noise; the site never reads it |
| `blogPost.featured` | 5/5 | same |
| `blogPost.color` | 1/5 | audit misses it — the name collides with CSS `color` |
| `blogPost.length` | 2/5 | audit misses it — collides with `.length` |
| `siteSettings.navLinks` | 0/1 | **a nav editor that does nothing.** The nav is hardcoded in `Layout.astro`. Either wire it up or remove it — leaving it is a trap |

The last three are invisible to the automated audit because it matches on field
*name* and those names appear all over the codebase for unrelated reasons. Worth
knowing the audit has that blind spot.

**Keep despite 0 fills:** `tileTreatment` (0/75) and `principalTypeUrl` (0/75).
The first is a deliberate manual override for `assetType`; the second is the
credit-linking Chris asked for days ago and hasn't had reason to use yet. Both
belong behind a tab, not deleted.

## 5. Merge the redundant pair

`oneLineSummary` (11/75) and `summary` (5/75) are two fields for one job — the
template already does `summary ?? oneLineSummary`. Two boxes that mean the same
thing is exactly the kind of thing that makes a CMS feel fussy.

Merge to one `summary`, backfilling from `oneLineSummary` where the new field is
empty. Needs a small content migration, so it is a deliberate job rather than a
schema edit.

## 6. The two content systems (the real long-term one)

A case study can be built two ways:

- **Legacy:** `body` (5/75) + `servicesRendered` (5) + `merchGrid` (2) +
  `flyerGrid` (1) + `processGrid` (1) — inherited from Webflow
- **Current:** `sections` (3/75) — the twelve block types

The template picks: `sections` if present, otherwise the legacy path. So Chris
has to remember which system each project uses, and five case studies still
depend on the old one.

Those five need their content moved into `sections` before the legacy fields can
go. That deletes five fields and removes the fork. It is the biggest
simplification available, and the only one on this page that needs real content
work rather than a schema edit — so it is last.

---

## Suggested order

1. **Hide-by-pageType** — one line per field, no migration, 31 fields → 11 on 62 documents
2. **Collapse the image options, split `inkMode` out** — removes the tallest control from ~18 fields
3. **Delete the five dead fields** — `navLinks` especially, it is a trap
4. **Field groups / tabs** on `caseStudy` and `siteSettings`
5. **Merge the two summary fields** — small content migration
6. **Move five case studies onto `sections`, retire the legacy path** — real content work
