/*
  Loads studio/schemaTypes as plain data, without Studio's runtime.

  Extracted so the CMS audit and the schema-shape test share one loader. They
  each had their own before, and duplicated loaders drifting apart is precisely
  how the audit ended up broken for weeks: its private stub exported four names,
  and the day a schema file imported a fifth it died silently.
*/
import {build} from 'esbuild'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

/*
  CommonJS with a Proxy, not a fixed list of ESM named exports.

  esbuild verifies ESM named imports at build time, so any fixed list breaks the
  moment a schema file pulls in something new - a custom input component
  importing `set` and `useFormValue` is what broke it last time. A CJS export
  cannot be statically checked, so named imports resolve through the Proxy at
  runtime and ANY name works.

  defineType/defineField exist purely for editor types; at runtime they hand
  back exactly what they were given, so identity is faithful.
*/
const stubSanity = {
  name: 'stub-sanity',
  setup(b) {
    b.onResolve({filter: /^sanity$/}, () => ({path: 'sanity', namespace: 'stub'}))
    b.onResolve({filter: /^sanity\//}, (a) => ({path: a.path, namespace: 'stub'}))
    b.onResolve({filter: /^@sanity\//}, (a) => ({path: a.path, namespace: 'stub'}))
    // React too: a field can point at a custom input component, and that
    // component imports hooks. Nothing here renders, so identity is enough.
    b.onResolve({filter: /^react$/}, () => ({path: 'react', namespace: 'stub'}))
    b.onResolve({filter: /^react\//}, (a) => ({path: a.path, namespace: 'stub'}))
    b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({
      contents: `
        const identity = (x) => x
        module.exports = new Proxy(
          {
            defineType: identity,
            defineField: identity,
            defineArrayMember: identity,
            definePlugin: identity,
          },
          {get: (target, key) => (key in target ? target[key] : identity)},
        )
      `,
      loader: 'js',
    }))
  },
}

/** @returns the array exported as `schemaTypes` from studio/schemaTypes/index.ts */
export async function loadSchemaTypes(root) {
  const outdir = await mkdtemp(path.join(tmpdir(), 'schema-'))
  const outfile = path.join(outdir, 'schema.mjs')
  await build({
    entryPoints: [path.join(root, 'studio/schemaTypes/index.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    plugins: [stubSanity],
    logLevel: 'warning',
  })
  const {schemaTypes} = await import(outfile)
  return schemaTypes
}
