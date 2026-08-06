# RDC — automated portfolio watermarking

Watermarks portfolio images the way they'd be done by hand, without doing them
by hand: a tiled pattern layer that fades out through the centre like a
vignette, plus small signatures tucked along the edges, placed differently on
every image.

Built for the Astro + Sanity site described in `SITE-BRIEF.md`. The pipeline
itself has no Astro or Sanity dependency — it takes images in and writes
watermarked derivatives out.

```bash
npm install
npm test                                              # 19 behavioural tests
node scripts/watermark.mjs --preview photo.jpg --sheet   # ← start here
node scripts/watermark.mjs --source local --in ~/masters
node scripts/watermark.mjs --source sanity            # pull originals from the CMS
```

---

## Previewing before you commit to settings

Three ways, easiest first.

**1. From GitHub, nothing installed.** Actions → *Watermark portfolio images* →
*Run workflow*, leave mode on `preview`. It pulls the first few images from
Sanity, builds a comparison sheet for each, and attaches them to the run as a
downloadable artifact. Nothing is deployed and nothing is written back to the
CMS. `sheets` controls how many images.

**2. Locally, on real files.**

```bash
node scripts/watermark.mjs --preview ~/masters/hero.jpg --sheet
node scripts/watermark.mjs --sheets 8 --source local --in ~/masters
```

**3. In the browser.** Open `tools/watermark-studio.html`, drag an image in, and
move the sliders. Immediate feedback, nothing uploads.

### What a contact sheet shows

Six panels of the same image — original, subtle (veil ×0.55), current settings,
stronger (veil ×1.6), marks only, veil only — so the decision is a comparison
rather than a guess. Underneath, **100% crops of each edge mark**, rotated back
to horizontal and labelled with which edge they're on.

That strip is the part that matters. The marks are meant to be hard to spot, so
a contact-sheet-sized panel physically cannot tell you whether one is legible,
well placed, or about to be cropped off. The crops are actual delivered size.

Then edit `watermark.config.json` and run it again. `veil.edgeOpacity` is the
main dial; `marks.contrastDelta` is the other one.

---

## The two layers

**The veil** — the phrase in `veil.text` repeated on a rotated grid across the
whole frame, then faded toward the middle by a radial mask. `edgeOpacity` is
what you see at the corners, `centerOpacity` in the middle, and `falloff`
controls how quickly one becomes the other. The default is 0.13 → 0.018, so the
edges carry the mark and the subject stays essentially clean.

Rows are offset half a step and jittered by a seeded amount. A perfectly regular
lattice is easy to model and subtract; an irregular one is not.

**The edge marks** — `marks.count` small signatures placed along the frame
edges, rotated to run vertically on the left and right. For each one the script
generates candidate positions, measures the image underneath each, and keeps the
busiest mid-tone spot. Fine detail hides small low-contrast type from a casual
look far better than flat areas do, and textured regions are also the ones
inpainting-based removers reconstruct least convincingly.

Their colour comes from the pixels underneath — the local mean shifted by
exactly `contrastDelta` in luminance, keeping the region's hue. That's why the
same setting reads the same on a black frame and a white one.

