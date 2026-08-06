/**
 * Deterministic seeded RNG.
 *
 * Placement has to be *stable* (re-running the build must not shuffle marks
 * around and bust every CDN cache) but *not uniform* across the set — a
 * watermark that lands in the same spot on every image is one crop, or one
 * scripted pass, away from being gone. So each image derives its own stream
 * from `globalSeed + imageKey`.
 */

/** xmur3 string hash → 32-bit seed. */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG — small, fast, good enough for placement jitter. */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(...parts) {
  const seed = xmur3(parts.join('::'))();
  const next = mulberry32(seed);
  return {
    /** float in [0,1) */
    next,
    /** float in [min,max) */
    range: (min, max) => min + next() * (max - min),
    /** integer in [min,max] inclusive */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** in-place Fisher–Yates, returns a new array */
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
