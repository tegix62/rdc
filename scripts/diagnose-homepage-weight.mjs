/*
  Did the work-first homepage cost anything? Chris: "Did I mess up the
  performance of the site SEO-wise or speed-wise by doing this to the front
  page?" Measured side by side with the original homepage, which is the same
  page it replaced, now at /hello.

  Run with the test-images-off blanks (no picture downloaded): picture
  requests are counted and their asked-for widths read from their addresses,
  which is what decides their weight, without spending bandwidth on them.

  SPEED, per page and screen: the HTML, scripts and styles as sent
  (compressed), how many pictures it asks for before any scroll and in all,
  the pixels those come to, other sites it calls, the page's size in
  elements, and Chrome's own timings - first content, largest content,
  layout shift, and time the main thread was blocked.
  SEARCH: what a crawler reads - title, description, canonical, robots,
  headings, words in the HTML as sent (before any script), links into the
  site, pictures with and without alt text, structured data types.

  Usage: node scripts/diagnose-homepage-weight.mjs [base]
*/
import {chromium} from 'playwright'
import {gzipSync} from 'node:zlib'

const BASE = (process.argv[2] || 'https://rumeaudesign.co').replace(/\/$/, '')
const PAGES = [['/', 'new homepage'], ['/hello', 'old homepage'], ['/portfolio', 'portfolio']]
const SCREENS = [['desktop', {width: 1366, height: 900}], ['phone', {width: 390, height: 844, isMobile: true, deviceScaleFactor: 3}]]
const kb = (n) => `${(n / 1024).toFixed(0)} KB`

const browser = await chromium.launch()

// What a crawler gets before any script runs.
const crawl = async (path) => {
  const html = await (await fetch(BASE + path)).text()
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  const attr = (re) => html.match(re)?.[1] ?? '-'
  const heads = [...html.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => `${m[1]}: ${m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 70)}`)
  const links = new Set([...html.matchAll(/<a[^>]+href="(\/[^"#?]*)/gi)].map((m) => m[1].replace(/\/$/, '') || '/'))
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const ld = [...html.matchAll(/"@type":\s*"([^"]+)"/g)].map((m) => m[1])
  return {
    htmlRaw: html.length,
    htmlGzip: gzipSync(html).length,
    title: attr(/<title>([^<]*)<\/title>/i),
    description: attr(/<meta name="description" content="([^"]*)"/i).slice(0, 110),
    canonical: attr(/rel="canonical" href="([^"]*)"/i),
    robots: attr(/<meta name="robots" content="([^"]*)"/i),
    words: text.split(' ').filter((w) => /[a-z]/i.test(w)).length,
    heads,
    links: links.size,
    imgs: imgs.length,
    noAlt: imgs.filter((t) => !/\balt="[^"]+"/i.test(t)).length,
    ld: [...new Set(ld)].join(', '),
  }
}

