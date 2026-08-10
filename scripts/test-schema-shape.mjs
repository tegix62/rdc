/*
  Checks the Studio schema is internally consistent, without running Studio.

  Why this exists: the schema was reorganised into tabs, collapsed fieldsets and
  conditional fields, and every one of those is a *reference* that can dangle.
  A field saying `fieldset: 'delivery'` whose parent never declares a fieldset
  called `delivery`, or `group: 'page'` where no such group exists, is valid
  JavaScript and a broken Studio. `npm run build` on the site would not notice
  either, because the site never loads the schema.

  There is no sandbox here that can run Studio, so these are the assertions that
  would otherwise have to be checked by opening it and clicking around.

  What it checks:

    fieldsets    every `fieldset:` names one its parent declares
    groups       every `group:` names one the document declares
    ink mode     the print-mode radio only appears where print mode can apply
    removed      the five dead fields really are gone
    hidden       page-only fields on caseStudy carry a `hidden` predicate, and
                 the tile fields deliberately do not
    alt          every image field still offers alt text

  Usage: node scripts/test-schema-shape.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadSchemaTypes} from './lib/load-schema.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const types = await loadSchemaTypes(root)
const byName = new Map(types.map((t) => [t.name, t]))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

/*
  Walk every field of every type, including fields nested inside objects and
  array members, carrying the parent along so a fieldset reference can be
  resolved against whoever declares it.
*/
function walk(node, visit, parent = null, trail = []) {
  if (!node || typeof node !== 'object') return
  const here = [...trail, node.name ?? node.type ?? '?']
  if (parent) visit(node, parent, here)
  for (const child of node.fields ?? []) walk(child, visit, node, here)
  for (const member of node.of ?? []) walk(member, visit, node, here)
}

// --- fieldsets and groups resolve -------------------------------------------
const danglingFieldsets = []
const danglingGroups = []
for (const type of types) {
  walk(type, (field, parent, trail) => {
    if (field.fieldset) {
      const declared = (parent.fieldsets ?? []).some((f) => f.name === field.fieldset)
      if (!declared) danglingFieldsets.push(`${trail.join('.')} -> '${field.fieldset}'`)
    }
    if (field.group) {
      const groups = Array.isArray(field.group) ? field.group : [field.group]
      // Groups are declared on the document, which is the root of this walk.
      const declared = (type.groups ?? []).map((g) => g.name)
      for (const g of groups) {
        if (!declared.includes(g)) danglingGroups.push(`${trail.join('.')} -> '${g}'`)
      }
    }
  })
}
check(
  'every fieldset reference resolves',
  danglingFieldsets.length === 0,
  danglingFieldsets.join(' | ') || 'no dangling fieldsets',
)
check(
  'every group reference resolves',
  danglingGroups.length === 0,
  danglingGroups.join(' | ') || 'no dangling groups',
)

// --- print-mode treatment only where print mode can apply -------------------
/*
  Print mode is a switch on /portfolio and nowhere else, so the treatment can
  only ever change a grid tile. It used to be on ~20 image fields, including
  archiveMark - which IS the hand-drawn print version.
*/
const INK_ALLOWED = new Set(['caseStudy.thumbnail', 'caseStudy.mainImage'])
const inkFound = []
for (const type of types) {
  walk(type, (field, _parent, trail) => {
    if ((field.fields ?? []).some((f) => f.name === 'inkMode')) {
      inkFound.push(trail.join('.'))
    }
  })
}
const inkUnexpected = inkFound.filter((p) => !INK_ALLOWED.has(p))
check(
  'print-mode treatment only on tile images',
  inkUnexpected.length === 0,
  inkUnexpected.length ? `also on: ${inkUnexpected.join(', ')}` : inkFound.join(', '),
)

// --- compression is still available everywhere, just folded away ------------
const imagesMissingCompression = []
const imagesMissingAlt = []
for (const type of types) {
  walk(type, (field, _parent, trail) => {
    if (field.type !== 'image') return
    const names = (field.fields ?? []).map((f) => f.name)
    // The favicon is shown by the browser at 32px and never goes through the
    // site's image pipeline, so it legitimately has neither.
    if (trail.join('.') === 'siteSettings.favicon') return
    if (!names.includes('noRecompress')) imagesMissingCompression.push(trail.join('.'))
    if (!names.includes('alt')) imagesMissingAlt.push(trail.join('.'))
  })
}
check(
  'every image still offers the compression toggle',
  imagesMissingCompression.length === 0,
  imagesMissingCompression.join(', ') || 'all of them',
)
check(
  'every image still offers alt text',
  imagesMissingAlt.length === 0,
  imagesMissingAlt.join(', ') || 'all of them',
)

