/*
  No page transition on desktop.

  Chris: "I see a page transition animation on desktop - let's drop that,
  it's just adding latency effect to the click."

  The browser reports, on the page it is revealing, whether a view
  transition is animating it in (the `pagereveal` event's viewTransition).
  This follows a nav link on a desktop and on a phone and records that.
  Desktop must have none. The phone keeps the swipe deck's slide, which
  Chris did not ask to lose.

  Usage: node scripts/test-page-transition.mjs [base-url]
*/
import {chromium, devices} from 'playwright'

const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const browser = await chromium.launch()
for (const [label, options] of [
  ['desktop', {viewport: {width: 1440, height: 900}}],
  ['phone', {...devices['iPhone 13'], defaultBrowserType: undefined}],
]) {
  const context = await browser.newContext(options)
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('pf-demo-shown', '1')
    } catch {}
    addEventListener('pagereveal', (e) => {
      try {
        sessionStorage.setItem('__vt', e.viewTransition ? 'yes' : 'no')
      } catch {}
    })
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/about`, {waitUntil: 'load', timeout: 60_000})
  await page.waitForTimeout(800)
  // A same-site link, followed the way a visitor follows it.
  const link = page.locator('a[href="/portfolio"], a[href="/portfolio/"]').first()
  if (label === 'phone') await link.tap().catch(() => link.click())
  else await link.click()
  await page.waitForURL(/\/portfolio/, {timeout: 30_000})
  await page.waitForTimeout(800)
  const vt = await page.evaluate(() => sessionStorage.getItem('__vt'))
  if (label === 'desktop') check('desktop: a link click changes page with no transition', vt === 'no', `view transition: ${vt}`)
  else console.log(`info  phone: view transition on a link tap: ${vt} (the swipe deck's slide, kept)`)
  await context.close()
}
await browser.close()
console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('No page transition on desktop.')
