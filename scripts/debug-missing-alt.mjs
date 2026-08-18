/*
  One-off: print wide raw context around specific <img> occurrences the
  on-page audit flagged as missing alt, so the real surrounding markup can be
  read directly instead of reasoned about from the component source.

  Usage: node scripts/debug-missing-alt.mjs [dist]
*/
import {readFileSync} from 'node:fs'
import path from 'node:path'

const dist = process.argv[2] ?? 'dist'

const targets = [
  {file: 'collage/index.html', marker: '973b6cfc20a0df67c37db18d015cb53'},
  {file: 'portfolio/index.html', marker: '<img'},
  {file: 'work/adelante-barbell-club/index.html', marker: 'cf4b645af6520f3f67ebdc310e7f5f9'},
]

for (const {file, marker} of targets) {
  const full = path.join(dist, file)
  let html
  try {
    html = readFileSync(full, 'utf8')
  } catch (error) {
    console.log(`\n${'='.repeat(74)}\n${file} - could not read: ${error.message}\n`)
    continue
  }
  const idx = html.indexOf(marker)
  console.log(`\n${'='.repeat(74)}\n${file} - marker "${marker}" at index ${idx}\n${'='.repeat(74)}`)
  if (idx === -1) {
    console.log('(marker not found in this build)')
    continue
  }
  const start = Math.max(0, idx - 400)
  const end = Math.min(html.length, idx + 800)
  console.log(html.slice(start, end))
}
