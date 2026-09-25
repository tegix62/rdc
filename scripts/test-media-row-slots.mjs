/*
  The invariants of a Media Row's equal-slot layout, and of where a single
  picture sits on a case study page.

  WHY THIS EXISTS

  Both of the bugs it guards against shipped, looked fine in the code, and
  were found by Chris on his phone.

  The first: equal slots defaulted the slot SHAPE to landscape 3:2, so three
  portrait posters were each letterboxed inside a wide box - 443x295 where
  sizing by shape gave them 450x582, under half the area. Nothing was
  stretched. A screenshot cannot tell those two apart, which is why the
  measurement here is `object-fit` and the drawn ratio rather than the box:
  under `contain` or `cover` the picture keeps its own shape, and under the
  CSS default `fill` it takes the box's. If a future change ever adds
  `has-slots` without also setting `data-fit`, that last case is what would
  happen, silently, to every image in the row.

  The second: Image + Text and Media + Text always emitted their text column,
  empty or not, so a picture placed with nothing written sat in the LEFT HALF
  of the block and centred on that half - 370px off the centre every other
  block on the page shares. Varied widths on one centre read as a system;
  varied widths on two centres read as a mistake.

  So this checks three things that a screenshot cannot:

    1. no image in an equal-slots row is ever drawn at a shape that is not
       its own
    2. the slots in such a row really are equal
    3. every picture block on a case study shares one centre

  Usage: node scripts/test-media-row-slots.mjs [baseUrl]
*/
import {chromium} from 'playwright'

const BASE = process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev'
/*
  The style guide carries every layout mode as a fixture; the case study is
  the real content those fixtures stand in for. Both, because a fixture page
  passing proves the CSS works and says nothing about whether the content
  reaches it.
*/
const PATHS = ['/style-guide', '/work/two-point-oh']
// Above the phone breakpoint, which is the only place equal slots apply.
const WIDTH = {width: 1512, height: 900}

let problems = 0
const fail = (message) => {
  console.log(`  FAIL ${message}`)
  problems += 1
}

/*
  What src/lib/measure.ts assumes, resolved at THIS viewport.

  The build warning predicts a block's width from these tokens, and nothing at
  build time has a layout to read them from - so they are a second copy of
  numbers that live in global.css, which is how two mechanisms for one job
  drift apart. This is the thing that stops them: change a token in the
  stylesheet without changing the module and the check fails naming both.

  Custom properties do not resolve through getPropertyValue - it hands back
  '76vh', not pixels - so each one is measured by giving a probe element that
  width and reading the box.
*/
const ASSUMED = {
  '--plate-fit': 684, // 76vh of 900
  '--space-3': 24, // 1.5rem
  '--space-4': 32, // 2rem
  '--wide-room': 1448, // min(100vw - 2 * --space-4, 100rem) at 1512
  'row-max, two-up': 612, // min(68vh, 44rem)
  'row-max, three-up': 558, // min(62vh, 40rem)
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: WIDTH})

