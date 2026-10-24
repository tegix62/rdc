/*
  A WORLD OF WORK - the portfolio laid out the way Minecraft generates its
  world. Preview only (see /next/world/home).

  Chris: "I'd love to see your Biomes, Caves, or Height map ideas played
  out." Then, having seen them: "original Height Map and Biome were the
  exceptional ones. Let's shelve Height Map v2 and Caves", and "if this
  could operate like the main grid now, with full functionality of
  expansion", "on Biome ... stuff that's parented to a grid item to hug
  it, even though they don't have a case study ... the collages and their
  corresponding closeup pieces", "get rid of all that massive distance and
  only leave small noticeable gaps between Biomes".

  On a grid of square cells across the page:

    HEIGHTS  A smooth noise field over the page is the terrain; a piece is
             drawn as large as the ground is high where it lands (the
             original version - small, frequent hills, a piece shrinking
             as far as it must to fit).
    BIOMES   One biome per set: a project with its pieces, or, with no
             project, a piece with the pieces parented to it (a collage and
             its close-ups). Each biome is laid out as its own compact
             block - its lead first, every piece followed straight away by
             the pieces parented to it, so they land beside it - and the
             blocks are packed against each other, largest first, one cell
             apart: a small, noticeable gap and no empty land.
    LANDS    The two together (Chris: "the height map and the biome idea
             should just be combined ... projects are really grouped
             together very closely, and then things that aren't a case
             study are still in their own territories, but everything's
             still touching. And it has that radical size difference",
             "more complex imagery takes up the larger spots"; then, of a
             first go with tinted territories: "too clunky - think like how
             tight Height Map is, but we're grouping things together").
             Then: "I'm not seeing the projects that are together actually
             being in their adjacent clusters. It looks like everything's
             scattered." So each set with more than one piece is laid out
             as one compact block (as in the biomes: every piece hugging
             the one it is parented to), and the blocks and the loose
             pieces flow down the page the way the height map does - a
             block at the first spot it fits whole, a loose piece in the
             first free cell, shrinking to fit, so the loose ones fill the
             holes between blocks. No gaps, no tint, no names. A piece is
             as large as it is detailed (`detail`, from the page), lifted
             or lowered by the ground: a few huge, most small. Opened, the
             set's block is rebuilt round the opened piece with room for
             the project's card beside it (`card`).

  COLOUR (heights and lands): `sort: 'colour'` lays pieces - in lands, whole
  territories - by `tone` instead: black and white first, then round the
  colour wheel.

  OPENING (both modes), as on the main grid: `focus` names a piece. It is
  drawn large, its set packed tight around it, at about where it was; the
  rest of the world flows on as before.

  Shelved, kept for reference and not offered on the page: 'heights2'
  (broad mountains, wide plains - "makes more sense", but the first was
  "more visually pleasing") and 'caves' (spaghetti tunnels - "isn't making
  sense yet").

  The seed decides everything: the same seed is the same world. Plain code,
  no DOM - checked by scripts/test-world.mjs.
*/

export type WorldMode = 'heights' | 'biomes' | 'lands' | 'heights2' | 'caves';

export interface WorldPiece {
  w: number;
  h: number;
  project: string | null;
  /** The project's own tile, which leads its set. */
  own?: boolean;
  /** This piece's id, and the piece it is parented to (a grid item), if any. */
  id?: string;
  parent?: string | null;
  /** How detailed the picture is, 0 (plainest) to 1 (busiest) - for lands. */
  detail?: number;
  /** Its colour as a sort key: below 1 black and white (by lightness), 1-2 round the hue wheel. */
  tone?: number;
  /** A fixed height in cells, whatever its width (the project's card). */
  rows?: number;
  /**
    How much ground it may take, 0-1 (1 if unset): less for a piece that
    supports another - a close-up, an alternate shot. Chris: "I feel like
    less important tiles are getting more area".
  */
  weight?: number;
  /** A piece that should stand out - a case study, a hero tile: never small. */
  big?: boolean;
}

