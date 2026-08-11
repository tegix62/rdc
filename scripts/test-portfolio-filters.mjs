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
const check = (name, actual, expected, detail = '') => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (pass) console.log(`  ok   ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    if (detail) console.log(`  ...  ${detail}`)
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
    // The literal attribute, so a contaminated or absent class is visible
    // rather than inferred.
    rawClasses: items.slice(0, 4).map((el) => el.getAttribute('class')),
    // Visual editing embeds these invisible markers in strings. Their presence
    // explains a lookup silently failing on a value that looks correct.
    zeroWidth: (document.documentElement.innerHTML.match(/[\u200B-\u200F\uFEFF\u2060]/g) ?? []).length,
  }
})
console.log(`  ${markup.total} tiles; category classes: ${JSON.stringify(markup.categoryClasses)}`)
console.log('  raw class attributes on the first 4 tiles:')
for (const c of markup.rawClasses) console.log(`    ${JSON.stringify(c)}`)
console.log(
  `  zero-width characters in page HTML: ${markup.zeroWidth} ` +
    `(stega markers - these contaminate any string used as a lookup key)`,
)
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

/*
  Expand a tile that actually HAS a jump button.

  This clicked `.pf-item` - whichever tile happened to be first - and skipped
  its own assertions with a friendly note when that tile had no parent case
  study. So the width check could go green having measured nothing, which is
  worse than no check at all. Pick a tile with a jump link and measure that one.
*/
console.log('\nexpand + jump button')
const jumpTile = page.locator('.pf-item:has(.pf-item__jump)').first()
const haveJumpTile = (await jumpTile.count()) > 0
check('at least one tile links to a project', haveJumpTile, true)

if (haveJumpTile) {
  await jumpTile.click()
  await page.waitForTimeout(600)
  const expanded = await page.evaluate(() => {
    const el = document.querySelector('.pf-item.is-expanded')
    if (!el) return null
    const jump = el.querySelector('.pf-item__jump')
    const img = el.querySelector('img')
    if (!jump || !img) return {hasExpanded: true, jumpVisible: false}
    const j = jump.getBoundingClientRect()
    const i = img.getBoundingClientRect()
    return {
      hasExpanded: true,
      jumpVisible: getComputedStyle(jump).display !== 'none',
      /*
        Edges, not width. Width alone passes for a button that is the right size
        and offset sideways, and it was the width check that let a 6px inset on
        each side ship - Chris caught that by eye as "a couple px too much
        padding". The button and the image are children of the same padded
        frame, so their left and right edges should be the same line.
      */
      leftGap: +(j.left - i.left).toFixed(1),
      rightGap: +(i.right - j.right).toFixed(1),
    }
  })
  check('a tile expands on click', expanded?.hasExpanded, true)
  check('jump button is visible when expanded', expanded?.jumpVisible, true)
  check(
    'jump button lines up with the image edges',
    Math.abs(expanded?.leftGap ?? 99) < 1 && Math.abs(expanded?.rightGap ?? 99) < 1,
    true,
    `left ${expanded?.leftGap}px, right ${expanded?.rightGap}px`,
  )
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
