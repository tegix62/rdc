/*
  A WORLD OF WORK - three ways of laying the portfolio out the way
  Minecraft generates its world. Preview only (see /next/world/home).

  Chris: "I'd love to see your Biomes, Caves, or Height map ideas played
  out." Each is the same thing Minecraft does - noise fields over a grid,
  and rules that read them - on a grid of square cells across the page:

    HEIGHTS  A smooth noise field over the page is the terrain. A piece is
             drawn as large as the ground under the spot it lands on is
             high: mountains of big pieces, plains and valleys of small.
    CAVES    Two noise fields; where BOTH are near zero the cell is carved
             out and left white - Minecraft's "spaghetti" caves, because
             two thin sheets of near-zero cross along a winding line.
             Pieces fill everything else; the page colours the ground, so
             the tunnels read as white paths cut through it, and the
             longer tunnels carry the names of the projects beside them.
    BIOMES   One region per project. Every cell belongs to the project
             whose centre is nearest - nearest after the cell's position
             has been pushed about by noise, so the borders wander instead
             of running straight - and projects with more pieces reach
             further. Each project's pieces settle in its own region,
             nearest its centre first; its name sits on its land.

  The seed decides everything: the same seed is the same world, so a
  layout can be linked and returned to. Plain code, no DOM - checked by
  scripts/test-world.mjs.
*/

export type WorldMode = 'heights' | 'caves' | 'biomes';

export interface WorldPiece {
  w: number;
  h: number;
  project: string | null;
  /** The project's own tile, which leads its region in the biomes. */
  own?: boolean;
}

export interface WorldOptions {
  cols: number;
  mode: WorldMode;
  seed: number;
  /** Widest a piece may be, in cells. */
  maxSpan?: number;
}

export interface WorldPlaced {
  i: number;
  c: number;
  r: number;
  cw: number;
  ch: number;
}

export interface WorldLabel {
  text: string;
  c: number;
  r: number;
  cw: number;
}

export interface WorldResult {
  placed: WorldPlaced[];
  cols: number;
  rows: number;
  /** Caves: 1 where a cell is carved out, row by row. */
  cave?: Uint8Array;
  /** Biomes: the region of every cell (an index into `regions`), row by row. */
  biome?: Int16Array;
  regions?: string[];
  labels: WorldLabel[];
}

