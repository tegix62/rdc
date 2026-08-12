/*
  Find the url fields in a Sanity document that would fail validation.

  A failing url field is not a local problem: Sanity's url type is error-level,
  and one error-level failure anywhere in a document disables the Publish button
  for the WHOLE document. Chris hit that tonight - he could not publish a Meta
  Pixel ID because two client logo links held internal paths.

  Extracted into its own file so the publisher and the test share one
  implementation. When the test asserts a nested href is found, that has to be
  an assertion about the code that actually runs, not about a copy of it.
*/

/**
 * Why this value would fail Sanity's url validation, or null if it is fine.
 *
 * Relative paths pass, because clientLogos[].href sets allowRelative. That is
 * the whole point of the schema fix, so the checker has to agree with it -
 * flagging "/work/dumpstat" here would recreate the original bug one layer up
 * and send someone off to delete correct content again.
 */
export const badUrl = (v) => {
  if (v === undefined || v === null) return null // absent is fine
  if (typeof v !== 'string') return 'not a string'
  if (v.trim() === '') return 'empty string - Sanity treats this as invalid, not as absent'
  if (v.startsWith('/')) return null
  try {
    const scheme = new URL(v).protocol
    return scheme === 'http:' || scheme === 'https:'
      ? null
      : `scheme "${scheme}" - url fields allow http and https only`
  } catch {
    return 'not a parseable URL - a bare domain with no https:// fails this'
  }
}

/*
  Matches on key NAME, because a GROQ read carries no schema types. A
  url-typed field named something else slips through, which is a real gap and
  is reported to the user rather than papered over.
*/
const URLISH = /^(url|href)$/i

/**
 * Every url-ish field in the document that would fail validation, at any depth,
 * as [path, value, reason].
 *
 * Walks the whole tree rather than a list of known field names. The list
 * version missed clientLogos[].href and then reported the document clean,
 * which is the failure this exists to prevent: a check can only find what its
 * author remembered to point it at.
 */
export function findUrlProblems(doc) {
  const problems = []

  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => {
        // _key beats an index: it survives reordering, and it is what a Studio
        // URL uses, so the path can be pasted in to find the field.
        walk(item, item?._key ? `${path}[_key=="${item._key}"]` : `${path}[${i}]`)
      })
      return
    }
    if (!node || typeof node !== 'object') return

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('_')) continue
      const here = path ? `${path}.${key}` : key
      if (URLISH.test(key)) {
        const why = badUrl(value)
        if (why) problems.push([here, value, why])
      } else {
        walk(value, here)
      }
    }
  }

  walk(doc, '')
  return problems
}