const measure = async (path, viewport) => {
  const context = await browser.newContext({viewport: {width: viewport.width, height: viewport.height}, isMobile: !!viewport.isMobile, deviceScaleFactor: viewport.deviceScaleFactor ?? 1})
  const page = await context.newPage()
  const pics = []
  const hosts = new Map()
  const bytes = {script: 0, stylesheet: 0}
  let phase = 'first'
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.host !== new URL(BASE).host) hosts.set(u.host, (hosts.get(u.host) ?? 0) + 1)
    if (r.resourceType() === 'image') {
      const w = Number(u.searchParams.get('w')) || 0
      const h = Number(u.searchParams.get('h')) || 0
      pics.push({phase, w, h, host: u.host, key: u.pathname.replace(/^\/img\//, ''), t: Math.round(performance.now())})
    }
  })
  page.on('response', async (r) => {
    const t = r.request().resourceType()
    if (t !== 'script' && t !== 'stylesheet') return
    const len = Number(r.headers()['content-length'])
    if (len) bytes[t] += len
    else {
      try {
        bytes[t] += gzipSync(await r.body()).length
      } catch {}
    }
  })
  await page.addInitScript(() => {
    window.__perf = {lcp: 0, lcpEl: '', cls: 0, block: 0}
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__perf.lcp = e.startTime
        const el = e.element
        window.__perf.lcpEl = el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`.slice(0, 60) : ''
      }
    }).observe({type: 'largest-contentful-paint', buffered: true})
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue
        window.__perf.cls += e.value
        if (e.value > 0.01) for (const src of e.sources ?? []) window.__perf.shifted = [...(window.__perf.shifted ?? []), `${src.node?.className?.toString?.().split(' ')[0] || src.node?.nodeName || '?'} ${e.value.toFixed(3)}`].slice(0, 6)
      }
    }).observe({type: 'layout-shift', buffered: true})
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.block += Math.max(0, e.duration - 50)
    }).observe({type: 'longtask', buffered: true})
  })
  await page.goto(BASE + path, {waitUntil: 'load', timeout: 60_000})
  await page.waitForTimeout(2500)
  const first = pics.length
  // Then the whole page, scrolled through, as someone reading it would.
  phase = 'scrolled'
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.8) {
      scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 250))
    }
  })
  await page.waitForTimeout(1500)
  const out = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return {
      ...window.__perf,
      fcp: fcp?.startTime ?? 0,
      dcl: nav?.domContentLoadedEventEnd ?? 0,
      nodes: document.getElementsByTagName('*').length,
      height: document.body.scrollHeight,
    }
  })
  const px = (list) => list.reduce((s, p) => s + (p.w && p.h ? p.w * p.h : p.w * p.w), 0)
  await context.close()
  return {
    ...out,
    js: bytes.script,
    css: bytes.stylesheet,
    picsFirst: first,
    picsAll: pics.length,
    mpFirst: px(pics.slice(0, first)) / 1e6,
    mpAll: px(pics) / 1e6,
    hosts: [...hosts].map(([h, n]) => `${h} ${n}`).join(', ') || 'none',
    // The same picture asked for more than once, and at which widths.
    twice: (() => {
      const by = new Map()
      for (const p of pics) by.set(p.key, [...(by.get(p.key) ?? []), p.w])
      const d = [...by.values()].filter((ws) => ws.length > 1)
      return d.length ? `${d.length} asked for more than once, e.g. widths ${d.slice(0, 4).map((ws) => ws.join('>')).join(', ')}` : ''
    })(),
  }
}

for (const [path, name] of PAGES) {
  const c = await crawl(path)
  console.log(`\n=== ${name} (${path}) ===`)
  console.log(`HTML ${kb(c.htmlRaw)} (${kb(c.htmlGzip)} compressed)`)
  console.log(`SEARCH  title: ${c.title}`)
  console.log(`        description: ${c.description}`)
  console.log(`        canonical ${c.canonical}  robots ${c.robots}`)
  console.log(`        ${c.words} words in the HTML as sent; ${c.links} links into the site; ${c.imgs} pictures, ${c.noAlt} without alt text`)
  console.log(`        structured data: ${c.ld}`)
  console.log(`        headings: ${c.heads.join(' | ') || 'none'}`)
  for (const [screen, vp] of SCREENS) {
    const m = await measure(path, vp)
    console.log(
      `SPEED ${screen.padEnd(7)} first content ${m.fcp.toFixed(0)}ms, largest ${m.lcp.toFixed(0)}ms (${m.lcpEl}), shift ${m.cls.toFixed(3)}, blocked ${m.block.toFixed(0)}ms, ` +
        `JS ${kb(m.js)}, CSS ${kb(m.css)}, ${m.nodes} elements, ${m.height}px tall${m.shifted ? `; shifted: ${m.shifted.join(', ')}` : ''}`,
    )
    console.log(
      `        pictures: ${m.picsFirst} before scrolling (${m.mpFirst.toFixed(1)} MP asked for), ${m.picsAll} after scrolling it all (${m.mpAll.toFixed(1)} MP); other sites: ${m.hosts}${m.twice ? `; ${m.twice}` : ''}`,
    )
  }
}
await browser.close()
