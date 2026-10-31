/*
  The Vote toggle on the portfolio (src/lib/votes.ts), in a browser, on the
  preview. The server's side is answered here (/api/votes, /api/subscribe):
  the preview has no database bound, and the endpoint has its own test
  (test-votes-api.mjs). What is checked is the page: the toggle, the button
  in the open piece on both arrangements, that pressing it votes without
  closing the piece, that it is remembered, taken back, and the email asked
  for once.

  Usage: node scripts/test-votes.mjs [base]
*/
import {chromium} from 'playwright'

const BASE = (process.argv[2] || 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()

for (const [screen, viewport] of [['desktop', {width: 1366, height: 900}], ['phone', {width: 390, height: 844}]]) {
  const context = await browser.newContext({viewport, isMobile: screen === 'phone', hasTouch: screen === 'phone'})
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const sent = []
  const subs = []
  await page.route('**/api/votes', async (route) => {
    sent.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({json: {ok: true, on: sent.at(-1).on !== false, verified: false}})
  })
  await page.route('**/api/subscribe', async (route) => {
    subs.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({json: {ok: true}})
  })

  // All.
  await page.goto(`${BASE}/portfolio?view=all&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  const toggle = page.locator('.pf-group--arrange:not(.is-away) [data-vote]')
  if (!(await toggle.count())) {
    console.log(`(${screen}: no Vote toggle on this site - skipped)`)
    await context.close()
    continue
  }
  await toggle.click()
  await page.waitForTimeout(200)
  check(`${screen}, All: the toggle turns voting on, in the address too`, (await toggle.getAttribute('aria-pressed')) === 'true' && /[?&]vote=1/.test(page.url()), page.url())

  const tile = page.locator('.wd-piece[data-piece]:not([hidden]):not(.wd-piece--result)').nth(3)
  const id = await tile.getAttribute('data-piece')
  await tile.locator('.wd-pic').click()
  await page.waitForTimeout(900)
  const dig = page.locator('.wd-piece.is-open .vt-dig')
  check(`${screen}, All: the open piece carries "Vote"`, (await dig.count()) === 1 && /^vote$/i.test((await dig.innerText()).trim()), `${await dig.count()}`)
  await dig.click()
  await page.waitForTimeout(500)
  check(`${screen}, All: pressing it votes for that piece`, sent.length >= 1 && sent[0].piece === id && sent[0].on === true && /^[a-z0-9]{16,40}$/.test(sent[0].visitor), JSON.stringify(sent[0]))
  check(`${screen}, All: and the piece stays open, saying so`, (await page.locator('.wd-piece.is-open').getAttribute('data-piece')) === id && /voted/i.test(await dig.innerText()))
  const ask = page.locator('.vt-ask')
  check(`${screen}, All: after the first vote, the email is asked for once`, (await ask.count()) === 1)
  const askBox = await ask.boundingBox()
  check(`${screen}, All: the ask fits the screen`, !!askBox && askBox.x >= 0 && askBox.x + askBox.width <= viewport.width + 1, JSON.stringify(askBox))
  await ask.locator('.vt-ask__no').click()
  check(`${screen}, All: "No thanks" puts it away`, (await page.locator('.vt-ask').count()) === 0)

  // Remembered after a reload, and taken back.
  await page.reload({waitUntil: 'domcontentloaded'})
  await page.waitForTimeout(1500)
  check(`${screen}: the address keeps voting on after a reload`, (await page.locator('.pf-group--arrange:not(.is-away) [data-vote]').getAttribute('aria-pressed')) === 'true')
  // The address keeps the open piece too, so it may already be open.
  if (!(await page.locator(`.wd-piece.is-open[data-piece="${id}"]`).count())) {
    await page.locator(`.wd-piece[data-piece="${id}"] .wd-pic`).click()
    await page.waitForTimeout(900)
  }
  check(`${screen}: the same piece remembers the vote`, /voted/i.test((await page.locator('.wd-piece.is-open .vt-dig').innerText().catch(() => '')) || ''))
  await page.locator('.wd-piece.is-open .vt-dig').click()
  await page.waitForTimeout(400)
  check(`${screen}: pressed again, the vote is taken back`, sent.at(-1)?.on === false && sent.at(-1)?.piece === id && /^vote$/i.test((await page.locator('.wd-piece.is-open .vt-dig').innerText()).trim()), JSON.stringify(sent.at(-1)))
  check(`${screen}: and the email is not asked for again`, (await page.locator('.vt-ask').count()) === 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // The grid (Brand Identity).
  await page.locator('.pf-btn[data-filter="*"]').first().click()
  await page.waitForTimeout(1200)
  const gToggle = page.locator('.pf-group--arrange:not(.is-away) [data-vote]')
  check(`${screen}, grid: its toggle shows voting on`, (await gToggle.getAttribute('aria-pressed')) === 'true')
  const item = page.locator('.pf-item[data-piece]:not(.pf-item--study):not(.is-card):not(.pf-end)').nth(2)
  const gid = await item.getAttribute('data-piece')
  await item.locator('img').first().click()
  await page.waitForTimeout(1400)
  const gDig = page.locator('.pf-item.is-expanded .vt-dig')
  check(`${screen}, grid: the expanded tile carries the button`, (await gDig.count()) === 1, `${await gDig.count()}`)
  if (await gDig.count()) {
    const before = sent.length
    await gDig.click()
    await page.waitForTimeout(500)
    check(`${screen}, grid: it votes, and the tile stays expanded`, sent.length > before && sent.at(-1).piece === (await page.locator('.pf-item.is-expanded').getAttribute('data-piece')) && (await page.locator('.pf-item.is-expanded').count()) === 1, JSON.stringify({sent: sent.at(-1), gid}))
  }

  // Off: no button anywhere.
  await gToggle.click()
  await page.waitForTimeout(300)
  check(`${screen}: off again, the button goes and the address forgets`, (await page.locator('.vt-dig').count()) === 0 && !/vote=1/.test(page.url()))
  check(`${screen}: no script errors`, errors.length === 0, errors.join(' | '))
  await context.close()
}

// The email, sent: a fresh browser, one vote, an address.
{
  const context = await browser.newContext({viewport: {width: 1366, height: 900}})
  const page = await context.newPage()
  const subs = []
  await page.route('**/api/votes', (route) => route.fulfill({json: {ok: true, on: true}}))
  await page.route('**/api/subscribe', async (route) => {
    subs.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({json: {ok: true}})
  })
  await page.goto(`${BASE}/portfolio?view=all&seed=4187&vote=1`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  if (await page.locator('[data-vote]').count()) {
    await page.locator('.wd-piece[data-piece]:not([hidden]):not(.wd-piece--result) .wd-pic').nth(1).click()
    await page.waitForTimeout(900)
    await page.locator('.wd-piece.is-open .vt-dig').click()
    await page.waitForTimeout(400)
    await page.fill('.vt-ask input[name=email]', 'someone@example.com')
    await page.click('.vt-ask__yes')
    await page.waitForTimeout(400)
    check('the email goes to the sign-up list, marked as from votes', subs.length === 1 && subs[0].email === 'someone@example.com' && subs[0].source === 'votes', JSON.stringify(subs))
    check('and the box closes with a thank-you', (await page.locator('.vt-ask').count()) === 0 && /on the list/i.test(await page.locator('.vt-note').innerText()))
  }
  await context.close()
}

/*
  Signed: a fresh browser votes, puts its name on it, and the name rides on
  its next vote; with Votes on, names from /api/endorse tag their pieces
  and list under the open piece's button, linked, as text.
*/
{
  const context = await browser.newContext({viewport: {width: 1366, height: 900}})
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const sent = []
  await page.route('**/api/votes', async (route) => {
    const b = JSON.parse(route.request().postData() || '{}')
    sent.push(b)
    await route.fulfill({json: {ok: true, on: b.on !== false, signed: b.sign ? 'pending' : undefined}})
  })
  await page.route('**/api/subscribe', (route) => route.fulfill({json: {ok: true}}))
  await page.goto(`${BASE}/portfolio?view=all&seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(1500)
  const pieces = page.locator('.wd-piece[data-piece]:not([hidden]):not(.wd-piece--result)')
  if (await page.locator('[data-vote]').count()) {
    const named = await pieces.nth(2).getAttribute('data-piece')
    await page.route('**/api/endorse', (route) =>
      route.fulfill({json: {names: [
        {piece: named, name: '@sam.lee', link: 'https://www.instagram.com/sam.lee/'},
        {piece: named, name: 'Ana <b>x</b>', link: ''},
      ]}}),
    )
    let endorseHits = 0
    page.on('request', (r) => r.url().includes('/api/endorse') && endorseHits++)
    await page.evaluate(() => {
      const f = window.fetch.bind(window)
      window.__calls = []
      window.fetch = (...a) => (window.__calls.push(String(a[0])), f(...a))
    })
    await page.locator('.pf-group--arrange:not(.is-away) [data-vote]').click()
    await page.waitForTimeout(800)
    console.log('      debug', JSON.stringify(await page.evaluate(() => ({calls: window.__calls, voting: document.documentElement.classList.contains('is-voting'), pieces: document.querySelectorAll('.wd-piece[data-piece]').length}))), 'hits', endorseHits)
    const tag = await pieces.nth(2).locator('.vt-tag').innerText({timeout: 3000}).catch(() => '')
    const seen = await page.evaluate(() => ({tags: document.querySelectorAll('.vt-tag').length, asked: performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/endorse')).map((e) => e.name)}))
    check('Votes on: a piece people signed carries a tag', tag === '@sam.lee and 1 other', `${tag || '(none)'} ${JSON.stringify(seen)} named=${named}`)
    check('and the tag is gone when Votes is off', await (async () => {
      await page.locator('.pf-group--arrange:not(.is-away) [data-vote]').click()
      await page.waitForTimeout(200)
      const hidden = !(await pieces.nth(2).locator('.vt-tag').isVisible())
      await page.locator('.pf-group--arrange:not(.is-away) [data-vote]').click()
      await page.waitForTimeout(200)
      return hidden
    })())
    await pieces.nth(2).locator('.wd-pic').click()
    await page.waitForTimeout(900)
    const by = page.locator('.wd-piece.is-open .vt-by')
    const byText = await by.innerText({timeout: 3000}).catch(() => '')
    check('the open piece lists them under its button, the handle linked, markup shown as text', /Voted by @sam\.lee and Ana <b>x<\/b>/.test(byText) && (await by.locator('a[href="https://www.instagram.com/sam.lee/"]').count()) === 1 && (await by.locator('b').count()) === 0, byText)

    await page.locator('.wd-piece.is-open .vt-dig').click()
    await page.waitForTimeout(400)
    await page.fill('.vt-ask input[name=name]', '@me.here')
    await page.fill('.vt-ask input[name=link]', 'mywork.com')
    await page.click('.vt-ask__yes')
    await page.waitForTimeout(400)
    const signed = sent.find((b) => b.sign)
    check('signing sends the name, link and public choice with the vote', signed?.sign?.name === '@me.here' && signed.sign.link === 'mywork.com' && signed.sign.public === true, JSON.stringify(signed))
    check('and says it shows once Chris has seen it', /once Chris has seen it/i.test(await page.locator('.vt-note').innerText().catch(() => '')))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await pieces.nth(5).locator('.wd-pic').click()
    await page.waitForTimeout(900)
    await page.locator('.wd-piece.is-open .vt-dig').click()
    await page.waitForTimeout(300)
    check('the next vote carries the name too, without asking again', sent.at(-1)?.sign?.name === '@me.here' && (await page.locator('.vt-ask').count()) === 0, JSON.stringify(sent.at(-1)))
  }
  check('signed: no script errors', errors.length === 0, errors.join(' | '))
  await context.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
