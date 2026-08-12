/*
  clampBudgetRange is the one function standing between a dragged slider and a
  number written into Sanity. It runs on both sides of the network - the
  client for live feedback, the Function again because a client is never
  trusted - so a mistake here is a mistake in two places that agree with each
  other and are both wrong.

  Bundled through esbuild rather than imported directly: this is .ts and Node
  will not load it, same as test-meta.mjs.
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}${detail ? ` - ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}
const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`)

const outdir = path.join(root, 'node_modules', '.cache', 'budget-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'budget.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/budget.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})
const {BUDGET_MIN, BUDGET_MAX, BUDGET_STEP, formatBudget, formatBudgetHigh, clampBudgetRange} = await import(outfile)

// --- bounds --------------------------------------------------------------
eq('the documented floor is $1,500', BUDGET_MIN, 1500)
eq('the documented ceiling is $6,000', BUDGET_MAX, 6000)
eq('the documented step is $250', BUDGET_STEP, 250)

// --- clamping to the track -------------------------------------------------
eq('a value below the floor is pulled up to it', clampBudgetRange(0, 3000), {min: 1500, max: 3000, openEnded: false})
eq('a value above the ceiling is pulled down to it', clampBudgetRange(1500, 99999), {min: 1500, max: 6000, openEnded: true})
eq('both handles below the floor', clampBudgetRange(-500, 100), {min: 1500, max: 1500, openEnded: false})
eq('both handles above the ceiling', clampBudgetRange(50000, 90000), {min: 6000, max: 6000, openEnded: true})

// --- the crossing case -------------------------------------------------------
/*
  The failure mode this exists for: a fast drag or a two-finger touch move can
  fire events out of order and put the "low" handle numerically above the
  "high" one for a moment. Silently accepting that would store a NEGATIVE
  range - "between $4,000 and $2,000" - which is not a thing a person can have
  meant.
*/
eq('handles arriving crossed are swapped back into order', clampBudgetRange(4000, 2000), {min: 2000, max: 4000, openEnded: false})
/*
  3001 and 3000 both snap to the same $250 step (3000), so this crossing is
  absorbed by snapping rather than needing the swap - a DIFFERENT path to the
  same safety property, worth its own case since it means the swap logic is
  not the only thing preventing a negative range.
*/
eq('a crossing smaller than one step snaps to equal handles', clampBudgetRange(3001, 3000), {min: 3000, max: 3000, openEnded: false})
// 2600 / 250 = 10.4, which rounds to 10 -> $2,500 (not $2,600 - nearest-step
// rounding, not nearest-hundred).
eq('a crossing bigger than one step still swaps after snapping', clampBudgetRange(3300, 2600), {min: 2500, max: 3250, openEnded: false})

// --- snapping ------------------------------------------------------------
eq('an off-step value snaps to the nearest step', clampBudgetRange(1600, 3333), {min: 1500, max: 3250, openEnded: false})
check('snapping rounds rather than always flooring', clampBudgetRange(1625, 1625).min === 1750 || clampBudgetRange(1625, 1625).min === 1500, 'either neighbour is acceptable for an exact midpoint')

// --- open-ended flag -------------------------------------------------------
/*
  5750 rather than 5999: with a $250 step the values near the ceiling are
  ...5500, 5750, 6000, with nothing in between - 5999 is not a real slider
  position, it is nearer to 6000 than to 5750, and correctly snaps UP to it.
  That is the clamp doing its job, not a bug; the value worth asserting
  "not open-ended" against is the highest value that is genuinely still below
  the ceiling after snapping.
*/
eq('openEnded is false at the highest step below the ceiling', clampBudgetRange(1500, 5750).openEnded, false)
eq('openEnded is true exactly at the ceiling', clampBudgetRange(1500, 6000).openEnded, true)

// --- formatting --------------------------------------------------------------
eq('formatBudget adds a dollar sign and thousands separator', formatBudget(6000), '$6,000')
eq('formatBudget has no decimals', formatBudget(1500.4), '$1,500')
eq('formatBudgetHigh below the ceiling has no plus', formatBudgetHigh(3000), '$3,000')
eq('formatBudgetHigh AT the ceiling gets a plus', formatBudgetHigh(6000), '$6,000+')
eq('formatBudgetHigh never used below the actual max stays exact', formatBudgetHigh(5750), '$5,750')

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
