/*
  Reads the STRUCTURE of a set of reference portfolios so we can reason about
  layout and hierarchy from evidence rather than memory.

  Deliberately limited to structure and typography: navigation labels, heading
  hierarchy, section counts, how work is linked, how contact is handled, and
  computed type/colour values. It downloads no images, no CSS and no code, and
  it copies nothing - the point is to understand the shape these sites share,
  the same thing you'd get from browsing them with devtools open.

  Runs in CI because this environment's network policy blocks external hosts.

  Usage: node scripts/study-references.mjs
*/
import {chromium} from 'playwright'

const SITES = [
  'https://itsalexward.com',
  'https://colourandshape.com',
  'https://sabrinalau.com',
  'https://fleshandbonedesign.com',
  'https://leannawhite.com',
  'https://lotusyuhacho.com',
  // Given as .con, almost certainly a typo for .com.
  'https://muntasirmohamed.com',
  'https://trabuc.co',
  'https://mvtbcn.net',
]

async function study(browser, url) {
  const context = await browser.newContext({
    viewport: {width: 1440, height: 900},
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    const res = await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 45000})
    await page.waitForTimeout(2500)

    const data = await page.evaluate(() => {
      const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
      const uniq = (a) => [...new Set(a.filter(Boolean))]

      // Navigation labels: anchors inside nav/header, deduped.
      const navLinks = uniq(
        [...document.querySelectorAll('nav a, header a')]
          .map((a) => text(a))
          .filter((t) => t && t.length < 40),
      ).slice(0, 20)

      const headings = [...document.querySelectorAll('h1, h2, h3')]
        .map((h) => ({tag: h.tagName.toLowerCase(), text: text(h).slice(0, 110)}))
        .filter((h) => h.text)
        .slice(0, 28)

      // Rough section inventory: top-level blocks in main/body.
      const root = document.querySelector('main') ?? document.body
      const sections = [...root.children].map((el) => {
        const imgs = el.querySelectorAll('img, picture, video').length
        const words = text(el).split(' ').filter(Boolean).length
        return {tag: el.tagName.toLowerCase(), media: imgs, words}
      })

      // How is work linked? Count links that look like project pages.
      const projectLinks = uniq(
        [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href'))
          .filter((h) => h && /\/(work|project|projects|case|portfolio)[\/-]/i.test(h)),
      ).length

      const mailto = uniq(
        [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')),
      )
      const forms = document.querySelectorAll('form').length
      const inputs = document.querySelectorAll('input, textarea').length

      const bodyText = text(document.body)
      // Metric-shaped copy: a percentage or currency figure next to words.
      const metrics = uniq(
        (bodyText.match(/(?:\+|increased |grew |up )?\d+(?:\.\d+)?%[^.]{0,50}/gi) ?? []).concat(
          bodyText.match(/\$\d[\d,]*(?:k|K)?[^.]{0,40}/g) ?? [],
        ),
      ).slice(0, 6)

      const cs = (sel, prop) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el)[prop] : null
      }

      const h1 = document.querySelector('h1')
      const type = {
        bodyFont: cs('body', 'fontFamily'),
        bodySize: cs('body', 'fontSize'),
        headingFont: h1 ? getComputedStyle(h1).fontFamily : null,
        h1Size: h1 ? getComputedStyle(h1).fontSize : null,
        h1Weight: h1 ? getComputedStyle(h1).fontWeight : null,
        bg: cs('body', 'backgroundColor'),
        fg: cs('body', 'color'),
      }

      // Widest common content container, as a proxy for layout width.
      const widths = [...document.querySelectorAll('main > *, section, .container, [class*="wrap"]')]
        .map((el) => Math.round(el.getBoundingClientRect().width))
        .filter((w) => w > 200 && w <= 1440)
      const contentWidth = widths.length ? Math.max(...widths) : null

      return {
        title: document.title,
        navLinks,
        headings,
        sectionCount: sections.length,
        sections: sections.slice(0, 14),
        projectLinks,
        mailto,
        forms,
        inputs,
        metrics,
        type,
        contentWidth,
        totalWords: bodyText.split(' ').filter(Boolean).length,
      }
    })

    await context.close()
    return {url, status: res?.status() ?? 0, ...data}
  } catch (err) {
    await context.close()
    return {url, error: err.message.split('\n')[0]}
  }
}

const browser = await chromium.launch()

for (const url of SITES) {
  const r = await study(browser, url)
  console.log('\n' + '='.repeat(78))
  console.log(url)
  console.log('='.repeat(78))

  if (r.error) {
    console.log(`  UNREACHABLE: ${r.error}`)
    continue
  }

  console.log(`title:        ${r.title}`)
  console.log(`nav:          ${r.navLinks.join(' | ') || '(none found)'}`)
  console.log(`sections:     ${r.sectionCount} top-level blocks, ${r.totalWords} words total`)
  console.log(`content width: ${r.contentWidth ?? '?'}px at 1440 viewport`)
  console.log(`project links: ${r.projectLinks}`)
  console.log(
    `contact:      ${r.mailto.length ? `mailto ${r.mailto.join(', ')}` : 'no mailto'}; ` +
      `${r.forms} form(s), ${r.inputs} input(s)`,
  )
  console.log(`metrics/stats: ${r.metrics.length ? r.metrics.join(' // ') : 'none found'}`)
  console.log(
    `type:         heading ${r.type.headingFont} ${r.type.h1Size} w${r.type.h1Weight}\n` +
      `              body    ${r.type.bodyFont} ${r.type.bodySize}\n` +
      `              colours bg ${r.type.bg} / fg ${r.type.fg}`,
  )
  console.log('section shape (media count / words):')
  for (const s of r.sections) {
    console.log(`  ${s.tag.padEnd(8)} media:${String(s.media).padStart(3)}  words:${s.words}`)
  }
  console.log('headings:')
  for (const h of r.headings) console.log(`  ${h.tag}  ${h.text}`)
}

await browser.close()
