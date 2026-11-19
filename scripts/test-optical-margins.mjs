// Tests for scripts/lib/optical-margins.mjs. Usage: node scripts/test-optical-margins.mjs
import {opticalMargins} from './lib/optical-margins.mjs'

let failures = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      got:  ${got}\n      want: ${want}`}`)
}
const run = (h) => opticalMargins(h).html

check('a round capital moves', run('<h1 class="t">Chateau Seven</h1>'), '<h1 class="t"><span class="om om-round">C</span>hateau Seven</h1>')
check('a pointed capital moves', run('<h2>Adelante</h2>'), '<h2><span class="om om-point">A</span>delante</h2>')
check('T has its own amount', run('<h1>Two Point Oh</h1>'), '<h1><span class="om om-bar">T</span>wo Point Oh</h1>')
check('an opening quote hangs', run('<h2>“Isolate”</h2>'), '<h2><span class="om om-quote">“</span>Isolate”</h2>')
check('a straight stem stays', run('<h1>Hug a Mug</h1>'), '<h1>Hug a Mug</h1>')
check('a lower-case start stays', run('<h1>rumeau</h1>'), '<h1>rumeau</h1>')
check('through whitespace and a link', run('<h2>\n  <a href="/x">Chateau</a></h2>'), '<h2>\n  <a href="/x"><span class="om om-round">C</span>hateau</a></h2>')
check('through click-to-edit markers', run('<h1>​‌Opportunity</h1>'), '<h1>​‌<span class="om om-round">O</span>pportunity</h1>')
check('not past a picture', run('<h1><img src="a.png" alt="">Chateau</h1>'), '<h1><img src="a.png" alt="">Chateau</h1>')
check('only headings one and two', run('<h3>Chateau</h3><p>Chateau</p>'), '<h3>Chateau</h3><p>Chateau</p>')
check('several on a page', run('<h1>Chateau</h1><h2>Archive</h2><h2>Hello</h2>'), '<h1><span class="om om-round">C</span>hateau</h1><h2><span class="om om-point">A</span>rchive</h2><h2>Hello</h2>')
const twice = run(run('<h1>Chateau</h1>'))
check('run twice, wrapped once', twice, '<h1><span class="om om-round">C</span>hateau</h1>')
check('counts what it wrapped', opticalMargins('<h1>Chateau</h1><h2>Hello</h2><h2>Wars</h2>').count, 2)

console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed')
process.exit(failures ? 1 : 0)
