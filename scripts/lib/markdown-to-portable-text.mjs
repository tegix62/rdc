/*
  A small markdown -> Portable Text converter, for loading drafted prose into a
  Sanity `body` field.

  DELIBERATELY A SUBSET. It handles exactly what content/privacy-policy.md uses
  and what src/lib/portableText.ts can render: headings, paragraphs, bullet
  lists, bold, inline code, and links. Anything else throws rather than being
  silently dropped, because prose that vanishes between the file and the site is
  the worst outcome here - a privacy policy missing a paragraph is worse than
  one that failed to load at all.

  Tables are the specific thing this cannot do. The page body is
  `[{type:'block'}, image]`, which has no table type, so a markdown table has
  nowhere to go. It throws and names the line.
*/

/*
  Sanity needs a _key on every block and span. Without them Studio's editor
  behaves erratically on reorder and React logs duplicate-key warnings for the
  whole document.
*/
let counter = 0
const key = () => `k${(counter++).toString(36)}`

/**
 * Split one line of markdown into Portable Text spans, with marks.
 *
 * Handles `**bold**`, `` `code` `` and `[text](href)`. Links become markDefs,
 * which is how Portable Text stores annotations - the span carries the def's
 * key, not the URL.
 */
function inline(text) {
  const spans = []
  const markDefs = []

  // One pass, alternating between literal text and the next markup token.
  const TOKEN = /(\*\*(?!\s)(.+?)(?<!\s)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/
  let rest = text

  while (rest.length) {
    const m = TOKEN.exec(rest)
    if (!m) {
      if (rest) spans.push({_type: 'span', _key: key(), text: rest, marks: []})
      break
    }
    if (m.index > 0) {
      spans.push({_type: 'span', _key: key(), text: rest.slice(0, m.index), marks: []})
    }
    if (m[1] !== undefined) {
      spans.push({_type: 'span', _key: key(), text: m[2], marks: ['strong']})
    } else if (m[3] !== undefined) {
      spans.push({_type: 'span', _key: key(), text: m[4], marks: ['code']})
    } else {
      const defKey = key()
      markDefs.push({_type: 'link', _key: defKey, href: m[7]})
      spans.push({_type: 'span', _key: key(), text: m[6], marks: [defKey]})
    }
    rest = rest.slice(m.index + m[0].length)
  }

  return {spans, markDefs}
}

const block = (style, line, listItem) => {
  const {spans, markDefs} = inline(line)
  const b = {
    _type: 'block',
    _key: key(),
    style,
    markDefs,
    children: spans.length ? spans : [{_type: 'span', _key: key(), text: '', marks: []}],
  }
  if (listItem) {
    b.listItem = listItem
    b.level = 1
  }
  return b
}

/**
 * Convert markdown to Portable Text blocks.
 *
 * @param {string} md
 * @param {{dropFirstH1?: boolean}} opts
 *   dropFirstH1 - the page template renders its own <h1> from the document
 *   title, so a body that also opens with one puts two h1s on the page. That
 *   is a real bug we already fixed once on /style-guide, so the default here
 *   is to drop it rather than to trust whoever wrote the markdown.
 */
export function markdownToPortableText(md, {dropFirstH1 = true} = {}) {
  counter = 0
  const blocks = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')

  let paragraph = []
  let seenH1 = false

  const flush = () => {
    if (!paragraph.length) return
    blocks.push(block('normal', paragraph.join(' ')))
    paragraph = []
  }

  for (const [i, raw] of lines.entries()) {
    const line = raw.trimEnd()
    const at = `line ${i + 1}`

    if (/^\s*\|/.test(line)) {
      throw new Error(
        `${at}: markdown tables cannot be represented in this body field ` +
          `(it allows blocks and images only). Rewrite the table as a list.`,
      )
    }
    if (/^\s*(>|\d+\.\s|!\[)/.test(line)) {
      throw new Error(`${at}: unsupported markdown (${line.trim().slice(0, 40)}...)`)
    }

    if (line.trim() === '') {
      flush()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const level = heading[1].length
      if (level === 1) {
        // The document's own title. Rendered by the template, not the body.
        if (!seenH1 && dropFirstH1) {
          seenH1 = true
          continue
        }
      }
      blocks.push(block(`h${level}`, heading[2]))
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      flush()
      blocks.push(block('normal', bullet[1], 'bullet'))
      continue
    }

    // A continuation line of the bullet above, e.g. a wrapped list item.
    const indented = /^\s{2,}\S/.test(raw)
    const prev = blocks[blocks.length - 1]
    if (indented && !paragraph.length && prev?.listItem) {
      const {spans, markDefs} = inline(' ' + line.trim())
      prev.children.push(...spans)
      prev.markDefs.push(...markDefs)
      continue
    }

    paragraph.push(line.trim())
  }
  flush()

  return blocks
}