// ---------------------------------------------------------------- noise
function hash2(seed: number, x: number, y: number) {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

/* Smooth noise over the plane, in [-1, 1]. */
export function noise2(seed: number, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(seed, xi, yi);
  const b = hash2(seed, xi + 1, yi);
  const c = hash2(seed, xi, yi + 1);
  const d = hash2(seed, xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/* Layers of noise, coarse to fine, as terrain is made: in [0, 1]. */
function terrain(seed: number, x: number, y: number) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += amp * noise2(seed + o * 101, x * 2 ** o, y * 2 ** o);
    norm += amp;
    amp *= 0.5;
  }
  return Math.min(1, Math.max(0, 0.5 + 0.5 * (sum / norm) * 1.6));
}

/*
  THE HEIGHT MAP'S GROUND, in [0, 1], at a cell - exported so the page can
  draw the map it is reading. Chris: "I don't see the logic working" - the
  first terrain had hills about a third of the page apart, too small and
  too many to tell apart, and it was invisible. Now the hills are broad
  (one or two across the page), and the height is pushed towards its ends
  - wide flat plains, a few distinct peaks - so a mountain of big pieces
  and a plain of small ones read without explanation.
*/
export function heightAt(seed: number, cols: number, c: number, r: number) {
  const f = 1 / Math.max(6, cols * 0.6);
  const h = terrain(seed, c * f, r * f);
  // A smooth step: below 0.35 is plain, above 0.75 is peak.
  const t = Math.min(1, Math.max(0, (h - 0.35) / 0.4));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- the grid
class Grid {
  cols: number;
  rows = 0;
  used: Uint8Array;
  constructor(cols: number, maxRows: number) {
    this.cols = cols;
    this.used = new Uint8Array(cols * maxRows);
  }
  get maxRows() {
    return this.used.length / this.cols;
  }
  fits(c: number, r: number, cw: number, ch: number, ok?: (c: number, r: number) => boolean) {
    if (c < 0 || c + cw > this.cols || r < 0 || r + ch > this.maxRows) return false;
    for (let y = r; y < r + ch; y++)
      for (let x = c; x < c + cw; x++) {
        if (this.used[y * this.cols + x]) return false;
        if (ok && !ok(x, y)) return false;
      }
    return true;
  }
  take(c: number, r: number, cw: number, ch: number) {
    for (let y = r; y < r + ch; y++) for (let x = c; x < c + cw; x++) this.used[y * this.cols + x] = 1;
    this.rows = Math.max(this.rows, r + ch);
  }
}

/* A piece's box at a width in cells: its own shape, at least one cell tall. */
const boxAt = (p: WorldPiece, cw: number) => ({cw, ch: Math.max(1, Math.min(6, Math.round(cw / (p.w / p.h || 1))))});

const order = (n: number, seed: number) =>
  Array.from({length: n}, (_, i) => i).sort((a, b) => hash2(seed, a, 7) - hash2(seed, b, 7));

// ---------------------------------------------------------------- the modes
export function generateWorld(pieces: WorldPiece[], o: WorldOptions): WorldResult {
  const maxSpan = o.maxSpan ?? Math.max(2, Math.round(o.cols / 4));
  const area = pieces.reduce((n, p) => n + boxAt(p, 2).cw * boxAt(p, 2).ch, 0);
  const grid = new Grid(o.cols, Math.max(40, Math.ceil((area * 6) / o.cols) + 40));
  if (o.mode === 'biomes') return biomes(pieces, o, grid, maxSpan);

  const placed: WorldPlaced[] = [];
  const labels: WorldLabel[] = [];
  const freq = 1 / Math.max(5, o.cols / 3);
  let cave: Uint8Array | undefined;
  if (o.mode === 'caves') {
    cave = new Uint8Array(grid.used.length);
    for (let r = 0; r < grid.maxRows; r++)
      for (let c = 0; c < o.cols; c++) {
        const x = c * freq * 1.6;
        const y = r * freq * 1.6;
        /*
          Spaghetti only: both of two fields near zero, so the tunnels
          wind. The first version also opened "cheese" caverns (one coarse
          field over a threshold), and Chris: "the caves don't really make
          sense to me" - big random holes read as gaps, not caves. Thin
          winding tunnels, read against coloured ground (the page draws
          the ground), are the effect.
        */
        const tunnel = Math.abs(noise2(o.seed + 11, x * 0.7, y * 0.7)) < 0.11 && Math.abs(noise2(o.seed + 23, x * 0.7, y * 0.7)) < 0.42;
        // Never the top row, so the page starts on solid ground.
        if (r > 1 && tunnel) cave[r * o.cols + c] = 1;
      }
  }
  const solid = cave ? (c: number, r: number) => !cave![r * o.cols + c] : undefined;

  let cursor = 0;
  for (const i of order(pieces.length, o.seed)) {
    const p = pieces[i];
    for (let at = cursor; at < grid.used.length; at++) {
      const c = at % o.cols;
      const r = Math.floor(at / o.cols);
      if (grid.used[at] || (cave && cave[at])) continue;
      // How big: the terrain under this spot (heights), or a steady size
      // with a little give (caves).
      const h = o.mode === 'heights' ? heightAt(o.seed, o.cols, c, r) : terrain(o.seed, c * freq, r * freq);
      const want =
        o.mode === 'heights' ? 1 + Math.round(h * (maxSpan - 1)) : Math.max(1, Math.round(2 + (h - 0.5) * 2));
      /*
        A piece shrinks by at most one step to fit here; if it still does
        not, it waits for the next free cell instead. Shrinking all the way
        to one cell - as the first version did - put small pieces on the
        peaks and hid the terrain.
      */
      const least = o.mode === 'heights' ? Math.max(1, want - 1) : 1;
      let done = false;
      for (let cw = Math.min(want, o.cols - c); cw >= least && !done; cw--) {
        const {ch} = boxAt(p, cw);
        if (grid.fits(c, r, cw, ch, solid)) {
          grid.take(c, r, cw, ch);
          placed.push({i, c, r, cw, ch});
          done = true;
        }
      }
      if (done) break;
    }
    while (cursor < grid.used.length && (grid.used[cursor] || (cave && cave[cursor]))) cursor++;
  }

  // Caves: the larger ones inside the world carry a project's name - the
  // project of the piece nearest them.
  if (cave) {
    const seen = new Uint8Array(cave.length);
    const blobs: {cells: number[]; minC: number; maxC: number; minR: number; maxR: number}[] = [];
    for (let at = 0; at < o.cols * grid.rows; at++) {
      if (!cave[at] || seen[at]) continue;
      const cells: number[] = [];
      const stack = [at];
      seen[at] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        cells.push(k);
        const c = k % o.cols;
        const r = Math.floor(k / o.cols);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc >= o.cols || nr < 0 || nr >= grid.rows) continue;
          const n = nr * o.cols + nc;
          if (cave[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      const cs = cells.map((k) => k % o.cols);
      const rs = cells.map((k) => Math.floor(k / o.cols));
      blobs.push({cells, minC: Math.min(...cs), maxC: Math.max(...cs), minR: Math.min(...rs), maxR: Math.max(...rs)});
    }
    const named = new Set<string>();
    for (const b of blobs.sort((a, z) => z.cells.length - a.cells.length).slice(0, 8)) {
      // The widest run of carved cells in one row of the cave.
      let best = {r: 0, c: 0, cw: 0};
      for (let r = b.minR; r <= b.maxR; r++) {
        let run = 0;
        for (let c = b.minC; c <= b.maxC + 1; c++) {
          const inCave = c <= b.maxC && cave[r * o.cols + c] === 1 && !grid.used[r * o.cols + c];
          if (inCave) run++;
          else {
            if (run > best.cw) best = {r, c: c - run, cw: run};
            run = 0;
          }
        }
      }
      if (best.cw < 3) continue;
      const near = placed
        .filter((q) => pieces[q.i].project)
        .sort((a, z) => Math.hypot(a.c - best.c, a.r - best.r) - Math.hypot(z.c - best.c, z.r - best.r))[0];
      const text = near ? pieces[near.i].project! : '';
      if (!text || named.has(text)) continue;
      named.add(text);
      labels.push({text, ...best});
    }
  }
  return {placed, cols: o.cols, rows: grid.rows, cave, labels};
}

function biomes(pieces: WorldPiece[], o: WorldOptions, grid: Grid, maxSpan: number): WorldResult {
  const groups = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    const k = p.project ?? `#solo-${i}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  // Pieces with no project share one region, at the edge of things.
  const solo = [...groups.keys()].filter((k) => k.startsWith('#solo-'));
  const regions = [...groups.keys()].filter((k) => !k.startsWith('#solo-'));
  if (solo.length) {
    groups.set('', solo.flatMap((k) => groups.get(k)!));
    regions.push('');
  }
  for (const k of solo) groups.delete(k);

  const span = Math.max(2, Math.min(3, maxSpan));
  const need = pieces.reduce((n, p) => n + boxAt(p, span).cw * boxAt(p, span).ch, 0);
  const rowsEst = Math.max(8, Math.ceil(need / o.cols / 0.55));
  // Region centres on a jittered lattice over the expected world.
  const across = Math.max(1, Math.round(Math.sqrt((regions.length * o.cols) / rowsEst)));
  const down = Math.ceil(regions.length / across);
  const centres = order(regions.length, o.seed).map((k, n) => {
    const gx = n % across;
    const gy = Math.floor(n / across);
    return {
      k,
      c: ((gx + 0.5 + 0.3 * hash2(o.seed, n, 1)) / across) * o.cols,
      r: ((gy + 0.5 + 0.3 * hash2(o.seed, n, 2)) / down) * rowsEst,
      weight: Math.sqrt(groups.get(regions[k])!.length),
    };
  });
  const warp = 3.5;
  const f = 1 / Math.max(4, o.cols / 5);
  const biome = new Int16Array(grid.used.length).fill(-1);
  for (let r = 0; r < grid.maxRows; r++)
    for (let c = 0; c < o.cols; c++) {
      const x = c + warp * noise2(o.seed + 51, c * f, r * f);
      const y = r + warp * noise2(o.seed + 67, c * f, r * f);
      let best = -1;
      let bestD = Infinity;
      for (const s of centres) {
        const d = Math.hypot(x - s.c, y - s.r) / s.weight;
        if (d < bestD) {
          bestD = d;
          best = s.k;
        }
      }
      biome[r * o.cols + c] = best;
    }

  const placed: WorldPlaced[] = [];
  const labels: WorldLabel[] = [];
  for (const s of centres) {
    const name = regions[s.k];
    const members = groups.get(name)!;
    // Its own tile first and largest, then the rest.
    const list = [...members].sort((a, b) => Number(!!pieces[b].own) - Number(!!pieces[a].own));
    const cells: number[] = [];
    for (let at = 0; at < biome.length; at++) if (biome[at] === s.k) cells.push(at);
    const dist = (at: number) => Math.hypot((at % o.cols) - s.c, Math.floor(at / o.cols) - s.r);
    cells.sort((a, b) => dist(a) - dist(b));
    const mine = (c: number, r: number) => biome[r * o.cols + c] === s.k;
    let first: WorldPlaced | null = null;
    for (const i of list) {
      const want = pieces[i].own ? Math.min(maxSpan, span + 1) : span;
      let done = false;
      // In its own region, nearest the centre first; if the region is full,
      // anywhere free, nearest the centre.
      for (const strict of [true, false]) {
        const pool = strict ? cells : [...Array(biome.length).keys()].sort((a, b) => dist(a) - dist(b));
        for (const at of pool) {
          const c = at % o.cols;
          const r = Math.floor(at / o.cols);
          for (let cw = want; cw >= 1 && !done; cw--) {
            const {ch} = boxAt(pieces[i], cw);
            if (grid.fits(c, r, cw, ch, strict ? mine : undefined)) {
              grid.take(c, r, cw, ch);
              const q = {i, c, r, cw, ch};
              placed.push(q);
              first ??= q;
              done = true;
            }
          }
          if (done) break;
        }
        if (done) break;
      }
    }
    // The name on its land: the nearest free run of three cells to its centre.
    if (name && first) {
      for (const at of cells) {
        const c = at % o.cols;
        const r = Math.floor(at / o.cols);
        if (grid.fits(c, r, 3, 1, mine)) {
          grid.take(c, r, 3, 1);
          labels.push({text: name, c, r, cw: 3});
          break;
        }
      }
    }
  }
  return {placed, cols: o.cols, rows: grid.rows, biome, regions, labels};
}