Both layers are driven by a seed derived from `seed` + the image's key, so
placement is **stable per image** (re-running doesn't shuffle everything and
bust caches) but **different between images** (one crop or one scripted pass
doesn't clear the whole portfolio).

### Automatic ink

`veil.color: "auto"` picks the ink **per region**, from the local brightness of
the photo underneath: light type over dark areas, dark type over bright ones.

A single ink chosen from the frame *average* is not good enough. On a real photo
— a white cumulus against a dark sky — the frame averages 0.21, so a global
decision picks white, which then lands at a peak delta of 21–24 on the sky but
only 11–13 on the cloud. Half the strength precisely where the subject is, and a
bright background needs *more* delta to read, not less.

The obvious implementation is wrong, and worth recording: rendering a light copy
and a dark copy and crossfading between them makes things worse, because
wherever both are partly visible their strokes overlap, one lightening and the
other darkening the same pixels, and they cancel. On a mid-grey frame that
measured a peak of 8 against 19 for a single ink. So there is exactly one
stencil, and each of its pixels is painted a single colour.

`darkColor` is `#002885` — the site's one brand colour, since the brief notes
there is deliberately no black in the palette. On very light images this tints
the veil faintly blue. If that reads wrong on real work, `#1a1a1a` is the
neutral alternative.

### The centre is genuinely lightly marked

Worth being explicit, because it surprised me on a real photo: the vignette
means a subject sitting in the middle of the frame carries almost no veil. On
the cumulus shot the cloud is central, so it is protected mostly by the edge
marks and the resolution cap rather than by the veil.

That is the design working as asked — "barely visible in the center" — not a
bug. But it is a real tradeoff, and `centerOpacity` and `falloff` are the dials
if a particular piece needs the middle covered.

---

## Configuration

Everything lives in `watermark.config.json`, with a JSON Schema at
`scripts/config.schema.json` for editor autocomplete. The values that matter
most:

| Key | Effect |
|---|---|
| `veil.edgeOpacity` / `centerOpacity` | How strong the veil is at the frame edge vs the middle |
| `veil.falloff` | Higher keeps the centre clean for longer |
| `marks.count` | How many edge signatures |
| `marks.contrastDelta` | How far the marks sit from their background, 0–1 |
| `output.widths` | Long-edge sizes to emit. **The most important anti-theft setting here** |
| `seed` | Changing it reshuffles every mark. Keep it stable once live |

Each width is watermarked from a fresh resize rather than by downscaling the
largest output, so the mark keeps the same relative weight at 640px as at
2000px. Widths are clamped to the source first, so a 900px master never ships a
blurry "2000px" file — and clamped duplicates collapse rather than rendering
twice.

Nothing lossy happens before the final encode. Intermediates are uncompressed
PNG, because sharp's `toBuffer()` keeps the *input* format at default quality —
a JPEG master was being re-encoded twice on the way to delivery, 5.7 MB → 2.0 MB
→ 0.3 MB, leaving artifacts of ±32 levels in the result. There is a test
asserting a white-ink veil only ever lightens pixels, which is true only if the
path to it is lossless.

Re-runs are incremental: a fingerprint of (source bytes + watermark settings)
decides what needs rebuilding. Editing `edgeOpacity` correctly invalidates
everything; adding one photo rebuilds one photo.

---

## What this actually protects against

Worth being straight about, because watermarking invites overconfidence.

**It does work against** casual reposting, screenshot-and-crop, reflex
right-click-save, and the common automated watermark removers — those are tuned
for large, centred, high-contrast, consistently-placed marks, which is the exact
shape this avoids.

**It does not work against** someone determined. Modern inpainting will remove
edge marks if a person knows they're there and cares enough to look. Nothing
composited into pixels survives an adversary with time.

So the realistic goals are: raise the cost, make casual theft not worth it, and
have provenance to point at afterwards. Two things do more for that than any
watermark setting:

1. **Cap the delivered resolution.** The single most effective control here. The
   site's current srcset goes to 2400px, which is more than a portfolio needs to
   look good and plenty for someone to reuse. `output.widths` tops out at 2000
   and could reasonably be lower.
2. **Keep the ownership metadata.** Every output gets EXIF `Copyright`, `Artist`
   and `ImageDescription`. Trivially stripped — and entirely beside the point,
   because that's the record a takedown or a registration rests on.

Source metadata is deliberately **not** carried through. Camera masters commonly
embed GPS coordinates, and a portfolio shouldn't publish where the work was
shot. There's a test asserting a hostile `Artist` tag in a source doesn't
survive into the output.

---

## Wiring it into the site

The brief asks proposals to state their costs up front, so:

- **Server behaviour needed:** none. This runs at build time and emits static
  files. The static-only constraint is intact.
- **New Sanity fields:** none for options A and B below.
- **New third-party requests:** none. Option B actually *removes* one.
- **Phone / JS-disabled:** the watermark is in the pixels, so it behaves
  identically. The provided component emits `width`/`height` and a srcset, so it
  doesn't reintroduce layout shift.
- **Measured:** 19 tests, run with `npm test`. Not yet measured against the real
  dataset — see the caveat at the end.

Three ways to connect it, in the order I'd recommend them.

### A. Watermark the assets in Sanity *(recommended)*

Watermark each asset and upload the result back as the asset the documents
point at, keeping the original as a separate unreferenced asset.

Site code changes: **zero**. `Img.astro`, `buildSrcSet`, hotspot/crop,
`auto('format')`, the pass-through path — all keep working exactly as they do
now, because from the site's point of view nothing has changed. Page weight and
the third-party list are unaffected.

Costs: it needs a Sanity write token, and it mutates the CMS. The original asset
stays in the dataset and remains publicly addressable by its CDN URL — not
linked from anywhere, but not secret either.

**This part is not built.** It writes to the CMS, so it needs a decision and a
token first.

### B. Serve watermarked files from the site's own origin

What's built here. Outputs land in `public/portfolio` with a lookup at
`src/data/watermarked.json`, rendered by `astro/PortfolioImage.astro` (copy it
to `src/components/`).

This removes `cdn.sanity.io` from the outbound host list, which the brief lists
as an active goal. But it's the more invasive option: it sidesteps `Img.astro`
and so gives up on-demand widths, hotspot/crop, and format negotiation, and it
duplicates the animated-detection and pass-through logic that `src/lib/image.ts`
documents at length. It also adds ~500 files to the deploy.

Take this one only if dropping the Sanity CDN is worth those trades.

### C. Watermark before upload

`tools/watermark-studio.html` — a self-contained page implementing the same two
layers in Canvas. Drop an image in, adjust, download. Nothing uploads; the file
never leaves the tab. Same seeded placement as the build, so a one-off matches
the pipeline's output.

Useful for Instagram posts and client sends regardless of which option above is
chosen. It can be published at an unlisted route or just opened from disk.

### Animated assets are refused, not flattened

The dataset contains animated GIF/WebP assets that `Img.astro` deliberately
serves untouched. sharp reads one frame at a time, so watermarking one would
silently turn an animation into a still. The pipeline detects multi-page sources
and skips them with a message rather than destroying them — reported separately
from failures so it can't fail a build. `allowAnimated: true` opts back in.

Watermarking those properly means treating them as video, which is a different
job and isn't built.

---

## CI

`.github/workflows/watermark.yml` runs on demand or on a `repository_dispatch`
that Sanity's webhook can fire. It caches `.watermark` and `public/portfolio`
between runs so only changed images are re-rendered, and uploads the results as
an artifact rather than deploying them — so output can be inspected and measured
before anything is wired into a deploy.

---

## Before this goes live

**A look at real work.** The settings were tuned against synthetic fixtures.
Hand-drawn logomarks on flat backgrounds are a harder case than photographs —
flat areas give the marks nowhere to hide, and `tileTreatment: "mark"` tiles may
want `marks.enabled: false` and a lighter veil than the photographic ones. Run a
preview over a few real pieces and adjust.

Also worth knowing: this repo's `main` is a bare README — the site lives on
`claude/webflow-astro-sanity-port-ig55e2`. Nothing here has been run against the
real Sanity dataset, because this sandbox's network policy blocks
`8337vjtf.api.sanity.io`. The read path is unit-tested against a mocked
response; it has not talked to the live API.
