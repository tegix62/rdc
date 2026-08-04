/*
  Measures every page at desktop and mobile widths and writes a report.

  This exists because the two questions Chris asked - "can it be snappier?"
  and "can the typography be tighter?" - are the kind that are easy to answer
  confidently and wrongly. Earlier in this port an entire diagnosis was built
  on a Playwright byte count that was off by 135x. So everything here is a
  number taken from a real page load, and where a number needs a threshold the
  threshold is stated in the output rather than hidden in a pass/fail.

  What it collects per page per viewport:

    speed      transfer bytes by resource type (from Content-Length, not
               Playwright's responseBodySize, which lied before), request
               count, DOMContentLoaded, load, LCP and CLS.

    layout     whether the page scrolls sideways, and if so the widest
               offending elements - the check that was missing when the mobile
               overflow bug shipped.

    type       computed font-size, line-height and measured line length for
               every run of body copy, plus the heading scale in use. Line
               length is in characters at the rendered width, which is the
               measure that actually decides whether a paragraph reads well.

    touch      controls smaller than 44x44 CSS px, mobile only.

  Usage: node scripts/audit-pages.mjs [--base URL] [--out DIR]
*/
import {chromium} from 'playwright'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}
const BASE = arg('--base', 'https://preview.rumeau-design-co.pages.dev')
const OUT = arg('--out', 'audit')

const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900, isMobile: false},
  {name: 'mobile', width: 390, height: 844, isMobile: true},
]

// Body copy wants roughly 45-75 characters a line; much past that and the eye
// loses its place returning to the left margin, much under and the rhythm
// breaks up. These are the numbers the report measures against.
const IDEAL_MEASURE = [45, 75]
const BODY_LINE_HEIGHT = [1.4, 1.7]

const staticPaths = [
  '/',
  '/portfolio',
  '/about',
  '/video',
  '/collage',
  '/merchfolio',
  '/blog',
  '/privacy-policy',
]

const browser = await chromium.launch()
await mkdir(OUT, {recursive: true})
await mkdir(path.join(OUT, 'shots'), {recursive: true})

// Pick up one real case study and one real blog post so the templates that
// carry the most content aren't audited only in the abstract.
const discover = async () => {
  const page = await browser.newPage()
  const found = []
  for (const [listPath, prefix] of [
    ['/portfolio', '/work/'],
    ['/blog', '/blog/'],
  ]) {
    try {
      await page.goto(BASE + listPath, {waitUntil: 'domcontentloaded', timeout: 45000})
      const href = await page
        .locator(`a[href^="${prefix}"]`)
        .first()
        .getAttribute('href')
        .catch(() => null)
      if (href) found.push(href)
    } catch {
      /* the list page failing is itself reported below */
    }
  }
  await page.close()
  return found
}

const paths = [...staticPaths, ...(await discover())]
console.log(`auditing ${paths.length} pages x ${VIEWPORTS.length} viewports against ${BASE}\n`)

const results = []

