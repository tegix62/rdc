/*
  THE TYPE TAB AS NOISE CLUSTERS - preview only.

  Chris: each tab "pretty radically different"; All and Merch are
  successful, "Type is half-baked" - "Let's try Typography as the noise
  cluster", the outline he liked on /next/cluster/home. Then, on the first
  version: "vary the sizing even more based on complexity of the file", "a
  wordmark cluster and an illustration cluster under it ... maybe they
  overlap slightly but are largely separate", and two faults - a pick
  replaced the whole cluster with no way back, and Shuffle and -/+ did
  nothing here.

  While the grid is in the Type/Lettering view (portfolio.astro puts
  .is-type-view on it) the grid is hidden and its pieces are drawn as two
  clusters (lib/cluster.ts, noise outline, hairline gaps): the lettering
  (category Typography) above, the illustration below, pulled up until
  their edges nearly meet - two shapes, almost touching.

  SIZE BY DETAIL. Each picture's detail is measured once it has loaded -
  how much its tone changes from pixel to pixel, on a small copy drawn to
  a canvas - and ranked: the busiest are drawn largest, the plainest
  smallest, about 0.65x to 1.45x. A bold wordmark reads small; a dense
  drawing needs the room. The clusters are shown once the measuring is
  done (or after a moment), so nothing jumps.

  A PICK GATHERS IN PLACE. The piece's project comes to the middle of its
  cluster - the piece itself central and larger, the project's other
  pieces round it - and the rest of that cluster stays, dimmed, further
  out. The other cluster is untouched. A dimmed piece picks its own
  project; the middle piece opens the project's page. The bar above the
  clusters names the project and says how to get back: "All type",
  Escape, or the browser's back.

  Shuffle deals each cluster in a new order and outline; - and + make the
  pieces smaller or larger. Their clicks are taken here while the view is
  showing, so the hidden grid is not shuffled or resized underneath.

  Nothing here changes the grid's own tiles or layout: leaving the view
  gives it back as it was. The pictures are the grid's own (same srcset,
  same cached files), each told its drawn width. Styles are in global.css
  (TYPE CLUSTER): the critical-CSS step drops scoped rules for elements
  that only exist once the script runs.
*/
import {layoutCluster, seedOf, type ClusterLayout} from './cluster';

interface Piece {
  tile: HTMLElement;
  w: number;
  h: number;
  project: string | null;
  title: string;
  img: HTMLImageElement;
  words: boolean;
  detail: number | null;
}

const GAP = 3;
const GAP_PHONE = 2;
// Smallest and largest a piece is drawn, against its row, by its detail.
const SMALLEST = 0.65;
const LARGEST = 1.45;
// Longest the clusters wait for their pictures before showing anyway.
const WAIT = 1600;

