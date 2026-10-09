/*
  The Portfolio grid's dealing order.

  WHY THIS EXISTS

  The only symptom of this being wrong is a grid that feels clumped - four
  Hug a Mug tiles in a row reading as a dumped folder rather than a body of
  work. Nobody files a bug for a feeling, which is exactly the kind of thing
  that needs a test rather than an eye.

  Every case here fails against the old `[...projects, ...linked, ...rest]`
  ordering except the ones marked UNCHANGED, which exist to prove the parts
  Chris wanted kept are still kept.

  The randomness is pinned, so these assert exact behaviour rather than
  "usually fine". A seeded generator also means a failure is reproducible
  instead of a thing that happened once in CI.

  Usage: node scripts/test-grid-order.mjs
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

const outdir = path.join(root, 'node_modules', '.cache', 'grid-order')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'gridOrder.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/gridOrder.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  logLevel: 'error',
})
const {orderTiles, projectKey, isCaseStudy} = await import(outfile)

/* A small deterministic generator, so a failure can be reproduced. */
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const cs = (slug) => ({pageType: 'Case Study', slug: {current: slug}})
const child = (parent, n) => ({pageType: 'Grid Item', slug: {current: `${parent}-${n}`}, parentSlug: parent, parentType: 'Case Study'})
const solo = (n) => ({pageType: 'Grid Item', slug: {current: `solo-${n}`}})

const keysOf = (arr) => arr.map(projectKey)
const worstRun = (arr) => {
  const k = keysOf(arr)
  let run = 1
  let worst = 1
  for (let i = 1; i < k.length; i++) {
    run = k[i] === k[i - 1] ? run + 1 : 1
    if (run > worst) worst = run
  }
  return worst
}

/* ---------- UNCHANGED: what Chris asked to keep ---------- */

{
  const items = [...Array(4)].map((_, i) => child('hug-a-mug', i)).concat([cs('hug-a-mug'), cs('dumpstat'), solo(1)])
  const {items: out} = orderTiles(items, seeded(7))
  const firstNonCase = out.findIndex((i) => !isCaseStudy(i))
  check(
    'UNCHANGED: every case study comes before anything else',
    out.slice(0, firstNonCase).every(isCaseStudy) && firstNonCase === 2,
    `${firstNonCase} case studies lead`,
  )
}

{
  const items = [cs('a'), cs('b'), cs('c')]
  const {items: out} = orderTiles(items, seeded(3))
  check('UNCHANGED: nothing is lost or duplicated', out.length === 3 && new Set(keysOf(out)).size === 3)
}

/* ---------- THE NEW RULE ---------- */

{
  // Four Hug a Mug offshoots and four other projects to put between them.
  const items = [
    cs('hug-a-mug'),
    cs('dumpstat'),
    cs('adelante'),
    cs('crush'),
    ...[0, 1, 2, 3].map((n) => child('hug-a-mug', n)),
    ...[0, 1, 2].map((n) => child('dumpstat', n)),
    ...[0, 1].map((n) => child('adelante', n)),
    child('crush', 0),
  ]
  const {items: out, adjacentPairs} = orderTiles(items, seeded(11))
  check(
    'no two tiles from the same project are adjacent',
    adjacentPairs === 0 && worstRun(out) === 1,
    `longest run ${worstRun(out)}, reported pairs ${adjacentPairs}`,
  )
}

{
  /*
    The boundary between the two phases, which is the easy one to forget:
    the last case study dealt must not be followed by its own offshoot.

    The first version of this test asked for zero adjacent pairs from
    [cs a, cs b, a1, a2, b1] and failed - correctly. Three of those five
    tiles belong to project a, and with both case studies pinned to the
    first two slots, half the seeds have no valid arrangement left at all.
    The code was reporting a forced pair, which is its job.

    So the property is asserted directly instead: whatever the seed, the
    tile after the last case study is from a different project. Each project
    here has exactly one offshoot, so the boundary is the only pair that
    could ever fail, and a pass means the seeding is doing its work rather
    than getting lucky.
  */
  let bad = 0
  for (let seed = 1; seed <= 60; seed++) {
    const items = [cs('a'), cs('b'), cs('c'), child('a', 1), child('b', 1), child('c', 1)]
    const {items: out} = orderTiles(items, seeded(seed))
    const k = keysOf(out)
    if (k[2] === k[3]) bad += 1
  }
  check(
    'the last case study is not followed by its own offshoot',
    bad === 0,
    `${bad} of 60 seeds crossed the boundary badly`,
  )
}

{
  // Tiles with no parent are not related to each other and must not be
  // treated as one pile - the first version of this lumped them together,
  // which starved every real project.
  const items = [cs('a'), child('a', 1), child('a', 2), ...[1, 2, 3, 4, 5].map(solo)]
  const {items: out, adjacentPairs} = orderTiles(items, seeded(23))
  check(
    'parentless tiles are not spaced as though related',
    adjacentPairs === 0,
    `${out.length} tiles, ${adjacentPairs} forced pair(s)`,
  )
  check(
    'each parentless tile gets its own key',
    new Set(items.filter((i) => !i.parentSlug && !isCaseStudy(i)).map(projectKey)).size === 5,
  )
}

