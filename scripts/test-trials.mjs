/*
  The three preview trials, in a real browser, with pictures.

    museum labels  an opened piece in the All view's gather carries a label
                   under it - its title, and what it is when Studio knows -
                   and the set still fits the window
    the wall       the opened piece's frame lifts on a shadow
    actual size    on /collage, "See it at actual size" opens the collage at
                   its real size beside a ruler, the sharp picture arrives,
                   and "Match my screen" shows a bank card at the same scale

  Pictures of each go to the folder given, for the shots branch.

  Usage: node scripts/test-trials.mjs [base-url] [out-dir]
*/
import {chromium, devices} from 'playwright'
import {mkdirSync} from 'node:fs'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const OUT = process.argv[3] ?? '/tmp/trial-shots'
mkdirSync(OUT, {recursive: true})

const browser = await chromium.launch()
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const openPortfolio = async (opts) => {
  const page = await browser.newPage(opts)
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  await page.waitForTimeout(2000)
  return page
}

// ------------------------------------------------------------ labels, wall
for (const [label, opts] of [
  ['1440', {viewport: {width: 1440, height: 900}}],
  ['1920', {viewport: {width: 1920, height: 890}}],
  ['phone', {...devices['iPhone 13']}],
]) {
  for (const project of ['/work/dumpstat', '/work/hug-a-mug']) {
    const page = await openPortfolio(opts)
    const i = await page.evaluate((h) => {
      const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
      return all.findIndex(
        (el) =>
          el.querySelector('.pf-item__jump')?.getAttribute('href') === h &&
          !el.querySelector('.pf-card') &&
          getComputedStyle(el).display !== 'none',
      )
    }, project)
    if (i < 0) {
      check(`${label} ${project}: a piece to open`, false)
      await page.close()
      continue
    }
    const tile = page.locator('#pf-grid .pf-item').nth(i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('.pf-item__img').click()
    await page.waitForTimeout(3500)
    const r = await page.evaluate(() => {
      const opened = document.querySelector('#pf-grid .pf-item.is-expanded')
      const lab = opened?.querySelector('.pf-item__label')
      const lb = lab?.getBoundingClientRect()
      const ob = opened?.getBoundingClientRect()
      const frame = opened?.querySelector('.pf-item__frame')
      const set = Array.from(document.querySelectorAll('#pf-grid .pf-item.is-sibling, #pf-grid .pf-item.is-expanded')).filter(
        (el) => getComputedStyle(el).display !== 'none',
      )
      return {
        shown: !!lb && lb.height > 0 && getComputedStyle(lab).display !== 'none',
        text: lab?.textContent?.replace(/[​-‏⁠-⁯﻿]|[\udb40][\udc00-\udc7f]/g, '').trim() ?? '',
        inside: !!lb && !!ob && lb.top >= ob.top && lb.bottom <= ob.bottom + 1,
        shadow: frame ? getComputedStyle(frame).boxShadow : '',
        outside: set.filter((el) => el.getBoundingClientRect().bottom > innerHeight + 1).length,
      }
    })
    check(`${label} ${project}: the opened piece has a label`, r.shown && r.text.length > 0, JSON.stringify(r.text))
    check(`${label} ${project}: inside its frame`, r.inside)
    // The inset outline plus at least one outer shadow.
    check(`${label} ${project}: lifted on a shadow`, (r.shadow.match(/rgba?\(/g) ?? []).length >= 3, r.shadow.slice(0, 80))
    check(`${label} ${project}: and the set still fits the window`, r.outside === 0, `${r.outside} outside`)
    await page.screenshot({path: `${OUT}/label-${label}-${project.split('/').pop()}.png`})
    await page.close()
  }
}

// ------------------------------------------------------------ actual size
for (const [label, opts] of [
  ['1440', {viewport: {width: 1440, height: 900}}],
  ['phone', {...devices['iPhone 13']}],
]) {
  const page = await browser.newPage(opts)
  await page.goto(`${BASE}/collage`, {waitUntil: 'load', timeout: 60_000})
  const btn = page.locator('[data-realsize]').first()
  const n = await page.locator('[data-realsize]').count()
  check(`${label}: a collage offers its actual size`, n > 0, `${n} button(s)`)
  if (!n) {
    await page.close()
    continue
  }
  const caption = await btn.evaluate((b) => b.closest('.series__piece')?.querySelector('.series__label')?.textContent?.trim())
  console.log(`      label: ${JSON.stringify(caption)}`)
  await btn.scrollIntoViewIfNeeded()
  await page.screenshot({path: `${OUT}/collage-label-${label}.png`})
  await btn.click()
  await page.waitForTimeout(500)
  const sharp = await page
    .waitForFunction(() => {
      const s = document.querySelector('.realsize__sharp')
      return s && s.complete && s.naturalWidth > 0 && getComputedStyle(s).opacity === '1'
    }, null, {timeout: 20_000})
    .then(() => true)
    .catch(() => false)
  const r = await page.evaluate(() => {
    const d = document.querySelector('dialog.realsize')
    const sheet = d?.querySelector('.realsize__sheet')
    const paper = d?.querySelector('.realsize__paper')
    const nums = d?.querySelectorAll('.realsize__num').length ?? 0
    const inch = parseFloat(getComputedStyle(sheet).getPropertyValue('--in'))
    const s = d?.querySelector('.realsize__sharp')
    const sc = d?.querySelector('.realsize__scroll')
    return {
      open: !!d?.open,
      inch,
      paperW: paper?.getBoundingClientRect().width,
      nums,
      sharpW: s?.naturalWidth,
      centred: sc ? Math.abs(sc.scrollLeft - (sc.scrollWidth - sc.clientWidth) / 2) < 4 : false,
      title: d?.querySelector('.realsize__title')?.textContent,
    }
  })
  check(`${label}: the actual-size view opens`, r.open, r.title)
  check(`${label}: with a number at every inch of the ruler`, r.nums >= 2, `${r.nums} numbers, an inch is ${r.inch}px`)
  check(`${label}: the paper is as wide as its inches`, r.paperW > 0 && r.paperW / r.inch >= r.nums - 1.1, `${Math.round(r.paperW)}px`)
  check(`${label}: and the sharp picture arrives`, sharp, `${r.sharpW}px across`)
  check(`${label}: starting on the middle of the piece`, r.centred)
  await page.screenshot({path: `${OUT}/actual-size-${label}.png`})
  await page.locator('[data-realsize-calibrate]').click()
  await page.waitForTimeout(300)
  const card = await page.evaluate(() => {
    const c = document.querySelector('.realsize__card')?.getBoundingClientRect()
    const inch = parseFloat(getComputedStyle(document.querySelector('.realsize__sheet')).getPropertyValue('--in'))
    return {w: c?.width, h: c?.height, inch}
  })
  check(`${label}: "Match my screen" shows a bank card at the same inch`, Math.abs(card.w - 3.37 * card.inch) < 2, `${Math.round(card.w)}x${Math.round(card.h)}px`)
  await page.screenshot({path: `${OUT}/actual-size-calibrate-${label}.png`})
  await page.locator('[data-realsize-close]').click()
  await page.waitForTimeout(300)
  check(`${label}: and Close closes it`, !(await page.evaluate(() => document.querySelector('dialog.realsize')?.open)))
  await page.close()
}

// ------------------------------------------------------------ production
{
  const page = await browser.newPage()
  const res = await page.goto('https://rumeaudesign.co/portfolio', {waitUntil: 'domcontentloaded', timeout: 60_000}).catch(() => null)
  if (res) {
    const has = await page.evaluate(() => ({
      labels: document.querySelectorAll('.pf-item__label').length,
      trial: !!document.querySelector('#pf-grid.has-labels, #pf-grid.is-wall'),
    }))
    check('production has no labels or wall yet', has.labels === 0 && !has.trial, JSON.stringify(has))
  }
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
