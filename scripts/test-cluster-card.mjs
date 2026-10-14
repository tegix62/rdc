/*
  The words on a project's block above its merch cluster. See
  src/lib/clusterCard.ts. Pure logic, run in the build check.

  Usage: node scripts/test-cluster-card.mjs
*/
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
let failures = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : ` - got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`}`)
}

const outdir = path.join(root, 'node_modules', '.cache', 'cluster-card-test')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'clusterCard.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/clusterCard.ts')],
  outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'error',
})
const {firstLine, clusterCard, LINE_MAX} = await import(outfile)

// Real summaries, as they stand in Sanity.
const adelante = 'Private powerlifting gym seeking national recognition. Comprehensive brand identity redesign. An objective to craft a visual identity that reflects strength.'
const dumpstat = "Partnered with a duo as the audio producer and brand designer to raise a podcast about the world's most popular roleplaying game. Within a year it grew."
eq('the first sentence of a summary', firstLine(adelante), 'Private powerlifting gym seeking national recognition.')
eq('a long first sentence stays whole when it fits', firstLine(dumpstat), "Partnered with a duo as the audio producer and brand designer to raise a podcast about the world's most popular roleplaying game.")
const long = 'word '.repeat(60)
const cut = firstLine(long)
eq('no sentence end: cut at a word, under the limit, with an ellipsis', cut.length <= LINE_MAX + 1 && cut.endsWith('…') && !cut.includes(' …'), true)
eq('a name with a full stop in it does not end the sentence early', firstLine('Made for D&D fans. More here.'), 'Made for D&D fans.')
eq('nothing gives nothing', firstLine(''), undefined)
eq('preview editing markers do not split the line', firstLine('Private gym.​‌‍​‌ Second.'), 'Private gym.')

eq('the block from a full project', clusterCard({title: 'Two Point Oh', subtitle: 'Six months of art direction.', client: 'Henry', summaryText: 'A tour. More.', resultStat: '3x sell-through'}), {kicker: 'Six months of art direction.', title: 'Two Point Oh', client: 'Henry', line: 'A tour.', result: '3x sell-through'})
eq('no result, no result line', clusterCard({title: 'Hug a Mug', client: 'Anabel'}).result, undefined)
eq('a display headline wins over the title', clusterCard({title: 'DumpStat', headline: 'DumpStat, a D&D Podcast'}).title, 'DumpStat, a D&D Podcast')
eq('a result written on several lines reads as one', clusterCard({title: 'X', resultStat: 'Sold out\nin a week'}).result, 'Sold out in a week')
eq('no title, no block', clusterCard({}), null)

console.log('')
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('All cluster card checks pass.')
