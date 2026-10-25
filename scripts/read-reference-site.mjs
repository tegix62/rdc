/*
  Reads another designer's site for reference - what a portfolio in the
  field shows and says - from a runner, since the session cannot reach
  outside sites. Loads the start page and up to MAX of its own pages,
  and for each writes a full-page picture (desktop) and prints its
  headings, links and visible text, so the structure can be studied
  without guessing at it.

  READ-ONLY, a handful of pages, once.

  Usage: node scripts/read-reference-site.mjs <url> <out-dir> [max-pages] [path-hint]
*/
import {chromium} from 'playwright'
import {mkdirSync, writeFileSync} from 'node:fs'

const START = process.argv[2]
const OUT = process.argv[3] ?? '/tmp/reference'
const MAX = Number(process.argv[4] ?? 8)
const HINT = process.argv[5] ? new RegExp(process.argv[5], 'i') : null
mkdirSync(OUT, {recursive: true})
const origin = new URL(START).origin
const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1440, height: 900}})
const seen = new Set()
const queue = [START]
const pages = []
while (queue.length && pages.length < MAX) {
  const url = queue.shift()
  const key = url.replace(/[#?].*$/, '').replace(/\/$/, '')
  if (seen.has(key)) continue
  seen.add(key)
  try {
    await page.goto(url, {waitUntil: 'networkidle', timeout: 45_000})
  } catch {
    await page.waitForTimeout(3000)
  }
  // Lazy pictures: scroll through once.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    scrollTo(0, 0)
  })
  await page.waitForTimeout(800)
  const info = await page.evaluate(() => {
    const t = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
    return {
      title: document.title,
      headings: Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => `${h.tagName} ${t(h.textContent)}`).filter((x) => x.length > 3).slice(0, 80),
      nav: Array.from(document.querySelectorAll('nav a, header a')).map((a) => `${t(a.textContent)} -> ${a.getAttribute('href')}`).slice(0, 40),
      links: Array.from(document.querySelectorAll('a[href]')).map((a) => a.href),
      images: Array.from(document.images).length,
      alts: Array.from(document.images).map((i) => t(i.alt)).filter(Boolean).slice(0, 40),
      captions: Array.from(document.querySelectorAll('figcaption, [class*=caption], [class*=credit]')).map((c) => t(c.textContent)).filter(Boolean).slice(0, 40),
      text: t(document.body.innerText).slice(0, 6000),
    }
  })
  const n = pages.length + 1
  const file = `${String(n).padStart(2, '0')}-${(new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home').slice(0, 60)}.png`
  await page.screenshot({path: `${OUT}/${file}`, fullPage: true}).catch(() => {})
  pages.push({url, file, ...info, links: undefined})
  console.log(`\n=== ${n}. ${url} (${info.title}) - ${info.images} pictures -> ${file}`)
  console.log('NAV', JSON.stringify(info.nav))
  console.log('HEADINGS', JSON.stringify(info.headings))
  if (info.captions.length) console.log('CAPTIONS', JSON.stringify(info.captions))
  if (info.alts.length) console.log('ALTS', JSON.stringify(info.alts))
  console.log('TEXT', info.text)
  const own = [...new Set(info.links)].filter((l) => l.startsWith(origin) && !/\.(jpg|png|pdf|zip)$/i.test(l))
  // Pages that look like the work first.
  own.sort((a, z) => Number(HINT ? HINT.test(z) : 0) - Number(HINT ? HINT.test(a) : 0))
  for (const l of own) queue.push(l)
}
writeFileSync(`${OUT}/pages.json`, JSON.stringify(pages, null, 2))
await browser.close()
