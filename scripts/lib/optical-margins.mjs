/*
  OPTICAL MARGIN ALIGNMENT - Chris: "capital letters that start, you know,
  for example, the C on Chateau 7 can be pushed to the left a little bit to
  compensate optically." A round capital (C, G, O, Q, S) or a pointed one
  (A, V, W, Y, T) only touches the margin at a point, so set flush it looks
  indented next to a straight stem (H, E, L). At display sizes it is nudged
  into the margin by a fraction of an em, as InDesign's Optical Margin
  Alignment does; an opening quote hangs right out (hanging punctuation).

  Browsers do this for neither, so the build does it: the first letter of
  each h1 and h2 is wrapped in a span whose class carries the nudge
  (global.css, OPTICAL MARGINS). Tested by scripts/test-optical-margins.mjs.
*/

// Which first characters move, and which class says how far.
export const SHAPES = {
  round: ['C', 'G', 'O', 'Q'],
  soft: ['S'],
  point: ['A', 'V', 'W', 'Y'],
  bar: ['T'],
  quote: ['“', '‘', '"', "'"],
}
const CLASS_OF = new Map(Object.entries(SHAPES).flatMap(([k, cs]) => cs.map((c) => [c, `om om-${k}`])))

// Invisible characters (click-to-edit markers on the preview) may come before the letter; they are kept as they are.
const INVISIBLE = /[​-‍⁠-⁤﻿]/
// Inline wrappers a heading's text may start inside of; anything else (a picture, a line break) ends the search.
const WRAPPER = /^<(a|span|em|strong|b|i|mark|abbr)\b[^>]*>/i

/** Returns {html, count}: every h1 and h2 whose first letter is round, pointed or a quote, with that letter wrapped. */
export function opticalMargins(html) {
  const marks = []
  html.replace(/<(h1|h2)\b[^>]*>/gi, (open, _tag, offset) => {
    // Look past the opening tag, through whitespace, inline wrappers and invisible markers, to the first visible character.
    let k = offset + open.length
    for (let guard = 0; guard < 12; guard++) {
      const rest = html.slice(k, k + 400)
      const ws = rest.match(/^\s+/)
      if (ws) {
        k += ws[0].length
        continue
      }
      const wrap = rest.match(WRAPPER)
      if (wrap) {
        k += wrap[0].length
        continue
      }
      if (INVISIBLE.test(rest[0] ?? '')) {
        k += 1
        continue
      }
      break
    }
    const ch = html[k]
    if (!ch || !CLASS_OF.has(ch) || html.slice(k - 22, k).includes('class="om ')) return open
    marks.push({at: k, ch})
    return open
  })
  // Wrap from the end so earlier positions stay right.
  let result = html
  for (const {at, ch} of marks.sort((a, z) => z.at - a.at)) result = `${result.slice(0, at)}<span class="${CLASS_OF.get(ch)}">${ch}</span>${result.slice(at + 1)}`
  return {html: result, count: marks.length}
}
