/*
  A CENTRAL CLUSTER - pieces packed into one shape in the middle of the page.

  Chris: "I do even kind of like the idea of using clusters, that is, things
  that aren't even justified left or right or center ... but instead some
  kind of central cluster."

  The portfolio gathers into justified rows: every row runs the full width,
  so a narrow piece in a short row has to be blown up or left with a hole -
  that is where the gather's clunkiness comes from. A cluster does not fill
  the width. Its rows are centred and follow a lens: widest through the
  middle, narrower above and below, ragged on both sides on purpose. The
  first piece given sits in the middle of the middle row, the next ones
  beside it, and the rest further out - so the order of the list is the
  order of importance, centre first.

  Every row is one height; outer rows are a little smaller than the middle
  one, so the shape reads as gathering towards its centre. The lead piece
  can be drawn larger than its row (`lead`): the row grows to hold it and
  its neighbours sit centred beside it.

  Plain code with no DOM, so scripts/test-cluster-layout.mjs can check it in
  Node: no overlaps, nothing outside the width, the shape centred, the first
  piece in the middle.
*/

export interface ClusterPiece {
  /** The picture's own width and height; only their ratio is used. */
  w: number;
  h: number;
}

export interface ClusterOptions {
  /** The widest the cluster may be, in px. */
  width: number;
  /** The tallest it should be; it grows past this only when it must. */
  maxHeight: number;
  gap: number;
  /** The smallest the middle row may get before the cluster is allowed to grow taller. */
  minRow: number;
  /** The largest the middle row may get. */
  maxRow: number;
  /** How much larger than its row the first piece is drawn. 1 = not at all. */
  lead?: number;
}

export interface ClusterPlaced {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
}

export interface ClusterLayout {
  placed: ClusterPlaced[];
  width: number;
  height: number;
  rows: number;
  /** The middle row's height, which sets the size of everything. */
  base: number;
}

/* How much smaller the outermost rows are than the middle one. */
const SHRINK = 0.3;

/* Each row's share of the full width: an ellipse through the rows. */
const reach = (d: number) => Math.sqrt(Math.max(0, 1 - d * d));

interface Row {
  h: number;
  cap: number;
  used: number;
  items: {i: number; w: number; h: number}[];
}

