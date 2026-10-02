import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {presentationTool} from 'sanity/presentation'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import structure, {defaultDocumentNode} from './structure'
import {openLiveAction, passwordBadge, pageTypeBadge} from './documentActions'

// Which site the Presentation tab loads in its preview panel.
//
// Defaults to the deployed preview, so the Studio works from any device with
// nothing running locally. Click-to-edit works there, but the page only
// reflects changes after a rebuild, since that site is statically generated.
//
// For live-as-you-type editing, run the site locally with `npm run dev` and
// set SANITY_STUDIO_PREVIEW_URL=http://localhost:4321 - a dev server renders
// each request on demand, so edits appear immediately.
//
// Whichever URL is used, that site must be built with
// PUBLIC_SANITY_VISUAL_EDITING=true or there will be nothing to click.
const PREVIEW_URL =
  process.env.SANITY_STUDIO_PREVIEW_URL || 'https://preview.rumeau-design-co.pages.dev'


export default defineConfig({
  name: 'default',
  title: 'Rumeau Design Co',

  projectId: '8337vjtf',
  dataset: 'production',

  plugins: [
    structureTool({structure, defaultDocumentNode}),
    presentationTool({
      previewUrl: {
        initial: PREVIEW_URL,
      },
      // Without this, Presentation loads the page but refuses to talk to it,
      // reporting "unable to connect" with the Edit toggle greyed out. It
      // defaults to null, which only permits a preview on the Studio's own
      // origin - and the Studio is on sanity.studio while the site is on
      // pages.dev. Deploy-specific URLs get a wildcard so a preview of an
      // older build still connects.
      allowOrigins: [
        'https://preview.rumeau-design-co.pages.dev',
        'https://*.rumeau-design-co.pages.dev',
        'http://localhost:4321',
      ],
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
    /*
      WHAT "NEW" MEANS IN EACH LIST.

      pageType decides which two thirds of the form apply, and it defaults to
      'Case Study' - so every one of the 67 grid items was created as a
      project and then changed. That is a step per tile, and a step that is
      easy to forget: a tile left as a Case Study gets a page at /work/… with
      nothing on it.

      These templates let the Structure lists create the thing they list. See
      structure.ts, where each list names the one it uses.
    */
    templates: (prev) => [
      ...prev,
      {
        id: 'caseStudy-project',
        title: 'Project page',
        schemaType: 'caseStudy',
        value: {pageType: 'Case Study'},
      },
      {
        id: 'caseStudy-grid-item',
        title: 'Grid Item',
        schemaType: 'caseStudy',
        value: {pageType: 'Grid Item'},
      },
    ],
  },

  /*
    Appended to what Sanity already provides rather than replacing it: the
    default actions are publish, unpublish, duplicate, delete and discard
    changes, and every one of them is load-bearing. `prev` first, ours after.

    See documentActions.ts for what each one is for.
  */
  document: {
    actions: (prev) => [...prev, openLiveAction],
    badges: (prev) => [...prev, pageTypeBadge, passwordBadge],
  },
})