for (const p of paths) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: {width: vp.width, height: vp.height},
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      deviceScaleFactor: vp.isMobile ? 3 : 1,
    })
    const page = await context.newPage()

    // getEntriesByType('largest-contentful-paint') came back empty on all 20
    // page loads in the first run - the buffer isn't retained for it the way
    // it is for navigation timing. An observer registered before any document
    // script runs does see them.
    await page.addInitScript(() => {
      window.__lcp = 0
      window.__cls = 0
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__lcp = Math.round(e.startTime)
        }).observe({type: 'largest-contentful-paint', buffered: true})
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
        }).observe({type: 'layout-shift', buffered: true})
      } catch {
        /* older engines - the report shows a dash rather than a wrong number */
      }
    })

    // Content-Length, because responseBodySize from the CDP metrics API
    // reported a 71 KB image as 10.7 MB earlier in this port and an entire
    // afternoon of "optimisation" was aimed at a file that was already fine.
    const bytes = {}
    const images = []
    let requests = 0
    page.on('response', async (res) => {
      requests += 1
      const type = res.request().resourceType()
      const len = Number(res.headers()['content-length'] ?? 0)
      bytes[type] = (bytes[type] ?? 0) + (Number.isFinite(len) ? len : 0)
      if (type === 'image') {
        const u = res.url()
        images.push({
          url: u,
          bytes: Number.isFinite(len) ? len : 0,
          // An image served straight from cdn.sanity.io with no query string
          // is a pass-through original: Chris's own compression, deliberately
          // never resized. Useful to separate, because "the images are heavy"
          // has a completely different fix depending on which kind it is.
          passThrough: u.includes('cdn.sanity.io') && !u.includes('?'),
          width: Number(new URL(u).searchParams.get('w')) || null,
        })
      }
    })

    const consoleErrors = []
    page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 200)))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
    })

    const url = BASE + p
    let status = 0
    const t0 = Date.now()
    try {
      const res = await page.goto(url, {waitUntil: 'load', timeout: 60000})
      status = res?.status() ?? 0
    } catch (err) {
      results.push({path: p, viewport: vp.name, error: String(err).slice(0, 200)})
      await context.close()
      continue
    }
    const wallMs = Date.now() - t0

    // Let lazy work, web fonts and any layout shift settle before measuring.
    await page.waitForTimeout(2500)

    const metrics = await page.evaluate(
      ({IDEAL_MEASURE, BODY_LINE_HEIGHT}) => {
        const nav = performance.getEntriesByType('navigation')[0]

        const lcp = window.__lcp || null
        const cls = window.__cls ?? 0

        // --- sideways scroll ------------------------------------------------
        const docWidth = document.documentElement.clientWidth
        const overflows = []
        if (document.documentElement.scrollWidth > docWidth + 1) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0) continue
            const right = r.right + window.scrollX
            if (right > docWidth + 1) {
              overflows.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className || '').toString().slice(0, 60),
                overhang: Math.round(right - docWidth),
              })
            }
          }
        }
        overflows.sort((a, b) => b.overhang - a.overhang)

        // --- typography -----------------------------------------------------
        // Character measure is computed from the element's own font, by
        // measuring the width of a representative glyph run rather than
        // assuming an average character width.
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const measureOf = (el, style) => {
          ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
          const sample = 'abcdefghijklmnopqrstuvwxyz '
          const per = ctx.measureText(sample).width / sample.length
          if (!per) return null
          return Math.round(el.getBoundingClientRect().width / per)
        }

        const body = []
        const headings = new Map()
        for (const el of document.querySelectorAll('p, li, h1, h2, h3, h4')) {
          const text = (el.textContent ?? '').trim()
          if (text.length < 40 && !/^h[1-4]$/i.test(el.tagName)) continue
          const style = getComputedStyle(el)
          const fontPx = parseFloat(style.fontSize)
          const linePx = parseFloat(style.lineHeight)
          const ratio = Number.isFinite(linePx) ? +(linePx / fontPx).toFixed(2) : null
          const entry = {
            tag: el.tagName.toLowerCase(),
            fontPx: +fontPx.toFixed(1),
            lineHeight: ratio,
            letterSpacing: style.letterSpacing === 'normal' ? 0 : +parseFloat(style.letterSpacing).toFixed(2),
            weight: style.fontWeight,
            family: style.fontFamily.split(',')[0].replace(/["']/g, ''),
          }
          if (/^h[1-4]$/i.test(el.tagName)) {
            const key = `${entry.tag}|${entry.fontPx}|${entry.lineHeight}|${entry.letterSpacing}`
            headings.set(key, (headings.get(key) ?? 0) + 1)
          } else if (text.length >= 80) {
            // Only long runs are judged on measure; a two-word list item
            // being "too short" is meaningless.
            entry.measureCh = measureOf(el, style)
            entry.sample = text.slice(0, 50)
            body.push(entry)
          }
        }

        const typeIssues = []
        for (const b of body) {
          if (b.measureCh && (b.measureCh < IDEAL_MEASURE[0] || b.measureCh > IDEAL_MEASURE[1])) {
            typeIssues.push(`${b.tag} ${b.measureCh}ch (want ${IDEAL_MEASURE[0]}-${IDEAL_MEASURE[1]}) — "${b.sample}…"`)
          }
          if (b.lineHeight && (b.lineHeight < BODY_LINE_HEIGHT[0] || b.lineHeight > BODY_LINE_HEIGHT[1])) {
            typeIssues.push(`${b.tag} line-height ${b.lineHeight} at ${b.fontPx}px (want ${BODY_LINE_HEIGHT[0]}-${BODY_LINE_HEIGHT[1]}) — "${b.sample}…"`)
          }
          if (b.fontPx < 14) {
            typeIssues.push(`${b.tag} ${b.fontPx}px body copy — "${b.sample}…"`)
          }
        }

        // --- touch targets ---------------------------------------------------
        const small = []
        for (const el of document.querySelectorAll('a, button, [role="button"], input, select')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          if (r.width < 44 || r.height < 44) {
            small.push({
              tag: el.tagName.toLowerCase(),
              size: `${Math.round(r.width)}x${Math.round(r.height)}`,
              label: (el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('aria-label') || '',
            })
          }
        }

        // --- images without intrinsic size (the layout-shift source) ---------
        const unsized = [...document.querySelectorAll('img')].filter(
          (i) => !i.getAttribute('width') || !i.getAttribute('height'),
        ).length

        return {
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          load: nav ? Math.round(nav.loadEventEnd) : null,
          lcp,
          cls: +cls.toFixed(4),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: docWidth,
          overflows: overflows.slice(0, 6),
          headings: [...headings.entries()].map(([k, n]) => ({spec: k, count: n})),
          bodySamples: body.slice(0, 8),
          typeIssues,
          smallTargets: small.slice(0, 10),
          smallTargetCount: small.length,
          imgCount: document.querySelectorAll('img').length,
          unsizedImages: unsized,
        }
      },
      {IDEAL_MEASURE, BODY_LINE_HEIGHT},
    )

    const shot = path.join(OUT, 'shots', `${p.replace(/\//g, '_') || '_root'}.${vp.name}.png`)
    await page.screenshot({path: shot, fullPage: true}).catch(() => {})

    const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0)
    results.push({
      path: p,
      viewport: vp.name,
      status,
      wallMs,
      requests,
      totalBytes,
      bytes,
      images: images.sort((a, b) => b.bytes - a.bytes).slice(0, 20),
      imageRequests: images.length,
      passThroughBytes: images.filter((i) => i.passThrough).reduce((a, i) => a + i.bytes, 0),
      consoleErrors: [...new Set(consoleErrors)].slice(0, 5),
      ...metrics,
    })

    const kb = Math.round(totalBytes / 1024)
    const flag = metrics.overflows.length ? ' SIDEWAYS-SCROLL' : ''
    console.log(
      `  ${vp.name.padEnd(7)} ${p.padEnd(28)} ${String(status).padEnd(4)} ${String(kb).padStart(5)} KB  ` +
        `LCP ${String(metrics.lcp ?? '-').padStart(5)}ms  CLS ${String(metrics.cls).padStart(6)}  ` +
        `${metrics.typeIssues.length} type  ${metrics.smallTargetCount} small${flag}`,
    )

    await context.close()
  }
}