function fill(pieces: ClusterPiece[], o: ClusterOptions, base: number, count: number): Row[] | null {
  const mid = (count - 1) / 2;
  const rows: Row[] = [];
  for (let r = 0; r < count; r++) {
    const d = count === 1 ? 0 : Math.abs(r - mid) / (mid + 0.75);
    rows.push({h: base * (1 - SHRINK * d), cap: o.width * reach(d), used: 0, items: []});
  }
  // The middle row first, then outwards, alternating above and below.
  const order = [Math.floor(mid)];
  for (let k = 1; order.length < count; k++) {
    if (Math.floor(mid) - k >= 0) order.push(Math.floor(mid) - k);
    if (Math.floor(mid) + k < count) order.push(Math.floor(mid) + k);
  }
  for (let i = 0; i < pieces.length; i++) {
    const ratio = pieces[i].w / pieces[i].h || 1;
    const scale = i === 0 ? (o.lead ?? 1) : 1;
    let placed = false;
    for (const r of order) {
      const row = rows[r];
      let h = row.h * scale;
      let w = ratio * h;
      // A piece too wide for even an empty row is drawn to the row's width.
      if (!row.items.length && w > row.cap) {
        w = row.cap;
        h = w / ratio;
      }
      const need = w + (row.items.length ? o.gap : 0);
      if (row.used + need <= row.cap + 0.5) {
        row.items.push({i, w, h});
        row.used += need;
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }
  return rows;
}

/*
  Whether the shape keeps its middle: as many filled rows above the middle
  row as below it. Otherwise an empty outer row is dropped, the count goes
  even, and the first piece ends up above or below the centre of the shape.
*/
const balanced = (rows: Row[]) => {
  const m = Math.floor((rows.length - 1) / 2);
  const filled = (from: number, to: number) => rows.slice(from, to).filter((r) => r.items.length).length;
  return filled(0, m) === filled(m + 1, rows.length);
};

/*
  Wider rows nearer the middle. Filling goes centre-out piece by piece, so a
  row can end up wider than the one inside it (one wide wordmark alone, then
  two smaller pieces together further out). The middle row - which holds the
  first piece - stays put; the others are dealt back out widest first, each
  redrawn at its new row's height, and kept only if every one still fits.
*/
function widestInward(rows: Row[], o: ClusterOptions, lead: number) {
  const m = Math.floor((rows.length - 1) / 2);
  const slots: number[] = [];
  for (let k = 1; slots.length < rows.length - 1; k++) {
    if (m - k >= 0) slots.push(m - k);
    if (m + k < rows.length) slots.push(m + k);
  }
  const sets = slots.map((r) => rows[r]).filter((r) => r.items.length).sort((a, b) => b.used - a.used);
  if (sets.length < 2) return rows;
  const next = rows.map((r, k) => (k === m ? r : {...r, used: 0, items: [] as Row['items']}));
  for (let s = 0; s < sets.length; s++) {
    const to = next[slots[s]];
    let used = 0;
    const items = sets[s].items.map((it) => {
      const ratio = it.w / it.h;
      let h = to.h * (it.i === 0 ? lead : 1);
      let w = ratio * h;
      if (w > to.cap) {
        w = to.cap;
        h = w / ratio;
      }
      used += w;
      return {i: it.i, w, h};
    });
    used += o.gap * (items.length - 1);
    if (used > to.cap + 0.5) return rows;
    to.items = items;
    to.used = used;
  }
  return next;
}

function place(all: Row[], o: ClusterOptions, base: number): ClusterLayout {
  const rows = widestInward(all, o, o.lead ?? 1).filter((r) => r.items.length);
  const placed: ClusterPlaced[] = [];
  let y = 0;
  rows.forEach((row, r) => {
    const rowH = Math.max(...row.items.map((it) => it.h));
    // The row's first piece in the middle, the next to its right, the next
    // to its left, and so on outwards.
    const seq: typeof row.items = [];
    row.items.forEach((it, k) => (k % 2 ? seq.push(it) : seq.unshift(it)));
    let x = (o.width - row.used) / 2;
    for (const it of seq) {
      placed.push({i: it.i, x, y: y + (rowH - it.h) / 2, w: it.w, h: it.h, row: r});
      x += it.w + o.gap;
    }
    y += rowH + o.gap;
  });
  placed.sort((a, b) => a.i - b.i);
  return {placed, width: o.width, height: Math.max(0, y - o.gap), rows: rows.length, base};
}

/*
  The largest middle row that fits the pieces into maxHeight with the shape
  balanced. Tried from large to small; at each size the fewest rows that
  hold every piece (an odd number, so there is a middle row). Sizes 5% apart
  fall differently into rows, so a balanced one is nearly always close by;
  failing that, the largest that fits at all; failing that, minRow, growing
  as tall as it needs to.
*/
export function layoutCluster(pieces: ClusterPiece[], o: ClusterOptions): ClusterLayout {
  if (!pieces.length) return {placed: [], width: o.width, height: 0, rows: 0, base: o.maxRow};
  const fewest = (base: number) => {
    for (let count = 1; count <= 61; count += 2) {
      const rows = fill(pieces, o, base, count);
      if (rows) return rows;
    }
    return null;
  };
  let fallback: ClusterLayout | null = null;
  for (let base = o.maxRow; base >= o.minRow; base *= 0.95) {
    const rows = fewest(base);
    if (!rows) continue;
    const out = place(rows, o, base);
    if (out.height > o.maxHeight) continue;
    if (balanced(rows)) return out;
    fallback ??= out;
  }
  if (fallback) return fallback;
  for (let base = o.minRow; base >= o.minRow * 0.8; base *= 0.97) {
    const rows = fewest(base);
    if (rows && balanced(rows)) return place(rows, o, base);
  }
  const rows = fewest(o.minRow);
  return rows ? place(rows, o, o.minRow) : {placed: [], width: o.width, height: 0, rows: 0, base: o.minRow};
}