export interface WorldOptions {
  cols: number;
  mode: WorldMode;
  seed: number;
  /** Widest a piece may be, in cells. */
  maxSpan?: number;
  /** The opened piece. */
  focus?: number | null;
  /** The row it was on when opened, so its set opens about there. */
  focusRow?: number;
  /** Lay pieces by colour (`tone`) rather than the seed's order. */
  sort?: 'seed' | 'colour';
  /** Lands: room for the opened project's card, beside the opened piece. */
  card?: {cw: number; ch: number} | null;
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
  /** The set's key: a project's address, or "#set-<id>" for a piece and its children. */
  set: string;
  c: number;
  r: number;
  cw: number;
}

export interface WorldResult {
  placed: WorldPlaced[];
  cols: number;
  rows: number;
  /** Caves (shelved): 1 where a cell is carved out, row by row. */
  cave?: Uint8Array;
  /** Biomes: each cell's biome, an index into `regions`, or -1; row by row. */
  biome?: Int16Array;
  regions?: string[];
  labels: WorldLabel[];
  /** The opened piece's set, as piece indexes. */
  family: number[];
  /** Lands: where the opened project's card goes. */
  card?: WorldPlaced;
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

/* The original height map's ground, in [0, 1]. */
export function groundAt(seed: number, cols: number, c: number, r: number) {
  const f = 1 / Math.max(5, cols / 3);
  return terrain(seed, c * f, r * f);
}

/* Shelved v2's ground: broad mountains, wide plains (a smooth step). */
export function heightAt(seed: number, cols: number, c: number, r: number) {
  const f = 1 / Math.max(6, cols * 0.6);
  const t = Math.min(1, Math.max(0, (terrain(seed, c * f, r * f) - 0.35) / 0.4));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- the grid
class Grid {
  cols: number;
  rows = 0;
  used: Int16Array;
  constructor(cols: number, maxRows: number) {
    this.cols = cols;
    this.used = new Int16Array(cols * maxRows).fill(-1);
  }
  get maxRows() {
    return this.used.length / this.cols;
  }
  fits(c: number, r: number, cw: number, ch: number, ok?: (c: number, r: number) => boolean) {
    if (c < 0 || c + cw > this.cols || r < 0 || r + ch > this.maxRows) return false;
    for (let y = r; y < r + ch; y++)
      for (let x = c; x < c + cw; x++) {
        if (this.used[y * this.cols + x] !== -1) return false;
        if (ok && !ok(x, y)) return false;
      }
    return true;
  }
  take(c: number, r: number, cw: number, ch: number, owner = 0) {
    for (let y = r; y < r + ch; y++) for (let x = c; x < c + cw; x++) this.used[y * this.cols + x] = owner;
    this.rows = Math.max(this.rows, r + ch);
  }
}

/* A piece's box at a width in cells: its own shape, at least one cell tall. */
const boxAt = (p: WorldPiece, cw: number) => ({cw, ch: p.rows ?? Math.max(1, Math.min(8, Math.round(cw / (p.w / p.h || 1))))});

/*
  How wide a piece wants to be where it lands, on the height map and the
  lands: as high as the ground there, scaled by its weight; a big piece at
  least two thirds of the widest.
*/
const wantAt = (p: WorldPiece, seed: number, cols: number, maxSpan: number, c: number, r: number) => {
  const want = 1 + Math.round(groundAt(seed, cols, c, r) ** 1.6 * (maxSpan - 1) * (p.weight ?? 1));
  return p.big ? Math.max(want, Math.ceil((maxSpan * 2) / 3)) : want;
};

const order = (n: number, seed: number) =>
  Array.from({length: n}, (_, i) => i).sort((a, b) => hash2(seed, a, 7) - hash2(seed, b, 7));

// ---------------------------------------------------------------- sets
/*
  Which set each piece belongs to: its project; else, with no project, the
  piece it is parented to (or itself, if pieces are parented to it) - so a
  collage and its close-ups are one set; else a set of its own.
*/
export function setsOf(pieces: WorldPiece[]) {
  const byId = new Map(pieces.map((p, i) => [p.id ?? `#${i}`, i]));
  const root = (i: number) => {
    let k = i;
    for (let n = 0; n < 6; n++) {
      const up = pieces[k].parent;
      const j = up ? byId.get(up) : undefined;
      if (j === undefined) break;
      k = j;
    }
    return k;
  };
  const roots = pieces.map((_, i) => root(i));
  const count = new Map<number, number>();
  for (const r of roots) count.set(r, (count.get(r) ?? 0) + 1);
  return pieces.map((p, i) =>
    p.project ? p.project : (count.get(roots[i]) ?? 0) > 1 ? `#set-${pieces[roots[i]].id ?? roots[i]}` : `#solo-${i}`,
  );
}

/*
  A set's pieces in the order they are laid: the lead (the opened piece,
  else the project's own tile, else the root), then every piece followed
  straight away by the pieces parented to it, so they land beside it.
*/
function laidOrder(pieces: WorldPiece[], members: number[], lead: number | null) {
  const inSet = new Set(members);
  const kids = new Map<string, number[]>();
  for (const i of members) {
    const up = pieces[i].parent;
    if (up) kids.set(up, [...(kids.get(up) ?? []), i]);
  }
  const first =
    lead !== null && inSet.has(lead)
      ? lead
      : (members.find((i) => pieces[i].own) ??
        members.find((i) => !pieces[i].parent || !members.some((j) => pieces[j].id === pieces[i].parent)) ??
        members[0]);
  const out: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number) => {
    if (seen.has(i)) return;
    seen.add(i);
    out.push(i);
    for (const k of kids.get(pieces[i].id ?? '') ?? []) visit(k);
  };
  visit(first);
  // Then each top-level piece of the set (its parent is not in the set),
  // with its children after it; then anything left.
  const ids = new Set(members.map((i) => pieces[i].id));
  for (const i of members) if (!pieces[i].parent || !ids.has(pieces[i].parent)) visit(i);
  for (const i of members) visit(i);
  return out;
}

/*
  One set as a compact block, in a grid as wide as makes it about square
  (wider for the opened piece). The lead takes the top left; every other
  piece takes the free spot nearest the piece it is parented to - the lead,
  when it has no parent in the set - so a close-up lands against its
  collage rather than wherever reading order next has room. Ties go to the
  higher, then the further-left spot, which keeps the block compact.
*/
function block(pieces: WorldPiece[], list: number[], spanOf: (i: number) => number, width: number) {
  const g = new Grid(width, Math.max(8, list.length * 10));
  const placed: WorldPlaced[] = [];
  const where = new Map<string, WorldPlaced>();
  for (const i of list) {
    const want = Math.min(width, spanOf(i));
    const anchor = (pieces[i].parent && where.get(pieces[i].parent!)) || placed[0] || null;
    let best: WorldPlaced | null = null;
    let bestScore = Infinity;
    const limit = Math.min(g.maxRows, (g.rows || 0) + 12);
    for (let cw = want; cw >= 1 && !best; cw--) {
      const {ch} = boxAt(pieces[i], cw);
      for (let r = 0; r < limit; r++)
        for (let c = 0; c + cw <= width; c++) {
          if (!g.fits(c, r, cw, ch)) continue;
          const gapTo = anchor
            ? Math.max(0, Math.max(c - (anchor.c + anchor.cw), anchor.c - (c + cw))) +
              Math.max(0, Math.max(r - (anchor.r + anchor.ch), anchor.r - (r + ch)))
            : 0;
          const score = gapTo * 1000 + Math.max(0, r + ch - g.rows) * 40 + r * 2 + c * 0.1;
          if (score < bestScore) {
            bestScore = score;
            best = {i, c, r, cw, ch};
          }
        }
      // Settle for a smaller size only when the full one has no spot touching.
      if (best && bestScore >= 1000 && cw > 1) best = null;
    }
    if (!best) {
      // Never expected: the first free spot, at the smallest size.
      const {ch} = boxAt(pieces[i], 1);
      for (let r = 0; r < g.maxRows && !best; r++) for (let c = 0; c < width && !best; c++) if (g.fits(c, r, 1, ch)) best = {i, c, r, cw: 1, ch};
    }
    g.take(best!.c, best!.r, best!.cw, best!.ch);
    placed.push(best!);
    if (pieces[i].id) where.set(pieces[i].id!, best!);
  }
  return {placed, rows: g.rows, width};
}

const blockWidth = (pieces: WorldPiece[], list: number[], spanOf: (i: number) => number, cols: number) => {
  const cells = list.reduce((n, i) => n + boxAt(pieces[i], spanOf(i)).cw * boxAt(pieces[i], spanOf(i)).ch, 0);
  const widest = Math.max(...list.map(spanOf));
  return Math.min(cols, Math.max(widest, Math.ceil(Math.sqrt(cells * 1.25))));
};

// ---------------------------------------------------------------- the modes
export function generateWorld(pieces: WorldPiece[], o: WorldOptions): WorldResult {
  const maxSpan = o.maxSpan ?? Math.max(2, Math.round(o.cols / 4));
  const sets = setsOf(pieces);
  const focus = o.focus ?? null;
  const family = focus === null ? [] : pieces.map((_, i) => i).filter((i) => sets[i] === sets[focus]);
  if (o.mode === 'biomes') return biomes(pieces, o, maxSpan, sets, focus, family);
  if (o.mode === 'lands') return lands(pieces, o, maxSpan, sets, focus, family);
  return flow(pieces, o, maxSpan, sets, focus, family);
}

/*
  The portfolio grid's dealt hand (lib/gridOrder.ts), Chris: "Make case
  studies the first to appear, just like the 'dealt hand' system we have on
  the portfolio grid". The case studies first, in the seed's order; then the
  rest dealt a card at a time from each set in turn, so no set runs on.
*/
function dealt(pieces: WorldPiece[], sets: string[], seed: number) {
  const ids = order(pieces.length, seed);
  const lead = ids.filter((i) => pieces[i].own);
  const hands = new Map<string, number[]>();
  for (const i of ids) if (!pieces[i].own) hands.set(sets[i], [...(hands.get(sets[i]) ?? []), i]);
  const out = [...lead];
  for (let round = 0, more = true; more; round++) {
    more = false;
    for (const hand of hands.values())
      if (round < hand.length) {
        out.push(hand[round]);
        more = true;
      }
  }
  return out;
}

/* Heights (and the shelved heights2 and caves): pieces flow in reading order. */
function flow(pieces: WorldPiece[], o: WorldOptions, maxSpan: number, sets: string[], focus: number | null, family: number[]): WorldResult {
  const area = pieces.reduce((n, p) => n + boxAt(p, 2).cw * boxAt(p, 2).ch, 0);
  const grid = new Grid(o.cols, Math.max(60, Math.ceil((area * 8) / o.cols) + 60));
  const placed: WorldPlaced[] = [];
  const labels: WorldLabel[] = [];
  const freq = 1 / Math.max(5, o.cols / 3);

  let cave: Uint8Array | undefined;
  if (o.mode === 'caves') {
    cave = new Uint8Array(grid.used.length);
    for (let r = 0; r < grid.maxRows; r++)
      for (let c = 0; c < o.cols; c++) {
        const x = c * freq * 1.6 * 0.7;
        const y = r * freq * 1.6 * 0.7;
        const tunnel = Math.abs(noise2(o.seed + 11, x, y)) < 0.11 && Math.abs(noise2(o.seed + 23, x, y)) < 0.42;
        if (r > 1 && tunnel) cave[r * o.cols + c] = 1;
      }
  }
  const solid = cave ? (c: number, r: number) => !cave![r * o.cols + c] : undefined;

  // The opened piece's set first, as a block, at about the row it was on.
  if (focus !== null) {
    const list = laidOrder(pieces, family, focus);
    const spanOf = (i: number) => (i === focus ? Math.min(o.cols, maxSpan + Math.ceil(maxSpan / 2)) : Math.max(2, Math.round(maxSpan / 2)));
    const b = block(pieces, list, spanOf, blockWidth(pieces, list, spanOf, o.cols));
    const at = Math.max(0, o.focusRow ?? 0);
    const left = Math.max(0, Math.floor((o.cols - b.width) / 2));
    for (let r = at; r < grid.maxRows; r++) {
      if (b.placed.every((q) => grid.fits(left + q.c, r + q.r, q.cw, q.ch, solid))) {
        for (const q of b.placed) {
          grid.take(left + q.c, r + q.r, q.cw, q.ch);
          placed.push({...q, c: left + q.c, r: r + q.r});
        }
        break;
      }
    }
  }

  const inFamily = new Set(family);
  let cursor = 0;
  const laid = dealt(pieces, sets, o.seed);
  if (o.sort === 'colour') laid.sort((a, b) => (pieces[a].tone ?? 1.5) - (pieces[b].tone ?? 1.5));
  for (const i of laid) {
    if (inFamily.has(i)) continue;
    const p = pieces[i];
    for (let at = cursor; at < grid.used.length; at++) {
      const c = at % o.cols;
      const r = Math.floor(at / o.cols);
      if (grid.used[at] !== -1 || (cave && cave[at])) continue;
      let want: number;
      let least = 1;
      if (o.mode === 'heights2') {
        want = 1 + Math.round(heightAt(o.seed, o.cols, c, r) * (maxSpan - 1));
        least = Math.max(1, want - 1);
      } else if (o.mode === 'heights') {
        want = wantAt(p, o.seed, o.cols, maxSpan, c, r);
      } else {
        want = Math.max(1, Math.round(2 + (terrain(o.seed, c * freq, r * freq) - 0.5) * 2));
      }
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
    while (cursor < grid.used.length && (grid.used[cursor] !== -1 || (cave && cave[cursor]))) cursor++;
  }
  return {placed, cols: o.cols, rows: grid.rows, cave, labels, family};
}

/* Biomes: each set a compact block, the blocks packed one cell apart. */
function biomes(pieces: WorldPiece[], o: WorldOptions, maxSpan: number, sets: string[], focus: number | null, family: number[]): WorldResult {
  const groups = new Map<string, number[]>();
  sets.forEach((k, i) => groups.set(k, [...(groups.get(k) ?? []), i]));
  const regions = [...groups.keys()];
  const own = Math.min(maxSpan, Math.max(2, Math.round(maxSpan * 0.6)));
  const rest = Math.max(2, Math.round(maxSpan * 0.4));
  const opened = Math.min(o.cols, maxSpan + Math.ceil(maxSpan / 2));

  /*
    Each set laid out as a block - at a few widths, since which fits the
    room left beside the blocks already placed is only known when placing -
    with a row on top for its name, as wide as its pieces, when it has more
    than one.
  */
  const blocks = regions.map((key, region) => {
    const members = groups.get(key)!;
    const isFocus = focus !== null && sets[focus] === key;
    const list = laidOrder(pieces, members, isFocus ? focus : null);
    const spanOf = (i: number) =>
      isFocus ? (i === focus ? opened : rest) : i === list[0] && members.length > 1 ? own : rest;
    const base = blockWidth(pieces, list, spanOf, o.cols);
    const widest = Math.max(...list.map((i) => Math.min(o.cols, spanOf(i))));
    const widths = [...new Set([base, base - 2, base + 2, base + 5, o.cols].map((w) => Math.min(o.cols, Math.max(widest, w))))];
    const named = members.length > 1;
    const shapes = widths.map((w) => {
      const b = block(pieces, list, spanOf, w);
      const used = Math.max(...b.placed.map((q) => q.c + q.cw));
      const top = named ? 1 : 0;
      const cells: [number, number][] = b.placed.flatMap((q) => {
        const out: [number, number][] = [];
        for (let y = q.r; y < q.r + q.ch; y++) for (let x = q.c; x < q.c + q.cw; x++) out.push([x, y + top]);
        return out;
      });
      if (named) for (let x = 0; x < used; x++) cells.push([x, 0]);
      return {b, cells, used, top, height: b.rows + top};
    });
    const cellCount = shapes[0].b.placed.reduce((n, q) => n + q.cw * q.ch, 0);
    return {key, region, members, named, shapes, cells: cellCount};
  });

  // Largest first, so the small ones fill in round them; the seed shuffles
  // sets of about the same size.
  const shuffle = order(blocks.length, o.seed);
  const rank = new Map(shuffle.map((k, n) => [k, n]));
  const sized = [...blocks].sort((a, z) => {
    const ba = Math.round(Math.log2(a.cells + 1));
    const bz = Math.round(Math.log2(z.cells + 1));
    return bz - ba || rank.get(a.region)! - rank.get(z.region)!;
  });
  // The opened set first of all, so it opens at the top.
  if (focus !== null) sized.sort((a, z) => Number(z.key === sets[focus]) - Number(a.key === sets[focus]));

  const total = blocks.reduce((n, b) => n + b.cells, 0);
  const grid = new Grid(o.cols, Math.max(60, Math.ceil((total * 4) / o.cols) + 60));
  const biome = new Int16Array(grid.used.length).fill(-1);
  const placed: WorldPlaced[] = [];
  const labels: WorldLabel[] = [];
  // The first row with room, so each search starts there, not at the top.
  let from = 0;

  for (const s of sized) {
    // A cell of this block, and every cell round it, may not belong to
    // another set - that is the one-cell gap between biomes.
    const clear = (cells: [number, number][], c: number, r: number) =>
      cells.every(([x, y]) => {
        const cx = c + x;
        const cy = r + y;
        if (cx < 0 || cx >= o.cols || cy >= grid.maxRows) return false;
        if (grid.used[cy * o.cols + cx] !== -1) return false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= o.cols || ny < 0 || ny >= grid.maxRows) continue;
            const owner = grid.used[ny * o.cols + nx];
            if (owner !== -1 && owner !== s.region) return false;
          }
        return true;
      });
    // Each width's first spot; keep the one whose bottom is highest.
    let best: {shape: (typeof s.shapes)[number]; c: number; r: number} | null = null;
    for (const shape of s.shapes) {
      for (let at = from * o.cols; at < grid.used.length; at++) {
        const c = at % o.cols;
        const r = Math.floor(at / o.cols);
        if (best && r + shape.height >= best.r + best.shape.height) break;
        if (c + shape.used > o.cols || grid.used[at] !== -1) continue;
        if (!clear(shape.cells, c, r)) continue;
        best = {shape, c, r};
        break;
      }
    }
    if (!best) continue;
    const {shape, c, r} = best;
    for (const [x, y] of shape.cells) {
      grid.used[(r + y) * o.cols + c + x] = s.region;
      biome[(r + y) * o.cols + c + x] = s.region;
    }
    grid.rows = Math.max(grid.rows, r + shape.height);
    for (const q of shape.b.placed) placed.push({...q, c: c + q.c, r: r + shape.top + q.r});
    if (s.named) labels.push({text: s.key, set: s.key, c, r, cw: shape.used});
    while (from < grid.maxRows && [...grid.used.subarray(from * o.cols, (from + 1) * o.cols)].every((v) => v !== -1)) from++;
  }
  return {placed, cols: o.cols, rows: grid.rows, biome, regions, labels, family};
}

