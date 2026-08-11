import {createClient} from '@sanity/client'

// Visual editing is opt-in per build. When it's on, the client embeds
// invisible "stega" markers into every string it returns, which is what lets
// Sanity's Presentation tool map a bit of text on the page back to the field
// that produced it. Those markers must never reach the real site: they're
// zero-width characters that tag along when text is copied, and they add
// weight to every page. So this stays off unless a build explicitly asks.
export const VISUAL_EDITING = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING === 'true'

// Where the "edit this" links point. Must match the deployed Studio.
export const STUDIO_URL =
  import.meta.env.PUBLIC_SANITY_STUDIO_URL || 'https://rumeau-design-co.sanity.studio'

// Fields whose values are parsed by the browser rather than read by a person,
// so they must come back as clean strings. Keep this in sync when adding a
// schema field that ends up in an attribute, a URL, or a style value.
const NON_TEXT_FIELDS = new Set([
  'accentColor',
  'href',
  'url',
  'contactUrl',
  'filmEmbed',
  'current', // slug.current
  '_ref',
  '_type',
  '_key',
  /*
    These are compared against literals or used as lookup keys and CSS class
    names, so they must come back as clean strings.

    `category` being absent from this list is what broke the Portfolio filters.
    Its value is used as a key into the filter map, and stega appended invisible
    characters to it, so "Brand Identity" stopped matching "Brand Identity" and
    every tile silently got no filter class. Nothing was visible in the data,
    the markup, or the page - the string simply was not the string any more.
  */
  'category',
  'pageType',
  'parentType',
  'assetType',
  'tileTreatment',
  'inkMode',
  /*
    Alt text lands in an attribute, not in visible prose, and a screen reader
    reads the attribute verbatim - including the zero-width characters stega
    hides in it. Same class of bug as the Portfolio filters above, except the
    only people who would ever notice are the ones relying on assistive
    technology. Excluded before the field ever shipped.
  */
  'alt',
  'iconAlt',
  /*
    A datetime looks like prose to the filter below - it is not a URL, a path or
    a hex colour - so it was being marked, and `new Date()` on a marked string
    returns an Invalid Date. The preview build was printing the literal words
    "Invalid Date" where a blog post's date should be.
  */
  'publishedAt',
])

// Hex colours, and anything that is plainly a URL or path rather than prose.
const MACHINE_VALUE = /^(#[0-9a-fA-F]{3,8}|https?:\/\/\S*|\/\S*)$/

export const sanityClient = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  // The CDN caches aggressively, which is right for the real site but would
  // make a preview build show stale content right after an edit.
  useCdn: !VISUAL_EDITING,
  stega: {
    enabled: VISUAL_EDITING,
    studioUrl: STUDIO_URL,
    // Stega works by hiding zero-width characters inside strings. That's
    // harmless in prose, but corrupts any string the browser has to parse:
    // a hex colour becomes an invalid CSS value, a URL becomes a broken
    // link. Sanity skips things that already look like URLs, which is not
    // enough here - `accentColor` lands in a style attribute and would take
    // the whole case study band's background down with it.
    filter: (props) => {
      const lastKey = (path: unknown) => {
        if (!Array.isArray(path) || !path.length) return ''
        const last = path[path.length - 1]
        // Path segments are strings for keys, objects for array indices.
        return typeof last === 'string' ? last : ''
      }
      if (NON_TEXT_FIELDS.has(lastKey(props.sourcePath))) return false
      if (NON_TEXT_FIELDS.has(lastKey(props.resultPath))) return false
      // Belt and braces: catch machine-readable values even from a field name
      // nobody remembered to add above.
      if (MACHINE_VALUE.test(props.value ?? '')) return false
      return props.filterDefault(props)
    },
  },
})
