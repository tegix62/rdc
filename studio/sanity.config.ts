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
        origin: PREVIEW_URL,
        preview: '/',
      },
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