await browser.close()

// ---------------------------------------------------------------------------
const kb = (n) => `${Math.round(n / 1024)} KB`
const lines = []
lines.push(`# Page audit`, ``, `\`${BASE}\` — ${new Date().toISOString()}`, ``)

lines.push(`## Speed`, ``)
lines.push(`| Page | View | Bytes | Reqs | LCP | CLS | Load |`)
lines.push(`|---|---|--:|--:|--:|--:|--:|`)
for (const r of results) {
  if (r.error) continue
  lines.push(
    `| \`${r.path}\` | ${r.viewport} | ${kb(r.totalBytes)} | ${r.requests} | ${r.lcp ?? '-'}ms | ${r.cls} | ${r.load ?? '-'}ms |`,
  )
}
lines.push(``)

const worst = [...results].filter((r) => !r.error).sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 5)
lines.push(`Heaviest: ${worst.map((r) => `\`${r.path}\` (${r.viewport}, ${kb(r.totalBytes)})`).join(', ')}`, ``)

lines.push(`## Heaviest images`, ``)
lines.push(
  `A pass-through image is one served straight from cdn.sanity.io with no`,
  `query string: Chris's own compression, deliberately never resized. Those`,
  `cannot be made smaller without replacing the file. Everything else goes`,
  `through the transform pipeline and can be fixed in code.`,
  ``,
)
for (const r of [...results].filter((x) => !x.error && x.totalBytes > 1_000_000).sort((a, b) => b.totalBytes - a.totalBytes)) {
  lines.push(
    `**\`${r.path}\` (${r.viewport})** — ${r.imageRequests} image requests for ` +
      `${r.imgCount} <img> tags, ${kb(r.passThroughBytes)} of it pass-through`,
  )
  for (const i of r.images.slice(0, 8)) {
    const name = i.url.split('/').pop().split('?')[0].slice(0, 44)
    lines.push(`  - ${kb(i.bytes).padStart(7)} ${i.passThrough ? 'pass-through' : `w=${i.width ?? '?'}`} \`${name}\``)
  }
  lines.push(``)
}

