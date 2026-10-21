/*
  The preview experiments, in a real browser, with pictures.

    museum labels  an opened piece in the All view's gather carries a label
                   under it - its title, what it is when Studio knows, and,
                   where the project has credits, a line of the names
                   involved, linked as the Credits panel links them - and
                   the set still fits the window
    the glide      the gathered pieces travel from where they were to where
                   they land, and stop
    the wall and   ROLLED BACK - checked absent: no lifted shadow, nothing
    paste-up       pasting down
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
    await page.waitForTimeout(120)
    // Rolled back (Chris: "a little cheesy currently"): nothing pastes down.
    const pasting = await page.evaluate(() => ({
      n: document.querySelectorAll('#pf-grid .pf-item__frame.is-pasting').length,
      grid: !!document.querySelector('#pf-grid.is-paste, #pf-grid.is-wall'),
    }))
    check(`${label} ${project}: no paste-up or lifted wall any more`, pasting.n === 0 && !pasting.grid, JSON.stringify(pasting))
    // The calm gather: the project's pieces mid-way through their move.
    const moving = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#pf-grid .pf-item')).length,
    )
    check(`${label} ${project}: the pieces glide into place`, moving >= 3, `${moving} moving`)
    await page.waitForTimeout(3400)
    const stillMoving = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#pf-grid .pf-item')).length,
    )
    check(`${label} ${project}: and stop`, stillMoving === 0, `${stillMoving} still moving`)
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
        credits: Array.from(lab?.querySelectorAll('.pf-item__credit') ?? []).map((c) =>
          c.textContent.replace(/[\u200b-\u200f\u2060-\u206f\ufeff]/g, '').trim(),
        ),
        creditLinks: lab?.querySelectorAll('a.pf-item__credit-name').length ?? 0,
        creditsInside: (() => {
          const c = lab?.querySelector('.pf-item__label-credits')?.getBoundingClientRect()
          return !c || (c.bottom <= lb.bottom + 1 && c.height > 0)
        })(),
        // On a phone the rest of the set runs on below the screen by
        // design; there it is the opened piece and its label that must fit.
        outside: (innerWidth < 768 ? [opened] : set).filter((el) => el && el.getBoundingClientRect().bottom > innerHeight + 1).length,
      }
    })
    check(`${label} ${project}: the opened piece has a label`, r.shown && r.text.length > 0, JSON.stringify(r.text))
    check(`${label} ${project}: naming the piece, not its project again`, !/^(DumpStat|Hug a Mug)\s+[-–—:]/.test(r.text), JSON.stringify(r.text))
    check(`${label} ${project}: inside its frame`, r.inside)
    // Just the frame's own navy outline - the wall's shadow is rolled back.
    check(`${label} ${project}: and its frame no longer lifts on a shadow`, (r.shadow.match(/rgba?\(/g) ?? []).length <= 1, r.shadow.slice(0, 80))
    console.log(`      names: ${r.credits.length ? r.credits.join(' | ') : '(the project has no credits)'} - ${r.creditLinks} linked`)
    check(`${label} ${project}: and any names sit whole inside the label`, r.creditsInside)
    check(`${label} ${project}: and the set still fits the window`, r.outside === 0, `${r.outside} outside`)
    await page.screenshot({path: `${OUT}/label-${label}-${project.split('/').pop()}.png`})
    await page.close()
  }
}

// ------------------------------------------------------------ glide, on video
// Motion has to be seen moving: a short recording of a gather per size.
for (const [label, opts, size] of [
  ['1440', {viewport: {width: 1440, height: 900}}, {width: 1440, height: 900}],
  ['phone', {...devices['iPhone 13']}, {width: 390, height: 664}],
]) {
  const ctx = await browser.newContext({...opts, recordVideo: {dir: `${OUT}/video-tmp`, size}})
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/portfolio`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#pf-grid .pf-item', {state: 'visible', timeout: 30_000})
  await page.waitForTimeout(2500)
  // A DumpStat piece part-way down the first screen, so the gather has
  // somewhere to come from.
  const i = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#pf-grid .pf-item'))
    const ok = (el) => {
      const b = el.getBoundingClientRect()
      return (
        el.querySelector('.pf-item__jump')?.getAttribute('href') === '/work/dumpstat' &&
        !el.querySelector('.pf-card') &&
        b.top > innerHeight * 0.3 &&
        b.bottom < innerHeight
      )
    }
    const k = all.findIndex(ok)
    return k >= 0 ? k : all.findIndex((el) => el.querySelector('.pf-item__jump')?.getAttribute('href') === '/work/dumpstat')
  })
  await page.locator('#pf-grid .pf-item').nth(i).locator('.pf-item__img').click()
  await page.waitForTimeout(2500)
  const video = page.video()
  await ctx.close()
  if (video) {
    const {renameSync} = await import('node:fs')
    renameSync(await video.path(), `${OUT}/glide-${label}.webm`)
    console.log(`      recorded glide-${label}.webm`)
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
      // The ruler pinned in sight, though the view opens on the middle.
      rulerInView: (() => {
        const rb = d?.querySelector('.realsize__ruler')?.getBoundingClientRect()
        const vb = sc?.getBoundingClientRect()
        return !!rb && !!vb && rb.top >= vb.top - 1 && rb.bottom <= vb.bottom && rb.height > 0
      })(),
    }
  })
  check(`${label}: the actual-size view opens`, r.open, r.title)
  check(`${label}: with a number at every inch of the ruler`, r.nums >= 2, `${r.nums} numbers, an inch is ${r.inch}px`)
  check(`${label}: the paper is as wide as its inches`, r.paperW > 0 && r.paperW / r.inch >= r.nums - 1.1, `${Math.round(r.paperW)}px`)
  check(`${label}: and the sharp picture arrives`, sharp, `${r.sharpW}px across`)
  check(`${label}: starting on the middle of the piece`, r.centred)
  check(`${label}: with the ruler still in sight`, r.rulerInView)
  await page.screenshot({path: `${OUT}/actual-size-${label}.png`})
  await page.locator('[data-realsize-calibrate]').click()
  await page.waitForTimeout(300)
  const card = await page.evaluate(() => {
    const c = document.querySelector('.realsize__card')?.getBoundingClientRect()
    const inch = parseFloat(getComputedStyle(document.querySelector('.realsize__sheet')).getPropertyValue('--in'))
    return {w: c?.width, h: c?.height, inch, vw: innerWidth}
  })
  // Lying flat, or upright where flat would be wider than the screen.
  const long = Math.max(card.w, card.h)
  const short = Math.min(card.w, card.h)
  check(
    `${label}: "Match my screen" shows a bank card at the same inch`,
    Math.abs(long - 3.37 * card.inch) < 2 && Math.abs(short - 2.125 * card.inch) < 2,
    `${Math.round(card.w)}x${Math.round(card.h)}px`,
  )
  check(`${label}: and the whole card fits across the screen`, card.w <= card.vw, `${Math.round(card.w)} of ${card.vw}px`)
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
      trial: !!document.querySelector('#pf-grid.has-labels, #pf-grid.is-wall, #pf-grid.is-paste'),
    }))
    check('production has none of the experiments', has.labels === 0 && !has.trial, JSON.stringify(has))
  }
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
