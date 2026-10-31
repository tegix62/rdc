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
  for (const gen of ['0', '1', '2']) {
    await page.click(`[data-set="${gen}"]`)
    await page.waitForTimeout(700)
    report[name][`gen${gen}`] = await page.evaluate(() => {
      const root = document.querySelector('[data-copier]')
      const img = document.querySelector('.cp-grid img')
      const h1 = document.querySelector('.cp-head h1')
      const paper = document.querySelector('.cp-paper')
      return {
        gen: root?.getAttribute('data-gen'),
        imgFilter: img && getComputedStyle(img).filter,
        h1Filter: h1 && getComputedStyle(h1).filter,
        paperOpacity: paper && getComputedStyle(paper).opacity,
        paperBg: paper && getComputedStyle(paper).backgroundImage.slice(0, 120),
        filters: [...document.querySelectorAll('filter')].map((f) => f.id),
        sheetsWithCp: [...document.styleSheets].flatMap((s) => {
          try {
            return [...s.cssRules].map((r) => r.cssText).filter((t) => t.includes('data-gen'))
          } catch {
            return []
          }
        }).slice(0, 6),
      }
    })
    await page.screenshot({path: `${OUT}/copier-${name}-gen${gen}.png`})
  }
  await page.close()
}
console.log(JSON.stringify(report, null, 2))
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2))
await browser.close()