const overflowing = results.filter((r) => r.overflows?.length)
lines.push(`## Sideways scroll`, ``)
if (!overflowing.length) lines.push(`None. Every page fits its viewport at both widths.`, ``)
for (const r of overflowing) {
  lines.push(`**\`${r.path}\` (${r.viewport})** — ${r.scrollWidth}px in a ${r.clientWidth}px viewport`)
  for (const o of r.overflows) lines.push(`  - \`${o.tag}.${o.cls}\` overhangs by ${o.overhang}px`)
  lines.push(``)
}

lines.push(`## Typography`, ``)
const withType = results.filter((r) => r.typeIssues?.length)
if (!withType.length) lines.push(`No measure or line-height outside the target ranges.`, ``)
for (const r of withType) {
  lines.push(`**\`${r.path}\` (${r.viewport})**`)
  for (const i of [...new Set(r.typeIssues)]) lines.push(`  - ${i}`)
  lines.push(``)
}

lines.push(`### Heading scale in use`, ``)
const scale = new Map()
for (const r of results) {
  for (const h of r.headings ?? []) {
    const key = `${r.viewport} ${h.spec}`
    scale.set(key, (scale.get(key) ?? 0) + h.count)
  }
}
lines.push('```')
for (const [k, n] of [...scale.entries()].sort()) lines.push(`${k}  x${n}`)
lines.push('```', ``)

lines.push(`## Touch targets under 44px (mobile)`, ``)
const touch = results.filter((r) => r.viewport === 'mobile' && r.smallTargetCount > 0)
if (!touch.length) lines.push(`None.`, ``)
for (const r of touch) {
  lines.push(`**\`${r.path}\`** — ${r.smallTargetCount}`)
  for (const t of r.smallTargets) lines.push(`  - \`${t.tag}\` ${t.size} "${t.label}"`)
  lines.push(``)
}

const unsized = results.filter((r) => r.unsizedImages > 0)
lines.push(`## Images with no width/height`, ``)
lines.push(unsized.length ? '' : `None — every image reserves its space.`)
for (const r of unsized) lines.push(`  - \`${r.path}\` (${r.viewport}): ${r.unsizedImages} of ${r.imgCount}`)
lines.push(``)

const errored = results.filter((r) => r.error || r.consoleErrors?.length)
lines.push(`## Errors`, ``)
if (!errored.length) lines.push(`None.`, ``)
for (const r of errored) {
  lines.push(`**\`${r.path}\` (${r.viewport})**`)
  if (r.error) lines.push(`  - navigation: ${r.error}`)
  for (const e of r.consoleErrors ?? []) lines.push(`  - console: ${e}`)
  lines.push(``)
}

await writeFile(path.join(OUT, 'pages.md'), lines.join('\n'))
await writeFile(path.join(OUT, 'pages.json'), JSON.stringify(results, null, 2))
console.log(`\nwrote ${OUT}/pages.md and ${OUT}/pages.json`)