{
  // Arithmetic, not a bug: one project outnumbering the rest forces contact.
  // The point of the assertion is that it is REPORTED, not that it is zero.
  const items = [cs('big'), cs('small'), ...[...Array(10)].map((_, n) => child('big', n)), child('small', 0)]
  const {items: out, adjacentPairs, crowdedBy} = orderTiles(items, seeded(5))
  check(
    'an unavoidable clump is counted rather than hidden',
    adjacentPairs > 0 && crowdedBy === 'cs:big',
    `${adjacentPairs} forced pair(s), crowded by ${crowdedBy}`,
  )
  check('and it still places every tile', out.length === items.length)
}

{
  /*
    Spread, not just non-adjacency: a project with as many pieces as there
    are loose tiles has to interleave all the way down, because the
    no-repeat rule leaves nothing else to alternate with. This is the case
    where reaching the end is forced rather than chosen, which is why it is
    the one asserted - see the next block for what happens when it is not
    forced, and why that answer changed.
  */
  const items = [
    cs('big'),
    ...[...Array(6)].map((_, n) => child('big', n)),
    ...[...Array(6)].map((_, n) => solo(n)),
  ]
  const {items: out} = orderTiles(items, seeded(17))
  const positions = out.map((i, idx) => [projectKey(i), idx]).filter(([k]) => k === 'cs:big').map(([, idx]) => idx)
  const last = positions[positions.length - 1]
  check(
    'a project as large as the loose pile interleaves to the far end',
    last >= out.length - 3,
    `its last tile sits at ${last} of ${out.length - 1}`,
  )
}

{
  /*
    THE BOTTOM OF THE GRID BELONGS TO UNAFFILIATED WORK.

    Chris found the Adelante "More Kilos" tee at the very bottom and asked
    whether the tail was meant to hold only unaffiliated pieces. Nothing in
    this file had ever said so, and nothing had ever checked it.

    The hole was the tie-break: taking from the largest pile leaves every
    project ending its life at length 1, where it tied with each of the
    thirty-eight standalone tiles and got picked just as often - so a
    project's last piece was shuffled uniformly through the tail.

    Asserted over many seeds rather than one, because a single seed passing
    this is luck. Measured against the old tie-break, 163 of these 200 deals
    put something affiliated in the last fifteen tiles - so this was not a
    rare edge, it was the normal case, and a one-seed test had a one-in-five
    chance of calling it fine.
  */
  const items = [
    ...['hug-a-mug', 'dumpstat', 'adelante', 'two-point-oh', 'chateau'].map(cs),
    ...[...Array(17)].map((_, n) => child('dumpstat', n)),
    ...[...Array(9)].map((_, n) => child('hug-a-mug', n)),
    ...[...Array(8)].map((_, n) => child('adelante', n)),
    ...[...Array(5)].map((_, n) => child('two-point-oh', n)),
    ...[...Array(38)].map((_, n) => solo(n)),
  ]

  let strays = 0
  let worstSeed = null
  let latest = 0
  for (let seed = 1; seed <= 200; seed++) {
    const {items: out} = orderTiles(items, seeded(seed))
    const tail = out.slice(-15)
    const affiliated = tail.filter((i) => projectKey(i).startsWith('cs:'))
    if (affiliated.length) {
      strays += 1
      if (worstSeed === null) worstSeed = seed
    }
    const last = out.map((i, idx) => [projectKey(i), idx]).filter(([k]) => k.startsWith('cs:')).pop()[1]
    latest = Math.max(latest, last)
  }
  check(
    'no affiliated piece lands in the last fifteen tiles, over 200 deals',
    strays === 0,
    strays ? `${strays} deal(s) strayed, first at seed ${worstSeed}` : `latest affiliated tile at ${latest} of ${items.length - 1}`,
  )
}

{
  // A realistic shape: 5 case studies, a long tail of offshoots, 44 solos.
  const items = [
    ...['hug-a-mug', 'dumpstat', 'adelante', 'crush', 'chateau'].map(cs),
    ...[...Array(12)].map((_, n) => child('hug-a-mug', n)),
    ...[...Array(9)].map((_, n) => child('dumpstat', n)),
    ...[...Array(7)].map((_, n) => child('adelante', n)),
    ...[...Array(3)].map((_, n) => child('crush', n)),
    ...[...Array(44)].map((_, n) => solo(n)),
  ]
  const {items: out, adjacentPairs} = orderTiles(items, seeded(99))
  check(
    'a realistic eighty-tile grid has no clumps at all',
    out.length === items.length && adjacentPairs === 0 && worstRun(out) === 1,
    `${out.length} tiles, longest run ${worstRun(out)}`,
  )
}

console.log(failures === 0 ? '\nAll grid order checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
