/*
  Screenshots of live pages, for looking at the site as a visitor would.

  Chris, stepping back from the grid: "is my website where it needs to be?
  Is it priming me for success?" - starting with the homepage. The session
  that works on this site cannot reach it (network policy), so the pictures
  are taken on a runner, like the tests, and a short report of each page's
  facts (title, description, headings, calls to action, section heights) is
  printed alongside them.

  Each page is shot at a desktop and a phone size, above the fold and in
  full. Files land in the output directory as <page>-<device>-<fold|full>.png
  plus report.json.

  Usage: node scripts/screenshot-pages.mjs <base-url> <out-dir> [/path,/path2,...]
*/
import {chromium} from 'playwright'
import {mkdirSync, writeFileSync} from 'node:fs'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const OUT = process.argv[3] ?? 'shots'
const PATHS = (process.argv[4] ?? '/').split(',').map((p) => p.trim()).filter(Boolean)
const DEVICES = [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]

mkdirSync(OUT, {recursive: true})
const browser = await chromium.launch()
const report = {}

for (const path of PATHS) {
  // A full URL is shot as given (the Tally form every "Let's Work" button
  // points at is not on this site) and named after its host.
  const slug = /^https?:/.test(path)
    ? new URL(path).hostname.split('.')[0]
    : path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '_')
  report[path] = {}
  for (const [device, w, h] of DEVICES) {
    const page = await browser.newPage({viewport: {width: w, height: h}})
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('pf-demo-shown', '1')
      } catch {}
    })
    // Load, then a few seconds of quiet if the page will give it. /contact
    // never goes network-idle (something on it keeps a connection open), so
    // waiting for idle outright timed the whole run out.
    const url = /^https?:/.test(path) ? path : `${BASE}${path}`
    await page.goto(url, {waitUntil: 'load', timeout: 60_000})
    await page.waitForLoadState('networkidle', {timeout: 8_000}).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({path: `${OUT}/${slug}-${device}-fold.png`})
    await page.screenshot({path: `${OUT}/${slug}-${device}-full.png`, fullPage: true})

    report[path][device] = await page.evaluate(() => {
      const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
      const box = (el) => {
        const b = el.getBoundingClientRect()
        return {top: Math.round(b.top + scrollY), height: Math.round(b.height)}
      }
      const main = document.querySelector('main') ?? document.body
      // Top-level sections of the page, in order, with where they sit: the
      // first number is how many screens down a section starts.
      const sections = Array.from(main.children)
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          class: el.className?.toString().split(' ')[0] || '',
          ...box(el),
          screens: +(box(el).top / innerHeight).toFixed(2),
          text: text(el).slice(0, 120),
        }))
      const ctas = Array.from(main.querySelectorAll('a.button, button, a[class*="cta"], a[class*="more"]')).map((a) => ({
        text: text(a),
        href: a.getAttribute('href'),
        screens: +(box(a).top / innerHeight).toFixed(2),
      }))
      const imgs = Array.from(main.querySelectorAll('img'))
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
        h1: text(document.querySelector('h1')),
        headings: Array.from(main.querySelectorAll('h2, h3')).map((el) => `${el.tagName.toLowerCase()}: ${text(el).slice(0, 140)}`),
        ctas,
        nav: Array.from(document.querySelectorAll('header a')).map((a) => `${text(a)} → ${a.getAttribute('href')}`),
        images: imgs.length,
        imagesNoAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
        words: text(main).split(' ').length,
        pageHeight: document.documentElement.scrollHeight,
        screens: +(document.documentElement.scrollHeight / innerHeight).toFixed(1),
        sections,
      }
    })
    await page.close()
  }
}

await browser.close()
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