/*
  Lands: the height map, grouped. The same ground, the same sizes, the same
  fill - every piece at the first free cell, as large as the ground there
  and shrinking to fit - but the cells are visited a square patch at a
  time (snaking along each row of patches) rather than a whole page-width
  row at a time, and the pieces come a set at a time. Pieces laid one after
  another fill the same patch, so a project lands together; the page fills
  as tightly as the height map does.

  Opened, the set is laid as a block round the opened piece, with room for
  the project's card beside it, at about the row it was on; the rest flows
  round it as before.
*/
function lands(pieces: WorldPiece[], o: WorldOptions, maxSpan: number, sets: string[], focus: number | null, family: number[]): WorldResult {
  const groups = new Map<string, number[]>();
  sets.forEach((k, i) => groups.set(k, [...(groups.get(k) ?? []), i]));
  const keys = [...groups.keys()];
  const rank = new Map(order(keys.length, o.seed).map((k, n) => [keys[k], n]));
  const toneOf = (k: string) => {
    const t = groups.get(k)!.map((i) => pieces[i].tone ?? 1.5).sort((a, z) => a - z);
    return t[Math.floor(t.length / 2)];
  };
  // As the portfolio grid deals: the case studies' sets first (Chris: "Make
  // case studies the first to appear"); by colour, colour decides instead.
  const study = (k: string) => (groups.get(k)!.some((i) => pieces[i].own) ? 0 : 1);
  keys.sort((a, z) => (o.sort === 'colour' ? toneOf(a) - toneOf(z) : study(a) - study(z)) || rank.get(a)! - rank.get(z)!);
  const laid = keys.flatMap((k) => laidOrder(pieces, groups.get(k)!, null));

  const area = pieces.reduce((n, p) => n + boxAt(p, 2).cw * boxAt(p, 2).ch, 0);
  const grid = new Grid(o.cols, Math.max(60, Math.ceil((area * 8) / o.cols) + 60));
  const placed: WorldPlaced[] = [];
  let card: WorldPlaced | undefined;

  // The cells in patch order: square patches about a quarter of the page
  // wide, each read left to right, top to bottom; the patches along a row
  // of patches snaking left and right so the next patch is always beside
  // the last.
  const side = Math.max(3, Math.round(o.cols / 4));
  const across = Math.ceil(o.cols / side);
  const cells: number[] = [];
  for (let band = 0; band * side < grid.maxRows; band++)
    for (let k = 0; k < across; k++) {
      const pc = band % 2 === 0 ? k : across - 1 - k;
      for (let r = band * side; r < Math.min(grid.maxRows, (band + 1) * side); r++)
        for (let c = pc * side; c < Math.min(o.cols, (pc + 1) * side); c++) cells.push(r * o.cols + c);
    }

  // The opened set first, as a block with the card, at about the row it was on.
  if (focus !== null) {
    const CARD = pieces.length;
    const all: WorldPiece[] = [...pieces];
    if (o.card) all.push({w: o.card.cw, h: o.card.ch, rows: o.card.ch, project: pieces[focus].project, id: '#card', parent: pieces[focus].id ?? null});
    const list = laidOrder(all, all.length > pieces.length ? [...family, CARD] : family, focus);
    const opened = Math.min(o.cols, maxSpan + Math.ceil(maxSpan / 2));
    const spanOf = (i: number) => (i === CARD ? Math.min(o.cols, all[CARD].w) : i === focus ? opened : Math.max(2, Math.round(maxSpan / 2)));
    const b = block(all, list, spanOf, blockWidth(all, list, spanOf, o.cols));
    const left = Math.max(0, Math.floor((o.cols - b.width) / 2));
    for (let r = Math.max(0, o.focusRow ?? 0); r < grid.maxRows; r++) {
      if (!b.placed.every((q) => grid.fits(left + q.c, r + q.r, q.cw, q.ch))) continue;
      for (const q of b.placed) {
        grid.take(left + q.c, r + q.r, q.cw, q.ch);
        if (q.i === CARD) card = {...q, c: left + q.c, r: r + q.r};
        else placed.push({...q, c: left + q.c, r: r + q.r});
      }
      break;
    }
  }

  /*
    Each piece takes, of the next few free cells in patch order, the first
    where it touches a piece of its own set (the piece it is parented to
    first) - so a set never comes apart round a hole another set left. A
    set's first piece takes the very first free cell, which is what keeps
    the holes filled.
  */
  const inFamily = new Set(family);
  const mine = new Map<string, WorldPlaced[]>();
  const whereId = new Map<string, WorldPlaced>();
  const touches = (a: WorldPlaced, b: WorldPlaced) => a.c <= b.c + b.cw && b.c <= a.c + a.cw && a.r <= b.r + b.ch && b.r <= a.r + a.ch;
  let cursor = 0;
  for (const i of laid) {
    if (inFamily.has(i)) continue;
    const p = pieces[i];
    const kin = mine.get(sets[i]) ?? [];
    const up = p.parent ? whereId.get(p.parent) : undefined;
    let first: WorldPlaced | null = null;
    let best: WorldPlaced | null = null;
    let bestScore = Infinity;
    let seen = 0;
    for (let k = cursor; k < cells.length && (seen < 48 || (kin.length > 0 && !best)); k++) {
      const at = cells[k];
      if (grid.used[at] !== -1) continue;
      seen++;
      const c = at % o.cols;
      const r = Math.floor(at / o.cols);
      const want = wantAt(p, o.seed, o.cols, maxSpan, c, r);
      for (let cw = Math.min(want, o.cols - c); cw >= 1; cw--) {
        const {ch} = boxAt(p, cw);
        if (!grid.fits(c, r, cw, ch)) continue;
        const q = {i, c, r, cw, ch};
        first ??= q;
        if (kin.length === 0) break;
        // Beside its parent best, then beside any of its set; earlier cells first.
        const score = (up && touches(q, up) ? 0 : kin.some((x) => touches(q, x)) ? 100 : Infinity) + seen;
        if (score < bestScore) {
          bestScore = score;
          best = q;
        }
        break;
      }
      if (kin.length === 0 && first) break;
    }
    const q = best ?? first;
    if (!q) continue;
    grid.take(q.c, q.r, q.cw, q.ch);
    placed.push(q);
    mine.set(sets[i], [...kin, q]);
    if (p.id) whereId.set(p.id, q);
    while (cursor < cells.length && grid.used[cells[cursor]] !== -1) cursor++;
  }
  return {placed, cols: o.cols, rows: grid.rows, labels: [], family, card};
}
