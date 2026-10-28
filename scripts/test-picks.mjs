/*
  A picks board in a browser, with blank pictures, on the preview: the demo
  vote made by scripts/picks-demo.mjs. Kept out of search; a + on every
  piece; picking rises the tray and counts; a thumbnail in the tray takes a
  piece out; a piece still opens and grows as anywhere else, its + saying
  what it does; sending stores the vote (functions/api/picks.ts) and the
  board's results, read with its key as Studio reads them, count it; and no
  script errors.

  Leaves one vote on the demo board each run.

  Usage: SANITY_API_TOKEN=... node scripts/test-picks.mjs [base-url]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const TOKEN = process.env.SANITY_API_TOKEN
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}
const q = `*[_type == "picksBoard" && _id in path("picks.**") && label == "Demo vote"][0]{code, key}`
const demo = (await (await fetch(`https://8337vjtf.api.sanity.io/v2024-01-01/data/query/production?query=${encodeURIComponent(q)}`, {headers: {authorization: `Bearer ${TOKEN}`}})).json()).result
if (!demo) {
  console.log('FAIL  no demo board - run the Picks demo workflow first')
  process.exit(1)
}
const results = async () => {
  const res = await fetch(`${BASE}/api/picks?board=${demo.code}&key=${demo.key}`)
  return {status: res.status, body: await res.json().catch(() => ({}))}
}
const before = await results()
check('results read back with the key', before.status === 200, `${before.status} ${before.body.message ?? ''}`)
const wrong = await fetch(`${BASE}/api/picks?board=${demo.code}&key=wrong`)
check('and refused without it', wrong.status === 404, String(wrong.status))

const browser = await chromium.launch()
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const res = await page.goto(`${BASE}/picks/${demo.code}/`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  check(`${name}: the board's page is there`, res?.status() === 200, String(res?.status()))
  await page.waitForTimeout(1500)
  const head = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim(),
    noindex: /noindex/.test(document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? ''),
    pieces: document.querySelectorAll('.wd-piece:not([hidden])').length,
    adds: document.querySelectorAll('.wd-piece:not([hidden]) .wd-add').length,
    tray: !document.querySelector('.pk-tray')?.hidden,
  }))
  check(`${name}: kept out of search, headed, a + on every piece, no tray yet`, head.noindex && !!head.h1 && head.pieces > 10 && head.adds === head.pieces && !head.tray, JSON.stringify(head))
  const adds = page.locator('.wd-piece:not([hidden]) .wd-add')
  await adds.nth(0).click()
  await adds.nth(3).click()
  await adds.nth(6).click()
  await page.waitForTimeout(300)
  let t = await page.evaluate(() => ({shown: !document.querySelector('.pk-tray').hidden, count: document.querySelector('[data-count]').textContent, thumbs: document.querySelectorAll('.pk-tray__thumb').length, picked: document.querySelectorAll('.wd-piece.is-picked').length}))
  check(`${name}: three picked - the tray rises and counts them`, t.shown && t.count === '3' && t.thumbs === 3 && t.picked === 3, JSON.stringify(t))
  await page.locator('.pk-tray__thumb').first().click()
  await page.waitForTimeout(200)
  t = await page.evaluate(() => ({count: document.querySelector('[data-count]').textContent, picked: document.querySelectorAll('.wd-piece.is-picked').length}))
  check(`${name}: a thumbnail in the tray takes one out`, t.count === '2' && t.picked === 2, JSON.stringify(t))
  // The view's own flow is untouched: a piece still opens and grows, its + saying what it does.
  await page.locator('.wd-piece:not([hidden]) .wd-pic').nth(8).click({position: {x: 4, y: 4}})
  await page.waitForTimeout(800)
  const open = await page.evaluate(() => {
    const o = document.querySelector('.wd-piece.is-open')
    const l = o?.querySelector('.wd-add__label')
    return {open: !!o, label: l ? getComputedStyle(l).display !== 'none' && l.textContent : null}
  })
  check(`${name}: a piece still opens, its + labelled`, open.open && open.label === 'Add to picks', JSON.stringify(open))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  if (name === 'phone') {
    await page.locator('.pk-tray [data-send]').click()
    await page.waitForTimeout(2500)
    const said = await page.evaluate(() => ({said: document.querySelector('[data-said]')?.textContent, hidden: document.querySelector('[data-said]')?.hidden}))
    check(`${name}: the vote sends`, !said.hidden && /vote is in/.test(said.said ?? ''), JSON.stringify(said))
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.waitForTimeout(1200)
    const again = await page.evaluate(() => ({adds: document.querySelectorAll('.wd-add:not([hidden])').length, said: document.querySelector('[data-said]')?.textContent}))
    check(`${name}: and is not sent twice from the same browser`, again.adds === 0 && /vote is in/.test(again.said ?? ''), JSON.stringify(again))
  }
  check(`${name}: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}
await browser.close()

const after = await results()
check('the vote is in the results', after.status === 200 && after.body.total === (before.body.total ?? 0) + 1 && after.body.counts?.length >= 2, `${before.body.total} then ${after.body.total}`)
console.log(failures ? `\n${failures} failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
