/*
  Open one named piece in the Merch & Apparel view and report the size every
  piece of its project is drawn at, and why.

  Chris: the closeups "now parented to the shirt" should be "larger than the
  rest of the tertiary stuff". The view is built to do that (own shots at a
  full tile, the rest at half), so this measures the real page with his real
  data rather than reasoning about whether it should.

  READ-ONLY.

  Usage: node scripts/measure-merch-gather.mjs [base-url] [title-substring]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const NAME = process.argv[3] ?? 'More Kilos Tee'

const browser = await chromium.launch()
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible'})
  await page.waitForTimeout(2500)
  await page.click('.pf-btn[data-filter=".merch-apparel"]')
  await page.waitForTimeout(900)
  const i = await page.evaluate((name) => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    return all.findIndex(
      (el) => el.querySelector('.pf-item__img')?.getAttribute('alt')?.includes(name) && getComputedStyle(el).display !== 'none',
    )
  }, NAME)
  if (i < 0) {
    console.log(`${w}px: no visible tile titled "${NAME}" in the merch view`)
    await page.close()
    continue
  }
  const tile = page.locator('#pf-grid .pf-item').nth(i)
  await tile.scrollIntoViewIfNeeded()
  await tile.locator('.pf-item__img').click()
  await page.waitForTimeout(1800)
  const rows = await page.evaluate(() => {
    const grid = document.querySelector('#pf-grid')
    const tileW = grid.querySelector('.pf-item:not(.is-expanded):not(.is-minor)')
    const opened = grid.querySelector('.pf-item.is-expanded')
    const href = (el) => el.querySelector('.pf-item__jump')?.getAttribute('href')
    const unit = grid.clientWidth / (window.innerWidth < 768 ? 2 : 5)
    return Array.from(grid.querySelectorAll('.pf-item'))
      .filter((el) => href(el) === href(opened) && getComputedStyle(el).display !== 'none')
      .map((el) => ({
        title: el.querySelector('.pf-item__img')?.getAttribute('alt'),
        tiles: +(el.getBoundingClientRect().width / unit).toFixed(2),
        role: el === opened ? 'OPENED' : el.classList.contains('is-minor') ? 'rest (minor)' : 'own shot (full)',
        piece: el.dataset.piece,
        pieceParent: el.dataset.pieceParent ?? null,
        openedPiece: opened.dataset.piece,
      }))
  })
  console.log(`\n${w}px - opened "${NAME}":`)
  for (const r of rows) {
    console.log(`  ${String(r.tiles).padEnd(5)} tiles  ${r.role.padEnd(16)} ${r.title}${r.pieceParent ? `   (hangs off ${r.pieceParent}${r.pieceParent === r.openedPiece ? ' = the opened piece' : ''})` : ''}`)
  }
  console.log(`  opened piece id: ${rows[0]?.openedPiece}`)
  await page.close()
}
await browser.close()
