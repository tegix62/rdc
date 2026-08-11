/*
  The homepage grid always fills whole rows.

  WHY THIS IS TESTED

  It is arithmetic whose only symptom when wrong is a homepage that looks
  slightly off. Nobody files "the grid feels ragged" - they just come away
  thinking the site is a bit amateur, which for a portfolio is the whole ball
  game. It is also the kind of code that looks obviously correct and has an
  off-by-one in it.

  The case that prompted it: Chris deleted "More Kilos, Less Egos", a
  placeholder shirt for Adelante Barbell Club. That took the case studies from
  six to five, and five tiles in a four-column grid is one full row plus a
  single orphan against three empty cells.

  Usage: node scripts/test-peek-grid.mjs
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

/*
  queries.ts imports the Sanity client, which reads import.meta.env, so it goes
  through esbuild like the other lib tests. Only the pure helpers are exercised;
  nothing here touches the network.
*/
const outdir = path.join(root, 'node_modules', '.cache', 'peek-grid')
await mkdir(outdir, {recursive: true})
const outfile = path.join(outdir, 'queries.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/queries.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  define: {
    'import.meta.env.PUBLIC_SANITY_VISUAL_EDITING': '"false"',
    'import.meta.env.PUBLIC_SANITY_STUDIO_URL': '"https://example.sanity.studio"',
  },
  logLevel: 'error',
})
const {fitToRows, cellsUsedBy, PEEK_COLUMNS, displayedRef} = await import(outfile)

/*
  Tiles carry a real image reference, because the duplicate rules compare on the
  image a tile SHOWS - `thumbnail || mainImage`. A test using bare objects with
  no images would pass every dedupe check vacuously, which is how the bug below
  reached Chris's phone in the first place.
*/
const img = (ref) => ({asset: {_ref: `image-${ref}-800x800-webp`}})
const tile = (id, ref = id) => ({_id: id, title: id, thumbnail: img(ref)})
const hero = (id, ref = id) => ({_id: id, title: id, thumbnail: img(ref), heroTile: true})
const list = (n, make = tile) => Array.from({length: n}, (_, i) => make(`t${i}`))
const ids = (arr) => arr.map((t) => t._id).join(',')

check('the grid is four columns', PEEK_COLUMNS === 4, String(PEEK_COLUMNS))

// --- counting cells ----------------------------------------------------------
check('a plain tile is one cell', cellsUsedBy([tile('a')]) === 1)
check('a hero tile is two cells', cellsUsedBy([hero('a')]) === 2)
check('mixed', cellsUsedBy([tile('a'), hero('b'), tile('c')]) === 4)

// --- already full ------------------------------------------------------------
const four = list(4)
check('four tiles are left alone', fitToRows(four, list(4)) === four, 'no filler added')
check('eight tiles are left alone', fitToRows(list(8), list(4)).length === 8)
// Two heroes and four plain tiles is 8 cells - full, despite being 6 items.
check(
  'a full row counted in CELLS, not items, is left alone',
  fitToRows([hero('h1'), hero('h2'), ...list(4)], list(4)).length === 6,
)

// --- the actual case ---------------------------------------------------------
/*
  Five case studies, four columns. One orphan. With children available it should
  come back as eight cells - two complete rows.
*/
const five = list(5)
const filled = fitToRows(five, [tile('c1'), tile('c2'), tile('c3'), tile('c4')])
check('five tiles are topped up to a whole row', cellsUsedBy(filled) % 4 === 0, `${cellsUsedBy(filled)} cells`)
check('the five originals are all kept', five.every((t) => filled.includes(t)))
check('only the shortfall is added, not everything offered', filled.length === 8, ids(filled))

// --- not enough filler -------------------------------------------------------
/*
  Trimming rather than showing a ragged row. A shorter tidy grid beats a full
  ragged one, and "All work" sits right beside the heading.
*/
const trimmed = fitToRows(list(5), [tile('c1')])
check('with too little filler it trims to a whole row', cellsUsedBy(trimmed) === 4, `${cellsUsedBy(trimmed)} cells`)
check('trimming drops from the END', ids(trimmed) === 't0,t1,t2,t3', ids(trimmed))

const noFiller = fitToRows(list(6), [])
check('six with no filler trims to four', cellsUsedBy(noFiller) === 4, `${cellsUsedBy(noFiller)} cells`)

/*
  Fewer items than one row must NOT be trimmed to nothing. An empty grid is the
  one outcome worse than a ragged one - WorkGrid renders no section at all for
  an empty list, so the homepage would silently lose its work grid.
*/
const three = fitToRows(list(3), [])
check('three with no filler is kept, not trimmed away', three.length === 3, `${three.length} kept`)
const one = fitToRows(list(1), [])
check('a single tile survives', one.length === 1)
check('an empty list stays empty', fitToRows([], []).length === 0)

