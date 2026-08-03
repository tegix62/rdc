import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {presentationTool} from 'sanity/presentation'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

// Which site the Presentation tab loads in its preview panel.
//
// Defaults to a local dev server, because that's the only setup where editing
// is genuinely live: `npm run dev` renders each request on demand, so typing
// in Studio updates the page immediately - the Webflow-style experience.
//
// Point this at a deployed preview URL instead (via SANITY_STUDIO_PREVIEW_URL,
// set at build time) to use it from any device without running anything
// locally. Click-to-edit still works there, but the page only reflects changes
// after a rebuild, since that site is statically generated.
//
// Whichever URL is used, that site must be built with
// PUBLIC_SANITY_VISUAL_EDITING=true or there will be nothing to click.
const PREVIEW_URL = process.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:4321'

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
