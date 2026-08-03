/*
  Clicks the Portfolio filter buttons on the deployed site and checks that tiles
  actually appear and disappear.

  Written because "the buttons don't work" has now been reported twice, the first
  cause (the category was a data attribute, not a class, so Isotope's CSS-selector
  filter matched nothing) is fixed, and asserting a fix without exercising it has
  been wrong repeatedly today. Isotope hides filtered tiles by setting
  display:none, so visibility is the thing to measure.

  It also reports whether the two CDN scripts Isotope depends on actually loaded,
  because if either fails every control on the page dies at once - filters,
  shuffle and the +/- sizing - which looks identical to a broken filter.

  Usage: node scripts/test-portfolio-filters.mjs [url]
*/
import {chromium} from 'playwright'

const URL = process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev/portfolio'

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1440, height: 900}})

const failedRequests = []
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} - ${r.failure()?.errorText}`))
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160))
})

let failures = 0
const check = (name, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (pass) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`)
  }
}

await page.goto(URL, {waitUntil: 'load', timeout: 60000})
await page.waitForTimeout(3000)

console.log(`\n${URL}\n`)

console.log('dependencies')
const deps = await page.evaluate(() => ({
  isotope: typeof window.Isotope,
  imagesLoaded: typeof window.imagesLoaded,
}))
check('Isotope loaded', deps.isotope, 'function')
check('imagesLoaded loaded', deps.imagesLoaded, 'function')

console.log('\nmarkup')
const markup = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.pf-item')]
  const classes = {}
  for (const el of items) {
    for (const c of el.classList) {
      if (c !== 'pf-item' && c !== 'is-expanded') classes[c] = (classes[c] ?? 0) + 1
    }
  }
  return {
    total: items.length,
    withNoCategoryClass: items.filter((el) => el.classList.length === 1).length,
    categoryClasses: classes,
    buttons: [...document.querySelectorAll('.pf-btn[data-filter]')].map((b) => b.dataset.filter),
  }
})
console.log(`  ${markup.total} tiles; category classes: ${JSON.stringify(markup.categoryClasses)}`)
console.log(`  tiles with no category class: ${markup.withNoCategoryClass}`)
console.log(`  filter buttons: ${markup.buttons.join(' ')}`)
check('tiles carry category classes', Object.keys(markup.categoryClasses).length > 0, true)

const visibleCount = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.pf-item')].filter(
        (el) => getComputedStyle(el).display !== 'none',
      ).length,
  )

console.log('\nfiltering')
const baseline = await visibleCount()
console.log(`  all: ${baseline} visible`)

for (const sel of markup.buttons.filter((b) => b !== '*')) {
  const cls = sel.replace('.', '')
  const expected = markup.categoryClasses[cls] ?? 0

  await page.click(`.pf-btn[data-filter="${sel}"]`)
  await page.waitForTimeout(700)
  const shown = await visibleCount()
  console.log(`  ${sel}: ${shown} visible (tiles with that class: ${expected})`)
  check(`${sel} shows only its own tiles`, shown, expected)

  // Back to All for the next case.
  await page.click('.pf-btn[data-filter="*"]')
  await page.waitForTimeout(500)
}

const restored = await visibleCount()
check('All restores every tile', restored, baseline)

console.log('\nexpand + jump button')
await page.click('.pf-item')
await page.waitForTimeout(600)
const expanded = await page.evaluate(() => {
  const el = document.querySelector('.pf-item.is-expanded')
  if (!el) return null
  const jump = el.querySelector('.pf-item__jump')
  return {
    hasExpanded: true,
    jumpVisible: jump ? getComputedStyle(jump).display !== 'none' : false,
    jumpHref: jump?.getAttribute('href') ?? null,
    sameWidth: jump
      ? Math.abs(jump.getBoundingClientRect().width - el.querySelector('img').getBoundingClientRect().width) < 2
      : null,
  }
})
check('a tile expands on click', expanded?.hasExpanded, true)
if (expanded?.jumpHref) {
  check('jump button is visible when expanded', expanded.jumpVisible, true)
  check('jump button matches the image width', expanded.sameWidth, true)
} else {
  console.log('  --   first tile has no parent case study, so no jump button (expected for some tiles)')
}

if (failedRequests.length) {
  console.log('\nfailed requests:')
  for (const f of failedRequests) console.log(`  ${f}`)
}
if (consoleErrors.length) {
  console.log('\nconsole errors:')
  for (const e of consoleErrors.slice(0, 8)) console.log(`  ${e}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
await browser.close()
process.exit(failures ? 1 : 0)
