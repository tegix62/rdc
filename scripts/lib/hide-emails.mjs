/*
  EMAIL ADDRESSES OUT OF THE PAGE SOURCE.

  Chris, October 2026: "My email feels like it's getting leaked a lot ever
  since we ported to Astro. And I think it's because of the terms and
  conditions. Just listing my email."

  The privacy policy and image license name his address in their text, and
  the static build put it into the HTML as plain text and as mailto: links -
  exactly what address-harvesting bots read. This takes it out of the HTML
  without changing a word of those pages (their wording is Chris's to
  approve, and this does not touch it): every address in a page's body
  becomes a span holding it encoded, and every mailto: link points at
  /contact until the page's script restores it. A visitor sees and clicks
  the same address as before; a bot reading the HTML finds none.

    <a href="mailto:a@b.co">a@b.co</a>
      becomes
    <a href="/contact" data-mh="..."><span data-m="...">a at b dot co</span></a>

  The encoding is the address reversed, then base64 - not secrecy, only
  enough that the text in the file is not an address. Without JavaScript
  the link still reaches the contact page and the text reads "a at b dot co".

  Only the body is touched, and never inside <script>, <style>, <textarea>
  or <title>. File names that look like addresses ("logo@2x.png") are left
  alone.

  Used by scripts/hide-emails.mjs at the end of the build; tested by
  scripts/test-hide-emails.mjs.
*/

const NOT_A_TLD = /^(png|jpe?g|webp|gif|svg|avif|ico|js|mjs|css|map|json|woff2?|ttf|mp4|webm|mov)$/i
const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.([A-Za-z]{2,})/g

export const encode = (s) => Buffer.from([...s].reverse().join(''), 'utf8').toString('base64')
export const decode = (s) => [...Buffer.from(s, 'base64').toString('utf8')].reverse().join('')

/* What a visitor without JavaScript reads instead. */
export const spelled = (address) => address.replace('@', ' at ').replace(/\.(?=[^.]+$)/, ' dot ')

/* The page's half: put every address back once the page has loaded. */
export const RESTORE =
  '<script>(function(){function d(s){return atob(s).split("").reverse().join("")}' +
  'document.querySelectorAll("[data-m]").forEach(function(e){e.textContent=d(e.getAttribute("data-m"))});' +
  'document.querySelectorAll("[data-mh]").forEach(function(e){e.setAttribute("href","mailto:"+d(e.getAttribute("data-mh")))})})()</script>'

const isAddress = (match, tld) => !NOT_A_TLD.test(tld)

function hideText(text) {
  let count = 0
  const out = text.replace(ADDRESS, (match, tld) => {
    if (!isAddress(match, tld)) return match
    count++
    return `<span data-m="${encode(match)}">${spelled(match)}</span>`
  })
  return {out, count}
}

function hideTag(tag) {
  let count = 0
  const out = tag.replace(/\shref=(["'])mailto:([^"']*)\1/i, (m, q, rest) => {
    count++
    return ` href=${q}/contact${q} data-mh=${q}${encode(decodeURIComponent(rest))}${q}`
  })
  return {out, count}
}

/** Every address in the page's body hidden; how many were. */
export function hideEmails(html) {
  const open = html.search(/<body[\s>]/i)
  if (open < 0) return {html, count: 0}
  const head = html.slice(0, open)
  const body = html.slice(open)
  let count = 0
  let skip = null
  const parts = body.split(/(<[^>]*>)/)
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k]
    if (!part) continue
    if (part.startsWith('<')) {
      const name = part.match(/^<\/?\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase()
      if (skip) {
        if (part.toLowerCase().startsWith(`</${skip}`)) skip = null
        continue
      }
      if (name && ['script', 'style', 'textarea', 'title'].includes(name) && !part.startsWith('</') && !part.endsWith('/>')) {
        skip = name
        continue
      }
      const t = hideTag(part)
      parts[k] = t.out
      count += t.count
    } else if (!skip) {
      const t = hideText(part)
      parts[k] = t.out
      count += t.count
    }
  }
  let out = head + parts.join('')
  if (count) out = out.includes('</body>') ? out.replace(/<\/body>(?![\s\S]*<\/body>)/, `${RESTORE}</body>`) : out + RESTORE
  return {html: out, count}
}

/** Addresses still anywhere in a file - for the build's report. */
export function addressesIn(text) {
  return [...text.matchAll(ADDRESS)].filter((m) => isAddress(m[0], m[1])).map((m) => m[0])
}