export function startTypeCluster(grid: HTMLElement) {
  const stage = document.createElement('div');
  stage.className = 'tc';
  stage.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'tc-bar';
  const field = document.createElement('div');
  field.className = 'tc-field';
  const under = document.createElement('p');
  under.className = 'tc-hint';
  under.textContent = 'Pick a piece to see the project it belongs to.';
  stage.append(bar, field, under);
  grid.after(stage);

  let pieces: Piece[] = [];
  let words: number[] = [];
  let pics: number[] = [];
  let lead: number | null = null;
  let on = false;
  let ready = false;
  let zoom = 1;
  let deal = 0;
  let pushed = false;

  const phone = () => innerWidth < 768;
  const clean = (s: string) => s.replace(/[​-‍⁠﻿]/g, '').trim();

  /* How busy a picture is: mean tone change between neighbouring pixels. */
  const measure = (img: HTMLImageElement): number | null => {
    try {
      const n = 48;
      const k = img.naturalWidth / img.naturalHeight || 1;
      const w = k >= 1 ? n : Math.max(8, Math.round(n * k));
      const h = k >= 1 ? Math.max(8, Math.round(n / k)) : n;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', {willReadFrequently: true})!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const tone = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      };
      let sum = 0;
      for (let y = 0; y < h - 1; y++)
        for (let x = 0; x < w - 1; x++) sum += Math.abs(tone(x + 1, y) - tone(x, y)) + Math.abs(tone(x, y + 1) - tone(x, y));
      return sum / ((w - 1) * (h - 1) * 2 * 255);
    } catch {
      return null; // a picture from another address cannot be read; it keeps the middle size
    }
  };

  /* Ranked, so the spread is the same however busy the set is overall. */
  const scales = () => {
    const known = pieces.map((p, i) => [i, p.detail] as const).filter(([, d]) => d !== null) as [number, number][];
    known.sort((a, b) => a[1] - b[1]);
    const out = new Map<number, number>();
    known.forEach(([i], r) => out.set(i, SMALLEST + (LARGEST - SMALLEST) * (known.length > 1 ? r / (known.length - 1) : 0.5)));
    return out;
  };

  const read = () => {
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>('.pf-item')).filter(
      (el) => !el.classList.contains('pf-end') && el.querySelector('img'),
    );
    pieces = tiles.map((tile) => {
      const src = tile.querySelector<HTMLImageElement>('.pf-item__img') ?? tile.querySelector('img')!;
      const img = document.createElement('img');
      img.alt = src.alt;
      img.decoding = 'async';
      img.draggable = false;
      const set = src.dataset.upgradeSrcset || src.getAttribute('srcset');
      if (set) img.srcset = set;
      img.src = src.currentSrc || src.src;
      const piece: Piece = {
        tile,
        w: Number(src.getAttribute('width')) || src.naturalWidth || 1,
        h: Number(src.getAttribute('height')) || src.naturalHeight || 1,
        project: tile.querySelector('.pf-item__jump')?.getAttribute('href') ?? tile.dataset.family ?? null,
        title: clean(src.alt || ''),
        img,
        words: tile.dataset.kind !== 'Illustration',
        detail: null,
      };
      const done = () => {
        if (piece.detail === null) piece.detail = measure(img) ?? 0.5;
        if (!ready && [...words, ...pics].every((i) => pieces[i].detail !== null)) show();
      };
      img.addEventListener('load', done);
      img.addEventListener('error', () => {
        piece.detail = 0.5;
        done();
      });
      return piece;
    });
    const inType = pieces.map((p, i) => (p.tile.classList.contains('type-lettering') ? i : -1)).filter((i) => i >= 0);
    words = inType.filter((i) => pieces[i].words);
    pics = inType.filter((i) => !pieces[i].words);
  };

  const show = () => {
    ready = true;
    field.style.visibility = '';
    draw();
  };

  const familyOf = (k: number) => {
    const href = pieces[k].project;
    return href ? pieces.map((p, i) => (p.project === href ? i : -1)).filter((i) => i >= 0) : [k];
  };

  const projectName = (href: string) =>
    pieces.find((p) => p.project === href && p.tile.classList.contains('pf-item--study'))?.title ??
    pieces.find((p) => p.project === href)?.title ??
    '';

  const lay = (list: number[], seed: string, width: number, maxHeight: number, size: Map<number, number>) =>
    layoutCluster(
      list.map((i) => ({w: pieces[i].w, h: pieces[i].h, scale: size.get(i) ?? 1})),
      {
        width,
        maxHeight,
        gap: phone() ? GAP_PHONE : GAP,
        minRow: (phone() ? 46 : 72) * zoom,
        maxRow: (phone() ? 150 : 230) * zoom,
        lead: lead !== null && list[0] === lead ? 1.3 : 1,
        outline: {seed: seedOf(`${seed}:${deal}`)},
      },
    );

  /* How far down the second cluster can sit with no piece touching the first. */
  const nestBelow = (a: ClusterLayout, b: ClusterLayout, ax: number, bx: number, gap: number) => {
    const clear = (dy: number) =>
      a.placed.every((p) =>
        b.placed.every(
          (q) =>
            q.x + bx >= p.x + ax + p.w + gap ||
            p.x + ax >= q.x + bx + q.w + gap ||
            q.y + dy >= p.y + p.h + gap ||
            p.y >= q.y + dy + q.h + gap,
        ),
      );
    let dy = a.height + gap * 6;
    // Up while nothing touches, but never more than a third into the first.
    while (dy - 4 > a.height * 0.66 && clear(dy - 4)) dy -= 4;
    return dy;
  };

  const piece = (k: number, x: number, y: number, w: number, h: number, dim: boolean) => {
    const p = pieces[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tc-piece';
    if (k === lead) b.classList.add('is-lead');
    if (dim) b.classList.add('is-dim');
    if (p.tile.classList.contains('pf-item--mark')) b.classList.add('is-mark');
    b.setAttribute('aria-label', p.title);
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.style.width = `${w}px`;
    b.style.height = `${h}px`;
    p.img.sizes = `${Math.ceil(w)}px`;
    b.append(p.img);
    b.addEventListener('click', () => pick(k));
    return b;
  };

  const draw = () => {
    if (!on) return;
    const full = stage.clientWidth;
    const width = Math.min(full, phone() ? full : 1000);
    const size = scales();
    const fam = lead === null ? new Set<number>() : new Set(familyOf(lead));
    // The project gathers in its own cluster: the piece, its project, then
    // the rest of that cluster. Its pieces leave the other cluster.
    const inWords = lead !== null && pieces[lead].words;
    const arrange = (list: number[], mine: boolean) =>
      lead === null
        ? list
        : mine
          ? [lead, ...[...fam].filter((i) => i !== lead), ...list.filter((i) => !fam.has(i))]
          : list.filter((i) => !fam.has(i));
    const top = arrange(words, inWords);
    const bottom = arrange(pics, lead !== null && !inWords);
    const each = Math.max(240, innerHeight * 0.5);
    const A = lay(top, lead !== null && inWords ? pieces[lead].project ?? 'words' : 'words', width, each, size);
    const B = lay(bottom, lead !== null && !inWords ? pieces[lead].project ?? 'pics' : 'pics', width, each, size);
    const ax = (full - A.width) / 2;
    const bx = (full - B.width) / 2;
    const gap = phone() ? GAP_PHONE : GAP;
    const dy = top.length && bottom.length ? nestBelow(A, B, ax, bx, gap * 3) : top.length ? A.height : 0;

    field.replaceChildren();
    field.style.height = `${Math.ceil(dy + (bottom.length ? B.height : 0))}px`;
    for (const p of A.placed) field.append(piece(top[p.i], ax + p.x, p.y, p.w, p.h, lead !== null && !fam.has(top[p.i])));
    for (const p of B.placed) field.append(piece(bottom[p.i], bx + p.x, dy + p.y, p.w, p.h, lead !== null && !fam.has(bottom[p.i])));

    bar.replaceChildren();
    if (lead !== null) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'tc-back';
      back.textContent = '← All type';
      back.addEventListener('click', () => (pushed ? history.back() : reset()));
      bar.append(back);
      const href = pieces[lead].project;
      if (href) {
        const name = document.createElement('span');
        name.className = 'tc-name';
        name.textContent = projectName(href);
        bar.append(name);
        if (href.startsWith('/')) {
          const go = document.createElement('a');
          go.href = href;
          go.textContent = 'See the project →';
          bar.append(go);
        }
      }
    }
    bar.hidden = lead === null;
    under.hidden = lead !== null;
  };

  const pick = (k: number, push = true) => {
    const href = pieces[k].project;
    if (k === lead && href?.startsWith('/')) {
      location.href = href;
      return;
    }
    lead = k;
    if (push) {
      history.pushState({...(history.state ?? {}), tc: k}, '');
      pushed = true;
    }
    draw();
    bar.scrollIntoView({block: 'nearest'});
  };

  const reset = () => {
    lead = null;
    pushed = false;
    draw();
  };

  addEventListener('popstate', (e) => {
    if (!on) return;
    const k = (e.state as {tc?: number} | null)?.tc;
    if (typeof k === 'number' && pieces[k]) pick(k, false);
    else reset();
  });
  addEventListener('keydown', (e) => {
    if (on && e.key === 'Escape' && lead !== null) pushed ? history.back() : reset();
  });

  // Shuffle and -/+ act on the clusters while they are showing.
  const take = (id: string, act: () => void) =>
    document.getElementById(id)?.addEventListener(
      'click',
      (e) => {
        if (!on) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        act();
        draw();
      },
      true,
    );
  const shuffle = (list: number[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  };
  take('pf-shuffle', () => {
    shuffle(words);
    shuffle(pics);
    deal++;
  });
  take('pf-minus', () => (zoom = Math.max(0.6, zoom / 1.2)));
  take('pf-plus', () => (zoom = Math.min(1.8, zoom * 1.2)));

  const sync = () => {
    const want = grid.classList.contains('is-type-view');
    if (want === on) return;
    on = want;
    if (on) {
      lead = null;
      pushed = false;
      ready = false;
      read();
      grid.style.visibility = 'hidden';
      grid.style.position = 'absolute';
      grid.style.pointerEvents = 'none';
      stage.hidden = false;
      field.style.visibility = 'hidden';
      draw();
      window.setTimeout(() => !ready && on && show(), WAIT);
    } else {
      stage.hidden = true;
      field.replaceChildren();
      grid.style.visibility = '';
      grid.style.position = '';
      grid.style.pointerEvents = '';
    }
  };

  new MutationObserver(sync).observe(grid, {attributes: true, attributeFilter: ['class']});
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    if (Math.abs(entry.contentRect.width - lastWidth) < 1) return;
    lastWidth = entry.contentRect.width;
    requestAnimationFrame(draw);
  }).observe(stage);
  sync();
}
