import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {presentationTool} from 'sanity/presentation'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

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
    structureTool(),
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
  },
})
