# Finishing the case studies

You are not stuck on taste. You are stuck because you are making two decisions
at once — *what shape is this page* and *which picture goes here* — on every
project, from scratch, five times. That is five structural decisions and about
forty asset decisions, all interleaved, all reversible, none of them ever
finished.

This document collapses that into one structural decision you already made,
plus a fill-in-the-blank.

---

## 1. The template exists. You built it twice.

`studio/migration/data/caseStudyLayouts.json` holds the layouts you shipped on
Webflow. DumpStat and Adelante Barbell Club are **structurally identical** —
same seven blocks, same order, no variation:

| # | Block | Job |
|---|---|---|
| 1 | `fullImage` | The money shot. Finished work, in the world. |
| 2 | `imageText` | Process image + **the only real paragraph on the page**. |
| 3 | `twoUp` | Two applications. Merch, usually. |
| 4 | `fullImage` | The hand. Sketch sheet, process, the pre-digital evidence. |
| 5 | `achievements` | Three bullets of proof + two images. |
| 6 | `twoUp` | Two more applications, or before/after. |
| 7 | `fullImage` | The closer. |

Hug a Mug is the same spine with the story stretched out and a video in front
of it. So the answer to "what do I present" is: **this, five times.** Not a new
idea per project. The variation is the work, not the layout.

Seven slots × five projects = 35 images. You have most of them already.

---

## 2. The rule that ends the picture problem

**Never pick the best image. Pick the image that does the job.**

Every slot above has exactly one job. When you sit down to fill slot 4, the
question is not "which of my Adelante images is strongest" — it is "which one
is the *hand*." Usually there is only one candidate. Often there is zero, and
then you know precisely what to go shoot, which is a far better problem than
staring at a folder.

Six roles cover everything:

- **In the world** — product on a body, on a wall, in the shop. Slots 1 and 7.
- **The mark alone** — wordmark, logo grid, brand sheet. Slot 2's image.
- **The hand** — sketches, process sheets, timelapse. Slot 4.
- **Applications** — merch, flyers, packaging, signage. Slots 3 and 6.
- **Before / after** — the single most persuasive image an agency will see.
  Slot 6 or 7 when it exists.
- **Proof** — a number. Not an image at all. Slot 5.

If an image doesn't answer to one of those six, it is a Grid Item, not a case
study asset. That is what Grid Items are *for*, and you have 67 of them.

---

## 3. Where each project actually stands

### Hug a Mug — done. Use it as the reference.

Eleven blocks, all real copy, real links, two NJ.com awards, `resultStat`
filled (`+22% Increase in Yearly Revenue`), a headline that works. Eleven
grid items behind it.

Outstanding: the two Instagram video URLs Webflow's API wouldn't give up
(`PUNCH-LIST.md` § Missing video sources). Send the links, they drop into a
Media Row. Nothing else.

### DumpStat — structurally finished, copy half-written.

All seven blocks have real assets. Accent `#db1e32`. Credits real (Jason
Walcott, Ed Benguiat). The achievements bullets are written and good. Summary
is real and strong.

Still lorem: `projectDetailsHtml`, `servicesRenderedHtml`.
Still empty: `headline`, `resultStat`.

The lorem is currently invisible — `src/pages/work/[slug].astro:202` only
renders `body`/`servicesRendered` when `sections` is empty — but it is sitting
in your CMS waiting to surface the day a section array gets cleared. Delete it.

`resultStat` is already written, inside your own achievements bullet:
**15,000 weekly downloads** or **Top 5 on Spotify**. Pick one, put it in the
field.

### Adelante Barbell Club — same story.

Seven blocks, all real, including a genuine **before/after** in slot 7
(`RumeauDesign-AdelanteBarbellClub-BeforeAfter.png`). That image is worth more
than the other six combined; consider promoting it to slot 1.

Still lorem: `projectDetailsHtml`, `servicesRenderedHtml`, `principalType`,
`client`.
Still empty: `headline`, `resultStat`.

`principalType` is recoverable from your own credits — **Cervo Neue** (Błażej
Ostoja Lniski) and **Union Condensed** (Lachlan Philp). `resultStat` is in
achievements bullet 3: **$3,500 first-day revenue**.