// --- the dead fields are gone ----------------------------------------------
const REMOVED = [
  ['caseStudy', 'featured'],
  ['blogPost', 'featured'],
  ['blogPost', 'color'],
  ['blogPost', 'length'],
  ['siteSettings', 'navLinks'],
]
const stillPresent = REMOVED.filter(([t, f]) =>
  (byName.get(t)?.fields ?? []).some((x) => x.name === f),
).map(([t, f]) => `${t}.${f}`)
check(
  'the five dead fields are removed',
  stillPresent.length === 0,
  stillPresent.join(', ') || 'featured x2, color, length, navLinks',
)

// --- conditional visibility on caseStudy -----------------------------------
/*
  62 of 75 documents are Grid Items, which have no page. Anything that can only
  appear on a project page must carry a `hidden` predicate; the fields a tile
  actually uses must NOT, or a Grid Item would lose the form it needs.

  mainImage is deliberately in the second list: the grid falls back to it when
  there is no thumbnail, so on some Grid Items it is the only image there is.
*/
const PAGE_ONLY = [
  'heroVideo', 'headline', 'subtitle', 'oneLineSummary', 'summary', 'resultStat',
  'client', 'clientLogo', 'sections', 'principalType', 'principalTypeUrl',
  'credits', 'body', 'servicesRendered', 'merchGrid', 'flyerGrid', 'processGrid',
  'filmEmbed', 'accentColor',
]
const TILE_ALWAYS = [
  'title', 'slug', 'pageType', 'category', 'thumbnail', 'mainImage',
  'archiveMark', 'heroTile', 'assetType', 'tileTreatment',
]
const csFields = new Map((byName.get('caseStudy')?.fields ?? []).map((f) => [f.name, f]))

const missingHidden = PAGE_ONLY.filter((n) => csFields.has(n) && !csFields.get(n).hidden)
const wronglyHidden = TILE_ALWAYS.filter((n) => csFields.has(n) && csFields.get(n).hidden)
check(
  'page-only fields are hidden on a Grid Item',
  missingHidden.length === 0,
  missingHidden.join(', ') || `${PAGE_ONLY.length} fields`,
)
check(
  'fields a tile needs are never hidden',
  wronglyHidden.length === 0,
  wronglyHidden.join(', ') || `${TILE_ALWAYS.length} fields`,
)

/*
  And the predicates actually do what they claim, rather than merely existing.
  Called with a Grid Item and with a Case Study.
*/
const asGrid = {pageType: 'Grid Item'}
const asStudy = {pageType: 'Case Study'}
const badPredicate = PAGE_ONLY.filter((n) => {
  const f = csFields.get(n)
  if (!f || typeof f.hidden !== 'function') return false
  return !(f.hidden({document: asGrid}) === true && f.hidden({document: asStudy}) === false)
})
check(
  'those predicates hide on Grid Item and show on Case Study',
  badPredicate.length === 0,
  badPredicate.join(', ') || 'verified by calling each one',
)

// parentBrand is the inverse: only a Grid Item has a parent.
const pb = csFields.get('parentBrand')
check(
  'parentBrand is hidden on a Case Study instead',
  typeof pb?.hidden === 'function' &&
    pb.hidden({document: asStudy}) === true &&
    pb.hidden({document: asGrid}) === false,
)

// --- how much lighter did the form actually get? ---------------------------
const visibleOnGrid = (byName.get('caseStudy')?.fields ?? []).filter(
  (f) => !(typeof f.hidden === 'function' && f.hidden({document: asGrid})),
).length
const visibleOnStudy = (byName.get('caseStudy')?.fields ?? []).filter(
  (f) => !(typeof f.hidden === 'function' && f.hidden({document: asStudy})),
).length
console.log(
  `\ncaseStudy form: ${visibleOnGrid} fields on a Grid Item, ` +
    `${visibleOnStudy} on a Case Study (was 31 for both)`,
)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
