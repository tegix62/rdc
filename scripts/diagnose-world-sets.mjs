/*
  Why does a project come apart on the world page? Chris: "I'm noticing the
  hug a mug stuff is all separated."

  Loads /next/world/home (Lands) on the preview with blank pictures, at a
  phone and a desktop, and prints: for every piece whose title or project
  matches the term, its project, whether it is the project's own tile, what
  it is parented to, and where it landed; then, for every project, how many
  separate patches its pieces make (pieces touching within a few pixels
  count as one patch).

  Usage: node scripts/diagnose-world-sets.mjs [term] [base-url]
*/
import {chromium} from 'playwright'

const TERM = (process.argv[2] ?? 'hug').toLowerCase()
const BASE = (process.argv[3] ?? 'https://preview.rumeau-design-co.pages.dev').replace(/\/$/, '')
const browser = await chromium.launch()
for (const [name, w, h] of [
  ['phone', 390, 844],
  ['desktop', 1440, 900],
]) {
  const page = await browser.newPage({viewport: {width: w, height: h}})
  await page.goto(`${BASE}/next/world/home?seed=4187`, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForTimeout(2500)
  const out = await page.evaluate((term) => {
    const data = JSON.parse(document.getElementById('wd-data').textContent)
    // By each piece's own number: the page re-orders them as they are laid.
    const tileOf = (i) => document.querySelector(`.wd-piece[data-i="${i}"]`)
    const box = (i) => {
      const r = tileOf(i).getBoundingClientRect()
      return {l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY}
    }
    const near = (a, b) => a.l <= b.r + 6 && b.l <= a.r + 6 && a.t <= b.b + 6 && b.t <= a.b + 6
    const rows = data.pieces
      .map((p, i) => ({i, ...p}))
      .filter((p) => `${p.title} ${p.project ?? ''}`.toLowerCase().includes(term))
      .map((p) => {
        const b = box(p.i)
        return `${p.own ? 'OWN ' : '    '}${p.title.slice(0, 40).padEnd(40)} project=${p.project ?? '-'} parent=${p.parent ?? '-'} id=${p.id} at ${Math.round(b.l)},${Math.round(b.t)} ${Math.round(b.r - b.l)}px`
      })
    const byProject = new Map()
    data.pieces.forEach((p, i) => p.project && byProject.set(p.project, [...(byProject.get(p.project) ?? []), i]))
    const patches = [...byProject].map(([k, is]) => {
      const left = new Set(is)
      let n = 0
      while (left.size) {
        n++
        const stack = [left.values().next().value]
        left.delete(stack[0])
        while (stack.length) {
          const a = stack.pop()
          for (const b of [...left]) if (near(box(a), box(b))) (left.delete(b), stack.push(b))
        }
      }
      // How spread out: its bounding box over the area its pieces cover (1 = a solid block).
      const bs = is.map(box)
      const bb = (Math.max(...bs.map((b) => b.r)) - Math.min(...bs.map((b) => b.l))) * (Math.max(...bs.map((b) => b.b)) - Math.min(...bs.map((b) => b.t)))
      const area = bs.reduce((n, b) => n + (b.r - b.l) * (b.b - b.t), 0)
      return `${String(n).padStart(2)} patch(es)  ${String(is.length).padStart(3)} pieces  spread ${(bb / area).toFixed(1)}  ${k}`
    })
    return {rows, patches}
  }, TERM)
  if (name === 'phone' && process.env.DUMP_DATA) {
    // The page's own piece data, for tuning the layout on the real pieces offline.
    const json = await page.evaluate(() => document.getElementById('wd-data').textContent)
    const {writeFileSync} = await import('node:fs')
    writeFileSync(process.env.DUMP_DATA, json)
    console.log(`\n(page data written to ${process.env.DUMP_DATA})`)
  }
  console.log(`\n== ${name}: pieces matching "${TERM}"`)
  out.rows.forEach((r) => console.log(r))
  console.log(`\n== ${name}: patches per project`)
  out.patches.forEach((r) => console.log(r))
  await page.close()
}
await browser.close()