for (const path of PATHS) {
  console.log(`\n=== ${path} ===`)
  const response = await page.goto(`${BASE}${path}`, {waitUntil: 'load', timeout: 60000})
  if (!response || !response.ok()) {
    fail(`${path} -> HTTP ${response ? response.status() : 'no response'}`)
    continue
  }
  // Images size their boxes from width/height attributes, but object-fit is
  // only observable once there are pixels to fit.
  await page.evaluate(() =>
    Promise.all(Array.from(document.images).map((i) => (i.complete ? null : i.decode().catch(() => {})))),
  )

  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.media-row__items.has-slots')).map((row) => ({
      fit: row.dataset.fit ?? null,
      cellAr: getComputedStyle(row).getPropertyValue('--cell-ar').trim(),
      /*
        Does the media actually FILL its slot?

        Separate from the image checks below because the case that failed was
        a video: --video-fit caps a clip at 65vh, max-height beats height, so
        the media sat short inside a slot that was the right size. Three
        across at 4:5 - the shape the Studio field offers - cleared that cap
        by two pixels, so the whole class of bug was invisible at the one
        setting anybody was using.
      */
      slots: Array.from(row.querySelectorAll('.media-row__item')).map((fig) => {
        const media = fig.querySelector('img, video')
        if (!media) return null
        const cell = fig.getBoundingClientRect()
        const box = media.getBoundingClientRect()
        return {
          cell: `${cell.width.toFixed(0)}x${cell.height.toFixed(0)}`,
          box: `${box.width.toFixed(0)}x${box.height.toFixed(0)}`,
          short: cell.height - box.height,
        }
      }).filter(Boolean),
      items: Array.from(row.querySelectorAll('img')).map((img) => {
        const box = img.getBoundingClientRect()
        const objectFit = getComputedStyle(img).objectFit
        const natural = img.naturalWidth / img.naturalHeight
        return {
          objectFit,
          width: box.width,
          height: box.height,
          natural,
          // What the picture is actually drawn as: its own shape under
          // contain/cover, the box's shape under `fill`.
          drawn: objectFit === 'fill' ? box.width / box.height : natural,
        }
      }),
    })),
  )

  console.log(`${rows.length} equal-slot row(s)`)
  rows.forEach((row, i) => {
    const label = `row ${i} (fit: ${row.fit ?? 'NONE'}, slots ${row.cellAr || 'unset'})`
    /*
      `items` counts IMAGES, and a row can be all video - which is exactly the
      row the slot-fill bug lived in. Returning on an empty image list skipped
      it in silence, so the check reported "2 equal-slot rows" and then had
      nothing to say about one of them.
    */
    if (!row.items.length && !row.slots.length) return
    // Counted from here, so the "ok" line below reports THIS row rather than
    // the run as a whole - an all-clear printed under a failure it does not
    // cover is how a red check gets read as green.
    const before = problems
    if (!row.fit) fail(`${label} has the has-slots class and no data-fit, so its images are stretched to the slot`)

    for (const item of row.items) {
      if (!Number.isFinite(item.natural) || item.natural === 0) continue
      if (Math.abs(item.drawn - item.natural) > 0.005) {
        fail(
          `${label}: an image is drawn at ${item.drawn.toFixed(3)} but its file is ` +
            `${item.natural.toFixed(3)} (object-fit: ${item.objectFit}) - it is distorted`,
        )
      }
    }

    /*
      A slot the media does not fill is a slot that is not doing its job -
      and 1px of tolerance, because a cell whose height is an odd number of
      device pixels rounds.
    */
    for (const slot of row.slots) {
      if (slot.short > 1) {
        fail(
          `${label}: media sits ${slot.short.toFixed(0)}px short of its slot ` +
            `(${slot.box} inside ${slot.cell}) - something is capping it above the slot`,
        )
      }
    }

    // Equal slots, or they are not slots.
    const widths = row.items.map((it) => it.width)
    const spread = Math.max(...widths) - Math.min(...widths)
    if (spread > 1) {
      fail(`${label}: slot widths differ by ${spread.toFixed(0)}px (${widths.map((w) => w.toFixed(0)).join(', ')})`)
    }
    if (problems === before) {
      console.log(
        `  ok ${label}: ${row.slots.length} equal slots, media fills each one` +
          `${row.items.length ? ', every image at its own shape' : ' (all video)'}`,
      )
    }
  })

  /*
    ONE CENTRE DOWN THE PAGE.

    The block's own box is not the question - a two-column block spans the
    measure whether or not its second column holds anything, which is exactly
    how the off-centre pictures went unnoticed. What the eye follows is the
    media, so this measures from the first item's left edge to the last
    item's right and compares centres.
  */
  const centres = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.work-band__inner > .work-section'))
      .map((el) => {
        const media = el.querySelectorAll('img, .work-video-frame')
        if (!media.length) return null
        const first = media[0].getBoundingClientRect()
        const last = media[media.length - 1].getBoundingClientRect()
        if (!first.width || !last.width) return null
        return {
          type: el.className,
          centre: (first.left + last.right) / 2,
          left: first.left,
          right: last.right,
        }
      })
      .filter(Boolean),
  )

  if (!centres.length) {
    console.log('no picture blocks in a work band here')
  } else {
    const page_centre = WIDTH.width / 2
    const before = problems
    console.log(`${centres.length} picture block(s), page centre ${page_centre}`)
    for (const block of centres) {
      // 2px, not 0: sub-pixel layout and an odd-width row both land half a
      // pixel out, and a test that fails on that gets switched off.
      const off = block.centre - page_centre
      if (Math.abs(off) > 2) {
        fail(
          `a block centres on ${block.centre.toFixed(0)}, ${off.toFixed(0)}px off the page centre ` +
            `(${block.left.toFixed(0)} -> ${block.right.toFixed(0)}) - ${block.type}`,
        )
      }
    }
    if (problems === before) console.log('  ok every picture block shares the page centre')
  }

  /*
    And the markup reason the centres used to disagree: an empty text column.
    Checked directly, because the centre test above only catches it on a page
    that happens to contain one.
  */
  const emptyColumns = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.work-section__text')).filter(
        (el) => !el.textContent.trim() && !el.querySelector('img, svg, iframe, video'),
      ).length,
  )
  if (emptyColumns) {
    fail(`${emptyColumns} empty text column(s) - a block with no copy should not be a two-column block`)
  }
}

/*
  The tokens themselves, measured once - on whichever page loaded last, since
  they are declared on :root and the band and are the same everywhere.
*/
console.log('\n=== layout tokens, against what the build warning assumes ===')
const measured = await page.evaluate((expressions) => {
  const host = document.querySelector('.work-band__inner') ?? document.body
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  host.appendChild(probe)
  const read = (value) => {
    probe.style.width = value
    return probe.getBoundingClientRect().width
  }
  const out = {
    '--plate-fit': read('var(--plate-fit)'),
    '--space-3': read('var(--space-3)'),
    '--space-4': read('var(--space-4)'),
    // --wide-room is declared on the band, which is why the probe lives there.
    '--wide-room': read('var(--wide-room)'),
    // Not tokens but literals in rowMaxFor() - written into the style
    // attribute rather than the sheet, so they are read the same way.
    'row-max, two-up': read('min(68vh, 44rem)'),
    'row-max, three-up': read('min(62vh, 40rem)'),
  }
  probe.remove()
  return out
}, null)

for (const [name, expected] of Object.entries(ASSUMED)) {
  const actual = measured[name]
  if (!Number.isFinite(actual) || actual === 0) {
    fail(`${name}: could not be resolved on this page`)
  } else if (Math.abs(actual - expected) > 1) {
    fail(
      `${name}: global.css resolves to ${actual.toFixed(0)}px, ` +
        `src/lib/measure.ts assumes ${expected}px - the build warning is now predicting ` +
        `widths from a stale token. Change both.`,
    )
  } else {
    console.log(`  ok ${name.padEnd(20)} ${actual.toFixed(0)}px`)
  }
}

console.log(
  problems
    ? `\n\n${problems} layout problem(s) found.`
    : '\n\nEqual slots never distort, the slots are equal, every picture block shares one centre,\nand the build warning is predicting from the tokens the stylesheet actually has.',
)
await browser.close()
process.exit(problems ? 1 : 0)
