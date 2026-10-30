/*
  Which pictures should be uploaded again, bigger? Chris: "what images need
  to be reuploaded for better quality btw?"

  For every picture the site shows, the most it is ever asked to show: the
  width it fills on screen, at the largest place it appears, times the
  screen's pixel density - against the pixels of the file uploaded to Sanity.
  The largest place is measured, not guessed: each case study page, About,
  Collage and the homepage scrolled through, and every piece in the All view
  opened one by one (opened, a piece is at its biggest).

  Density is taken as 2 on both screens: a retina laptop is 2, a phone is 3,
  but past 2 the eye gains little, and asking for 3x would flag nearly
  everything.

  Downloads no picture: the test blanks answer each one at the size asked
  for, and the upload's own size is in its address (<id>-<w>x<h>).

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-low-res.mjs [base]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] || 'https://rumeaudesign.co').replace(/\/$/, '')
const DPR = 2
const SCREENS = [
  ['desktop', {width: 1440, height: 900}],
  ['phone', {width: 390, height: 844}],
]

// Which document and field each uploaded file belongs to.
const Q = `*[_type == "caseStudy" && !(_id in path("drafts.**"))]{
  title, pageType, category,
  "uses": [
    {"f": "Tile Image", "a": thumbnail.asset._ref},
    {"f": "Main Project Image", "a": mainImage.asset._ref},
    {"f": "Full scan", "a": fullScan.asset._ref}
  ] + coalesce(sections[]{"f": "Page block: " + _type, "a": coalesce(image.asset._ref, imageLeft.asset._ref, imageOne.asset._ref)}, [])
    + coalesce(sections[]{"f": "Page block: " + _type, "a": coalesce(imageRight.asset._ref, imageTwo.asset._ref)}, [])
    + coalesce(sections[]{"f": "Page block: " + _type, "a": imageThree.asset._ref}, [])
    + coalesce(sections[].items[]{"f": "Media Row item", "a": image.asset._ref}, [])
}`
const res = await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(Q)}`, {
  headers: process.env.SANITY_API_TOKEN ? {authorization: `Bearer ${process.env.SANITY_API_TOKEN}`} : {},
})
const docs = (await res.json()).result ?? []
const owner = new Map()
for (const d of docs)
  for (const u of d.uses ?? []) {
    if (!u?.a) continue
    const id = u.a.replace(/^image-/, '').replace(/-[a-z0-9]+$/, '').replace(/-\d+x\d+$/, '')
    if (!owner.has(id)) owner.set(id, [])
    owner.get(id).push(`${d.title} (${u.f})`)
  }

// Every Sanity picture in view on the page now: its file, its upload size, the pixels it fills.
const measure = (page) =>
  page.evaluate((dpr) => {
    const out = []
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src
      const m = src.match(/images\/[^/]+\/[^/]+\/([a-f0-9]{20,})-(\d+)x(\d+)\./) || src.match(/\/([a-f0-9]{20,})-(\d+)x(\d+)\./)
      if (!m) continue
      const r = img.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) continue
      const style = getComputedStyle(img)
      if (style.visibility === 'hidden' || img.closest('[hidden]')) continue
      const uw = Number(m[2])
      const uh = Number(m[3])
      // A crop in the address (rect=x,y,w,h) shows only part of the upload.
      const rect = new URL(src, location.href).searchParams.get('rect')?.split(',').map(Number)
      const sw = rect?.length === 4 ? rect[2] : uw
      const sh = rect?.length === 4 ? rect[3] : uh
      const aspect = sw / sh
      // How wide the picture itself is drawn, by how it fits its box.
      const fit = style.objectFit
      const drawn = fit === 'cover' ? Math.max(r.width, r.height * aspect) : fit === 'contain' || fit === 'scale-down' ? Math.min(r.width, r.height * aspect) : r.width
      out.push({id: m[1], uw, uh, sw, need: Math.round(drawn * dpr), alt: img.alt})
    }
    return out
  }, DPR)

const worst = new Map() // id -> {ratio, need, sw, uw, uh, where, alt}
const note = (list, where) => {
  for (const p of list) {
    const ratio = p.sw / p.need
    const was = worst.get(p.id)
    if (!was || ratio < was.ratio) worst.set(p.id, {...p, ratio, where})
  }
}

const browser = await chromium.launch()
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
const pages = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))].filter((p) => p === '/' || /^\/(work|about|collage)/.test(p))

for (const [screen, viewport] of SCREENS) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 1})
  const page = await context.newPage()
  for (const path of pages) {
    try {
      await page.goto(BASE + path, {waitUntil: 'domcontentloaded', timeout: 60_000})
      await page.waitForTimeout(800)
      const h = await page.evaluate(() => document.body.scrollHeight)
      for (let y = 0; y < h; y += viewport.height * 0.8) {
        await page.evaluate((yy) => scrollTo(0, yy), y)
        await page.waitForTimeout(150)
        note(await measure(page), `${path} (${screen})`)
      }
    } catch (e) {
      console.log(`  could not read ${path} on ${screen}: ${String(e).slice(0, 80)}`)
    }
  }
  // Every piece of the All view, opened.
  await page.goto(`${BASE}/portfolio?view=all&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  const n = await page.locator('.wd-piece[data-piece]:not([hidden])').count()
  for (let i = 0; i < n; i++) {
    const tile = page.locator('.wd-piece[data-piece]:not([hidden])').nth(i)
    try {
      await tile.locator('.wd-pic').click({timeout: 5000})
      await page.waitForTimeout(450)
      note(
        (await measure(page)).filter(Boolean),
        `opened in the All view (${screen})`,
      )
      await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
    } catch {}
  }
  console.log(`${screen}: ${pages.length} pages read, ${n} pieces opened`)
  await context.close()
}
await browser.close()

const rows = [...worst.values()].sort((a, b) => a.ratio - b.ratio)
const name = (p) => (owner.get(p.id) ?? [p.alt || '(not found in the case studies)'])[0]
const line = (p) =>
  `  ${name(p)}\n      uploaded ${p.uw}x${p.uh}${p.sw !== p.uw ? ` (cropped to ${p.sw} wide)` : ''}, needs ${p.need} wide at its largest: ${p.where} - has ${Math.round(p.ratio * 100)}% of that`
const soft = rows.filter((p) => p.ratio < 0.5)
const short = rows.filter((p) => p.ratio >= 0.5 && p.ratio < 0.8)
console.log(`\n${rows.length} pictures measured.`)
console.log(`\nRE-UPLOAD - under half the pixels they are shown at (${soft.length}):`)
soft.forEach((p) => console.log(line(p)))
console.log(`\nCOULD BE SHARPER - 50 to 80% (${short.length}):`)
short.forEach((p) => console.log(line(p)))
console.log(`\nThe rest (${rows.length - soft.length - short.length}) have 80% or more of what their largest place asks for.`)
