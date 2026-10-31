/*
  Copier mode, looked at: /next/copier/mode at each generation, a picture
  of each, and what the browser actually applied - the filter on a picture
  and on the heading, whether the SVG filters exist, the paper's opacity.
  Chris: "Copier mode looks like it's not doing anything right now."

  Usage: node scripts/diagnose-copier.mjs [base] [out-dir]
*/
import {chromium} from 'playwright'
import {mkdir, writeFile} from 'node:fs/promises'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const OUT = process.argv[3] ?? '/tmp/shots'
await mkdir(OUT, {recursive: true})
const browser = await chromium.launch()
const report = {}
for (const [name, viewport] of [['desktop', {width: 1440, height: 900}], ['phone', {width: 390, height: 844}]]) {
  const page = await browser.newPage({viewport})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${BASE}/next/copier/mode`, {waitUntil: 'networkidle', timeout: 90_000})
  await page.waitForTimeout(1500)
  report[name] = {errors}
  for (const gen of ['0', '1']) {
    await page.click(`[data-copy="${gen === '1' ? 'on' : 'off'}"]`)
    await page.waitForTimeout(700)
    report[name][`gen${gen}`] = await page.evaluate(() => {
      const img = document.querySelector('.cp-grid img')
      const h1 = document.querySelector('.cp-head h1')
      const paper = document.querySelector('.copier-paper')
      return {
        gen: document.documentElement.classList.contains('is-copied') ? '1' : '0',
        imgFilter: img && getComputedStyle(img).filter,
        h1Filter: h1 && getComputedStyle(h1).filter,
        paperOpacity: paper && getComputedStyle(paper).opacity,
        paperPosition: paper && getComputedStyle(paper).position,
        paperHeight: paper && Math.round(paper.getBoundingClientRect().height),
        pageHeight: document.documentElement.scrollHeight,
        paperOnBody: paper?.parentElement === document.body,
        toner: getComputedStyle(document.querySelector('.copier-toner') ?? document.body).opacity,
        smallFilter: getComputedStyle(document.querySelector('.cp-name') ?? document.body).filter,
        paperBg: paper && getComputedStyle(paper).backgroundImage.slice(0, 120),
        filters: [...document.querySelectorAll('filter')].map((f) => f.id),
        sheetsWithCp: [...document.styleSheets].flatMap((s) => {
          try {
            return [...s.cssRules].map((r) => r.cssText).filter((t) => t.includes('is-copied'))
          } catch {
            return []
          }
        }).slice(0, 6),
      }
    })
    await page.screenshot({path: `${OUT}/copier-${name}-gen${gen}.png`})
    if (gen === '1') {
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(800)
      await page.screenshot({path: `${OUT}/copier-${name}-gen1-foot.png`})
      await page.evaluate(() => scrollTo(0, 0))
    }
  }
  await page.close()
}
// The real site, copied: the homepage and the portfolio, as a visitor who pressed the ©.
for (const [name, viewport] of [['desktop', {width: 1440, height: 900}], ['phone', {width: 390, height: 844}]]) {
  const page = await browser.newPage({viewport, deviceScaleFactor: name === 'phone' ? 3 : 1})
  await page.addInitScript(() => localStorage.setItem('rdc-copied', '1'))
  for (const path of ['/', '/portfolio']) {
    await page.goto(`${BASE}${path}`, {waitUntil: 'networkidle', timeout: 90_000})
    await page.waitForTimeout(1500)
    const tag = path === '/' ? 'home' : 'portfolio'
    report[`${name}-${tag}`] = await page.evaluate(() => ({
      copied: document.documentElement.classList.contains('is-copied'),
      navColour: getComputedStyle(document.querySelector('.site-nav a') ?? document.body).color,
      h1Filter: getComputedStyle(document.querySelector('main h1') ?? document.body).filter,
    }))
    await page.screenshot({path: `${OUT}/site-${name}-${tag}.png`})
  }
  await page.close()
}
console.log(JSON.stringify(report, null, 2))
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2))
await browser.close()