### Two Point Oh — best raw material, no structure.

This one has more real content than DumpStat and reads worse, because none of
it is arranged. What's already there:

- A real, written body: Merch / Flyers / Film / Ads, with the six-months-on-
  the-road framing. Not lorem — you wrote this.
- A real services list, six items.
- A **4K full live set on YouTube**, shot and edited by you.
- Seven flyer GIFs, animated.
- A Crush cover timelapse GIF.
- Client logo, and three photographers with live URLs.

Lorem in every field that renders above the fold: `headline`, `resultStat`,
`oneLineSummary`, `summary`. That is why it reads as unfinished — the only
broken parts are the four the visitor sees first.

This is the one project that should **not** use the seven-block spine. Its
shape is the cycle:

1. `videoHero` — the live set (or keep `filmEmbed` where it is)
2. `text` — the six-months paragraph you already wrote
3. `mediaRow` — four of the seven flyer GIFs
4. `twoUp` — merch
5. `text` — Film / Ads
6. `fullImage` — closer

Two real gaps: the three photographers belong in the `credits` array (built,
empty), and the hero is **820×360** — the only source on the site that no
amount of processing can save. It needs a re-export. See `SITE-BRIEF.md` § 8.

### Chateau Seven — cannot carry a page today. Decide, don't grind.

One asset: a brand sheet JPEG. No `mainImage`, no client, no body, no
services, no grid items, no summary beyond one line. Its thumbnail also has
"serve exactly as uploaded" switched on, which is why the tile reads wrong on
desktop — that's a one-click fix, fully diagnosed in `SITE-BRIEF.md` § 8.

You cannot write your way out of one image. Two honest options:

**(a) Shoot it.** Embroidery and a modular logo system is the most distinctive
craft story in the whole portfolio, and it deserves better than a flat sheet.
Five assets, half a day: the modular system laid out showing the permutations,
an embroidery macro (thread texture is the entire pitch), a garment on a body,
the existing brand sheet, one sketch.

**(b) Demote it to a Grid Item for launch** and ship four case studies.

Recommendation: (b) now, (a) when you have the day. Four finished pages beat
five with a thin one — the thin one is what an agency remembers.

### Bonus: you have six, not five.

`More Kilos, Less Egos` is a sixth case study page and it is lorem end to end.
It is also a sub-project of Adelante — its merch photography is already sitting
in Adelante's grid items. Fold it in as a section, or demote it. Either way
you land on the five you asked for.

---

## 4. Do it field-first, not project-first

This is the part that actually unsticks you. **Do not finish one project at a
time.** Do one field across all five in a sitting:

1. **`resultStat` — 20 minutes, all five.** Three of them are already written
   inside your own achievements bullets. This is transcription, not writing,
   and it is the field an agency scans for.
2. **`headline` — one sitting.** You already found the formula on Hug a Mug:
   *[what kind of business] + [what changed] + [the number].* "How a Coffee
   Shop Rebrand Increased Revenue by 22%." Apply the same shape:
   - DumpStat — *How Two Guys With a Podcast Reached Spotify's Top 5*
   - Adelante — *How a Powerlifting Gym's Rebrand Sold $3,500 on Day One*
   - Two Point Oh — no number of that shape exists; it's *Six Months, One
     Album Cycle, One Person* instead.

   Drafts, built only from numbers already in your copy. Yours to approve or
   rewrite — but rewrite them against the formula, not from scratch.
3. **Delete every lorem field.** An empty field is honest; the page code
   already handles empty everywhere. Lorem is the thing that makes the CMS feel
   unfinished and makes you avoid opening it.
4. **`principalType` on all five.** This is the most distinctive thing on your
   schema and it is one line per project. Adelante's is recoverable from its
   own credits.
5. **Only then**, fill image slots — and only for the slots the spine says
   exist, using the six roles.

Five sittings. None of them requires choosing between two pictures you like.

---

## 5. What only you can supply

Everything else on this list is arrangement. These are the genuine blanks:

- Two Instagram video URLs (Hug a Mug), three audiogram clips (DumpStat).
- A Two Point Oh hero re-export at 2400px or wider.
- The Chateau Seven decision — shoot it, or demote it.
- Five headlines and five result stats, approved.