// --- hero tiles as filler ----------------------------------------------------
/*
  A hero would use two cells and overshoot the row it is meant to complete,
  turning a 1-cell gap into a 1-cell overflow - the same ragged row, one row
  later.
*/
// Seven tiles, so the shortfall is exactly 1 and there IS a usable filler -
// the case that actually distinguishes "skips the hero" from "gave up and
// trimmed". My first version of this used five tiles, where the shortfall is 3
// and one filler can never be enough, so it trimmed and the check passed for
// the wrong reason.
const heroFiller = fitToRows(list(7), [hero('h1'), tile('c1')])
check('a hero is never used as filler', cellsUsedBy(heroFiller) === 8, `${cellsUsedBy(heroFiller)} cells`)
check(
  'the plain tile behind it is used instead',
  heroFiller.some((t) => t._id === 'c1') && !heroFiller.some((t) => t._id === 'h1'),
  ids(heroFiller),
)
// And with ONLY a hero on offer there is nothing usable, so it trims.
const onlyHero = fitToRows(list(7), [hero('h1')])
check('with only a hero offered it trims instead', cellsUsedBy(onlyHero) === 4, `${cellsUsedBy(onlyHero)} cells`)

// --- heroes among the items --------------------------------------------------
// One hero + four plain = 6 cells, so the shortfall is 2, not 3.
const withHero = fitToRows([hero('h1'), ...list(4)], [tile('c1'), tile('c2'), tile('c3')])
check('a hero in the list is counted as two cells', cellsUsedBy(withHero) === 8, `${cellsUsedBy(withHero)} cells`)
check('so only two fillers are added', withHero.length === 7, ids(withHero))

// --- filler must not repeat what is already on the grid ----------------------
/*
  THE BUG CHRIS CAUGHT ON HIS PHONE.

  The homepage showed eight tiles: the last was the same photograph as the
  first, and the two before it were the same monogram sheet as each other -
  three consecutive captions reading "ADELANTE BARBELL CLUB". I had topped up
  the row from a project's children without checking what they would draw, and a
  Grid Item may reuse its parent's image. Eight such pairs exist in the dataset.
*/
const shown = [tile('a', 'photo'), tile('b'), tile('c'), tile('d'), tile('e')]
const dupImage = {_id: 'child', title: 'child', thumbnail: img('photo')} // same picture as 'a'
const filledSafely = fitToRows(shown, [dupImage, tile('x'), tile('y'), tile('z')])
check(
  'filler never repeats an image already on the grid',
  !filledSafely.includes(dupImage),
  ids(filledSafely),
)
check('and the row is still filled from what is left', cellsUsedBy(filledSafely) === 8, `${cellsUsedBy(filledSafely)} cells`)

// Two candidates carrying one picture: at most one may be used.
const twinA = {_id: 'twin1', title: 'twin1', thumbnail: img('monogram')}
const twinB = {_id: 'twin2', title: 'twin2', thumbnail: img('monogram')}
const noTwins = fitToRows(shown, [twinA, twinB, tile('x'), tile('y')])
check(
  'two filler candidates sharing one image are not both used',
  !(noTwins.includes(twinA) && noTwins.includes(twinB)),
  ids(noTwins),
)

/*
  The caption is `parentTitle ?? title`, so a child of a project on the grid
  reads as that project's name whatever image it carries. Three tiles saying
  "ADELANTE BARBELL CLUB" was half of what Chris saw, and distinct images would
  not have fixed it.
*/
const child = {_id: 'kid', title: 'A tee', parentTitle: 'a', thumbnail: img('unique')}
const noRepeatCaption = fitToRows(shown, [child, tile('x'), tile('y'), tile('z')])
check(
  'filler never repeats a caption already on the grid',
  !noRepeatCaption.includes(child),
  ids(noRepeatCaption),
)

// Two children of one absent project would caption identically to each other.
const sib1 = {_id: 's1', title: 's1', parentTitle: 'Brand Z', thumbnail: img('s1')}
const sib2 = {_id: 's2', title: 's2', parentTitle: 'Brand Z', thumbnail: img('s2')}
const oneSibling = fitToRows(shown, [sib1, sib2, tile('x'), tile('y')])
check(
  'two filler candidates sharing one caption are not both used',
  !(oneSibling.includes(sib1) && oneSibling.includes(sib2)),
  ids(oneSibling),
)

// A candidate with no image at all cannot fill anything.
const imageless = {_id: 'none', title: 'none'}
const skipsImageless = fitToRows(shown, [imageless, tile('x'), tile('y'), tile('z')])
check('filler with no image is skipped', !skipsImageless.includes(imageless), ids(skipsImageless))

check('displayedRef prefers the thumbnail', displayedRef({thumbnail: img('t'), mainImage: img('m')}).includes('-t-'))
check('displayedRef falls back to the main image', displayedRef({mainImage: img('m')}).includes('-m-'))
check('displayedRef is null with neither', displayedRef({title: 'x'}) === null)

// --- the mobile breakpoint ---------------------------------------------------
// .peek__grid drops to 2 columns on a phone. 4 is a multiple of 2, so anything
// that fills rows at 4 fills them at 2 - asserted so the CSS cannot drift to an
// odd column count without this failing.
check('filling rows at 4 also fills them at 2', PEEK_COLUMNS % 2 === 0)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
