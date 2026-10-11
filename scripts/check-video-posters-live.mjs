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

  /*
    AND THE PLAIN <video> ELEMENTS, WHICH ARE MOST OF THEM.

    The first version counted only facades - the poster-with-play mode -
    and reported "1 facade, 0 with no poster" for a page carrying a media
    row of three. A video set to "click to play" or autoplay renders a
    bare <video> with a poster attribute and no facade markup at all, so
    the check walked past it and called the page clean. That is the same
    false green this file was written to catch, one layer down.

    A <video> with no poster attribute shows its first decoded frame,
    because Video.astro switches preload to auto when no poster exists.
    If the clip fades up from black, that frame is black - which is the
    complaint that started all of this.

    `hidden` ones are skipped: a facade keeps a hidden <video> behind its
    button, and that element legitimately has no poster because the
    button in front of it is the poster. Counting it would invent a
    fault on every facade on the page.
  */
  const plain = [...html.matchAll(/<video\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => !/\shidden[\s>]/i.test(t))

  console.log(`${p} - ${all.length} facade(s), ${plain.length} plain <video>`)
  for (const tag of plain) {
    total += 1
    if (/\sposter="[^"]+"/i.test(tag)) {
      console.log(`    video: poster attribute set`)
    } else {
      console.log(`    video: NO poster - shows its first frame, black if the clip fades up`)
      blanks += 1
    }
  }
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

// "videos", not "facades": this counts both kinds now, and calling the
// total facades understates what was checked by a factor of five on a
// page of self-hosted clips.
console.log(`${total} video(s), ${blanks} with no poster.`)
if (blanks) {
  console.log('A video with no poster paints its first frame - black if the clip fades up.')
  process.exit(1)
}
console.log('Every video shows something before it is played.')
