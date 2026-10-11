/*
  What each video facade actually puts on screen before you press play.

  WHY THIS EXISTS

  Chris: the Warped Tour embed shows a black thumbnail even though he
  chose one on YouTube. The cause was the facade testing the raw poster
  OBJECT rather than a usable URL - a Sanity image field that holds only
  crop settings is truthy, renders an empty <Img>, and the YouTube
  fallback never gets a turn.

  Every check I had was one step away from that. probe-youtube-posters
  asks YouTube whether the picture exists (it does). check-video-cors
  asks whether frames can be read. Neither looks at the markup the
  visitor receives, which is where the fault was.

  So: for every video facade on a page, report which source the poster
  came from - a Sanity asset, YouTube, or nothing at all. "Nothing at
  all" is the black box.

  READ-ONLY.

  Usage: node scripts/check-video-posters-live.mjs [base-url] [path,path]
*/
const BASE = (process.argv[2] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const PATHS = (process.argv[3] ?? '/video,/,/portfolio').split(',')

let blanks = 0
let total = 0

for (const p of PATHS) {
  const url = `${BASE}${p}`
  let html = ''
  try {
    html = await fetch(url, {redirect: 'follow'}).then((r) => r.text())
  } catch (err) {
    console.log(`${p}\n  could not read: ${String(err?.message ?? err)}\n`)
    continue
  }

  /*
    Each facade is one button. Splitting on the class and taking what
    follows keeps a facade's own markup together, so an <img> belonging
    to the next item cannot be credited to this one.
  */
  const chunks = html.split(/class="[^"]*video__facade[^"]*"/).slice(1)
  const selfPlay = html.split(/class="[^"]*video__poster-wrap[^"]*"/).slice(1)
  const all = [...chunks.map((c) => ['embed', c]), ...selfPlay.map((c) => ['self', c])]

  console.log(`${p} - ${all.length} video facade(s)`)
  for (const [kind, chunk] of all) {
    total += 1
    // Only look as far as the end of this button.
    const scope = chunk.split('</button>')[0] ?? chunk
    const yt = /i\.ytimg\.com\/vi\/([\w-]+)\/(\w+)\.jpg/.exec(scope)
    const sanity = /cdn\.sanity\.io\/images\/[^"']+/.exec(scope)
    const blank = /video__facade-blank/.test(scope)
    if (sanity) {
      console.log(`    ${kind}: Sanity image`)
    } else if (yt) {
      console.log(`    ${kind}: YouTube ${yt[2]} (${yt[1]})`)
    } else if (blank) {
      console.log(`    ${kind}: NOTHING - renders the blank placeholder`)
      blanks += 1
    } else {
      console.log(`    ${kind}: no <img> found in the facade - this is the black box`)
      blanks += 1
    }
  }
  console.log('')
}

console.log(`${total} facade(s), ${blanks} with no poster.`)
if (blanks) {
  console.log('A facade with no poster is the black rectangle before play.')
  process.exit(1)
}
console.log('Every video shows something before it is played.')
