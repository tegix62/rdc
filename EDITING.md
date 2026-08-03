# Editing the site

All the site's content lives in Sanity, not in the code. You never need to
touch a file to change words or swap an image.

## The plain way: Sanity Studio

**https://rumeau-design-co.sanity.studio**

A form-based editor: pick a document on the left, edit fields on the right,
hit Publish. Everything is here - case studies, blog posts, page copy, and
the homepage text under **Site Settings**.

You need a Sanity account invited to the project (`8337vjtf`). If you can't
get in, sign up at sanity.io/manage with your email and ask to be added.

Publishing does **not** update the live site by itself - see "Seeing changes
live" below.

## The Webflow-ish way: click on the page to edit it

Studio has a **Presentation** tab that loads the site in a panel next to the
editor. Click any bit of text on the page and it jumps straight to the field
that produced it - no hunting through documents.

There are two ways to run it.

### Locally - the full experience

Changes appear **as you type**, which is the closest thing to Webflow.

In one terminal:

```
npm install
npm run dev
```

In a second terminal:

```
cd studio
npm install
npm run dev
```

Open **http://localhost:3333**, go to the **Presentation** tab. The site
loads in the panel. Click text to edit it; the page updates instantly.

### From any device - no setup

Open **https://rumeau-design-co.sanity.studio** and use the Presentation tab.
Click-to-edit works the same, but the page only reflects your changes **after
a rebuild** (a minute or two), not as you type - the deployed site is
pre-built.

This previews **https://preview.rumeau-design-co.pages.dev**, which is the
stable address for the current build. Individual deploys also get their own
throwaway URL with a random prefix; that one changes every push, so bookmark
the `preview.` one.

## Seeing changes live

Publishing in Studio updates the content, but the site is **pre-built** - it
gets regenerated on deploy, not on every page view. So after publishing:

- Locally with `npm run dev`: immediate.
- On the deployed site: it picks up your changes on the next build. Re-run
  the **Deploy to Cloudflare Pages** workflow in GitHub Actions to force one.

## Your edits are safe from the migration

There's a workflow that imports content from the old Webflow site. It used to
overwrite everything on each run, which would have wiped anything you'd typed.

It no longer does. It only fills in fields that are still **empty** - anything
with a value in it, including everything you write, is left alone.

The one exception is deliberate: the migration workflow has a **force**
checkbox for manual runs, which does overwrite. Don't tick it unless you mean
to throw away Studio content and reset to the imported version.

## Before going live on rumeaudesign.co

The preview deployment has click-to-edit turned on, which embeds invisible
markers in the page text. Harmless for a preview, but pointless for real
visitors - and they tag along if someone copies text off the page.

Set `PUBLIC_SANITY_VISUAL_EDITING` to `false` in
`.github/workflows/deploy-pages.yml` (or remove it) before pointing the real
domain at this build.
