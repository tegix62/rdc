/*
  Are pictures slower through Cloudflare than straight from Sanity?

  Chris, October 2026: "Is the site loading slower because of the
  Cloudflare fix?" (functions/img/[[path]].ts - every picture now loads
  from /img/ on the site, which asks Sanity once and keeps a copy.)

  For a sample of the pictures the live homepage and portfolio actually
  use, timed from this machine:
    - through /img/, twice: the first may be a miss (Cloudflare asks
      Sanity), the second should be served from Cloudflare's copy
    - straight from cdn.sanity.io, once, the way they loaded before
  Time to first byte and to the last byte, medians and the slowest, plus
  what Cloudflare says about its cache where it says anything.

  Plain fetch, no browser: this times the pictures, not a whole page, and
  downloads each picture three times at most - a few megabytes - so it is
  cheap to run but is not to be scheduled. Usage:
    node scripts/measure-image-speed.mjs [site] [count]
*/
const SITE = (process.argv[2] ?? 'https://rumeaudesign.co').replace(/\/$/, '')
const COUNT = Number(process.argv[3] ?? 24)

async function pictureUrls() {
  const found = new Set()
  for (const page of ['/', '/portfolio']) {
    const html = await (await fetch(`${SITE}${page}`)).text()
    for (const m of html.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
      for (const part of m[1].split(',')) {
        const u = part.trim().split(/\s+/)[0].replace(/&amp;/g, '&')
        if (u.startsWith('/img/images/')) found.add(u)
      }
    }
  }
  // Spread across the list rather than the first few, which are all one page's hero.
  const all = [...found]
  const step = Math.max(1, Math.floor(all.length / COUNT))
  return all.filter((_, k) => k % step === 0).slice(0, COUNT)
}

// A dropped connection is retried once, then reported as status 0 rather
// than ending the run - one did, partway through, the second time it ran.
async function time(url, accept, tries = 2) {
  try {
    return await timeOnce(url, accept)
  } catch (e) {
    if (tries > 1) return time(url, accept, tries - 1)
    return {status: 0, ttfb: NaN, total: NaN, kb: 0, type: `failed: ${e.cause?.code ?? e.message}`, cache: '', colo: ''}
  }
}

async function timeOnce(url, accept = 'image/avif,image/webp,image/*,*/*;q=0.8') {
  const t0 = performance.now()
  const res = await fetch(url, {headers: {accept}})
  const ttfb = performance.now() - t0
  const body = await res.arrayBuffer()
  const total = performance.now() - t0
  return {
    status: res.status,
    ttfb,
    total,
    kb: body.byteLength / 1024,
    type: res.headers.get('content-type'),
    cache: res.headers.get('cf-cache-status') ?? res.headers.get('x-cache') ?? '',
    colo: res.headers.get('cf-ray')?.split('-')[1] ?? '',
  }
}

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}
const ms = (n) => `${Math.round(n)}ms`.padStart(7)

const urls = await pictureUrls()
console.log(`${urls.length} pictures from ${SITE} (homepage and portfolio)\n`)
const rows = []
for (const path of urls) {
  const first = await time(`${SITE}${path}`)
  const again = await time(`${SITE}${path}`)
  const direct = await time(`https://cdn.sanity.io/${path.replace(/^\/img\//, '')}`)
  // A browser that does not take AVIF (older Safari): the WebP route.
  const webp = await time(`${SITE}${path}`, 'image/webp,image/*,*/*;q=0.8')
  rows.push({path, first, again, direct, webp})
  console.log(
    `${path.split('/').pop().slice(0, 46).padEnd(46)} ` +
      `first ${ms(first.ttfb)} ${first.status}  again ${ms(again.ttfb)}  sanity ${ms(direct.ttfb)}  ` +
      `${first.kb.toFixed(0).padStart(4)}KB via us, ${direct.kb.toFixed(0).padStart(4)}KB from Sanity  ${first.type ?? ''} / ${direct.type ?? ''}`,
  )
}

const line = (name, pick) => {
  const t = rows.map((r) => pick(r).ttfb)
  const d = rows.map((r) => pick(r).total)
  const kb = rows.map((r) => pick(r).kb)
  return `${name.padEnd(28)} first byte median ${ms(median(t))}, slowest ${ms(Math.max(...t.filter(Number.isFinite)))} | whole file median ${ms(median(d))} | ${kb.reduce((a, b) => a + b, 0).toFixed(0)}KB in all`
}
console.log('\nSUMMARY')
console.log(line('through Cloudflare, first', (r) => r.first))
console.log(line('through Cloudflare, again', (r) => r.again))
console.log(line('straight from Sanity', (r) => r.direct))
const failed = rows.filter((r) => r.first.status !== 200 || r.again.status !== 200)
console.log(`\n${failed.length} picture(s) did not come back 200 through Cloudflare`)
const webpFailed = rows.filter((r) => r.webp.status !== 200)
const webpWrong = rows.filter((r) => r.webp.status === 200 && /avif/.test(r.webp.type ?? ''))
console.log(`${webpFailed.length} did not come back 200 for a browser without AVIF; ${webpWrong.length} were sent AVIF it cannot show`)
console.log(`Cloudflare location: ${rows[0]?.again.colo || 'unknown'}`)
