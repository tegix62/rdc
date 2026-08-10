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

/*
  Document types that exist for the build, not for a person.

  structureTool() with no structure lists every type in the schema, which put
  "Animated image → video (generated)" in the sidebar next to real content.
  Chris found it there and reasonably assumed it was a tool he had forgotten to
  use. It is not: it is a read-only record of which animations have been
  transcoded, written by studio/migration/convert-animations.mjs. There is
  nothing in it to fill in and nothing to decide.

  Hidden from the list rather than deleted - the site reads it at build time to
  decide whether a converted video exists, and the Vision tool can still query
  it if it ever needs inspecting.
*/
const GENERATED_TYPES = ['animatedVideoMap']

export default defineConfig({
  name: 'default',
  title: 'Rumeau Design Co',

  projectId: '8337vjtf',
  dataset: 'production',

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items(
            S.documentTypeListItems().filter(
              (item) => !GENERATED_TYPES.includes(item.getId() ?? ''),
            ),
          ),
    }),
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
