/*
  THE TYPE TAB - preview only.

  Chris: each tab "pretty radically different"; All and Merch are
  successful, "Type is half-baked" - "Let's try Typography as the noise
  cluster". Then: "more variation in sizes ... more radical sizing", "we
  got to find a way to make the type and the illustration work in the same
  page", "maybe we just do a noise cluster ... and then maybe the
  illustration stuff is just like full width on the bottom. It's like the
  second half of the page."

  So the tab is two halves, while the grid is in the Type/Lettering view
  (portfolio.astro puts .is-type-view on it; the grid is hidden meanwhile
  and given back untouched):

  THE LETTERING - one noise cluster with radically different sizes
  (lib/spiralCluster.ts: biggest in the middle, each next piece spiralling
  out to the nearest free spot, the spiral warped by noise). Sizes come in
  tiers by each picture's detail, measured once it has loaded on a small
  canvas copy and ranked: the busiest few huge, the next medium, the rest
  small - about a sixfold range in area. Shown once measured, so nothing
  jumps.

  A pick gathers in place: the piece becomes the giant in the middle, its
  project round it at medium size, everything else small and dimmed further
  out. A dimmed piece picks its own project; the middle piece opens the
  project's page. A bar above names the project and has the way back ("All
  type"), as do Escape and the browser's back.

  THE ILLUSTRATION - below, the full width of the page, in edge-to-edge
  rows of one height (each row stretched to the width, the last left
  short), under its own small heading. A tap shows the piece large, with
  its project's name and a link; Escape or a tap outside closes it.

  Shuffle deals both halves anew; - and + make the lettering smaller or
  larger. Their clicks are taken here while the tab shows, so the hidden
  grid is not shuffled or resized underneath. The pictures are the grid's
  own (same srcset, same cached files), each told its drawn width. Styles
  are in global.css (TYPE TAB): the critical-CSS step drops scoped rules
  for elements that only exist once the script runs.
*/
import {seedOf} from './cluster';
import {layoutSpiral} from './spiralCluster';

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
// Tiers of area by detail rank: the busiest TOP share huge, the next MID
// share medium, the rest small.
const TOP = 0.12;
const MID = 0.3;
const HUGE = 6;
const MEDIUM = 2.5;
const SMALL = 1;
// A pick: the piece, its project, everything else.
const PICKED = 8;
const KIN = 2.5;
const OTHERS = 0.55;
// Longest the lettering waits for its pictures before showing anyway.
const WAIT = 1600;

export function startTypeCluster(grid: HTMLElement) {
  const stage = document.createElement('div');
  stage.className = 'tc';
  stage.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'tc-bar';
  const field = document.createElement('div');
  field.className = 'tc-field';
  const hint = document.createElement('p');
  hint.className = 'tc-hint';
  hint.textContent = 'Pick a piece to see the project it belongs to.';
  const picsHead = document.createElement('h2');
  picsHead.className = 'tc-head';
  picsHead.textContent = 'Illustration';
  const picsField = document.createElement('div');
  picsField.className = 'tc-rows';
  const viewer = document.createElement('dialog');
  viewer.className = 'tc-view';
  stage.append(bar, field, hint, picsHead, picsField, viewer);
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
  const gap = () => (phone() ? GAP_PHONE : GAP);
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
      return null; // unreadable: it takes the middle tier
    }
  };

  /* The lettering's tiers, by detail rank (the deal breaks ties). */
  const tierOf = () => {
    const ranked = [...words].sort((a, b) => (pieces[b].detail ?? 0.5) - (pieces[a].detail ?? 0.5));
    const size = new Map<number, number>();
    ranked.forEach((i, r) => {
      const f = ranked.length > 1 ? r / ranked.length : 0.5;
      size.set(i, f < TOP ? HUGE : f < TOP + MID ? MEDIUM : SMALL);
    });
    return size;
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
        if (!ready && words.every((i) => pieces[i].detail !== null)) show();
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

  const box = (cls: string, k: number, x: number, y: number, w: number, h: number) => {
    const p = pieces[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    if (p.tile.classList.contains('pf-item--mark')) b.classList.add('is-mark');
    b.setAttribute('aria-label', p.title);
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.style.width = `${w}px`;
    b.style.height = `${h}px`;
    p.img.sizes = `${Math.ceil(w)}px`;
    b.append(p.img);
    return b;
  };

  /* The lettering: one radically sized cluster. */
  const drawWords = () => {
    const full = stage.clientWidth;
    const width = Math.min(full, phone() ? full : 1100);
    const tiers = tierOf();
    const fam = lead === null ? new Set<number>() : new Set(familyOf(lead));
    let order: number[];
    let size: (i: number) => number;
    if (lead === null) {
      order = [...words].sort((a, b) => (tiers.get(b) ?? 1) - (tiers.get(a) ?? 1));
      size = (i) => tiers.get(i) ?? SMALL;
    } else {
      const kin = [...fam].filter((i) => i !== lead);
      order = [lead, ...kin, ...words.filter((i) => !fam.has(i))];
      size = (i) => (i === lead ? PICKED : fam.has(i) ? KIN : OTHERS);
    }
    const out = layoutSpiral(
      order.map((i) => ({w: pieces[i].w, h: pieces[i].h, size: size(i)})),
      {
        width,
        height: Math.max(260, innerHeight * 0.62) * zoom,
        gap: gap(),
        seed: seedOf(`${lead === null ? 'type' : pieces[lead].project ?? lead}:${deal}`),
        // Taller as it grows: a cluster as wide as the screen can only get
        // bigger by getting taller, or + is undone by the fit to the width
        // (measured on the live site, a phone: + 88%, - 104%).
        squash: (phone() ? 1.2 : 0.62) * Math.max(phone() ? zoom : 1, zoom),
        fill: 0.5,
      },
    );
    const ox = (full - out.width) / 2;
    field.replaceChildren();
    field.style.height = `${Math.ceil(out.height)}px`;
    for (const p of out.placed) {
      const k = order[p.i];
      const b = box('tc-piece', k, ox + p.x, p.y, p.w, p.h);
      if (k === lead) b.classList.add('is-lead');
      if (lead !== null && !fam.has(k)) b.classList.add('is-dim');
      b.addEventListener('click', () => pick(k));
      field.append(b);
    }
  };

  /* The illustration: full width, rows of one height, each row filled. */
  const drawPics = () => {
    picsHead.hidden = picsField.hidden = pics.length === 0;
    if (!pics.length) return;
    const width = stage.clientWidth;
    const target = phone() ? 130 : 250;
    const g = gap();
    const rows: number[][] = [];
    let row: number[] = [];
    let sum = 0;
    for (const i of pics) {
      row.push(i);
      sum += pieces[i].w / pieces[i].h;
      if (sum * target + g * (row.length - 1) >= width) {
        rows.push(row);
        row = [];
        sum = 0;
      }
    }
    if (row.length) rows.push(row);
    picsField.replaceChildren();
    let y = 0;
    rows.forEach((r, n) => {
      const ratios = r.reduce((s, i) => s + pieces[i].w / pieces[i].h, 0);
      const last = n === rows.length - 1;
      // A full row is stretched to the width; the last keeps the target height.
      const h = last && ratios * target + g * (r.length - 1) < width ? target : (width - g * (r.length - 1)) / ratios;
      let x = 0;
      for (const i of r) {
        const w = (pieces[i].w / pieces[i].h) * h;
        const b = box('tc-pic', i, x, y, w, h);
        b.addEventListener('click', () => view(i));
        picsField.append(b);
        x += w + g;
      }
      y += h + g;
    });
    picsField.style.height = `${Math.ceil(y - g)}px`;
  };

  const drawBar = () => {
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
    hint.hidden = lead !== null;
  };

  const draw = () => {
    if (!on) return;
    drawWords();
    drawPics();
    drawBar();
  };

  /* One illustration, large. */
  const view = (k: number) => {
    const p = pieces[k];
    viewer.replaceChildren();
    const img = document.createElement('img');
    img.alt = p.title;
    if (p.img.srcset) img.srcset = p.img.srcset;
    img.src = p.img.src;
    img.sizes = '(max-width: 48rem) 94vw, 70vw';
    const cap = document.createElement('p');
    cap.className = 'tc-view__cap';
    cap.textContent = p.title;
    if (p.project?.startsWith('/')) {
      const go = document.createElement('a');
      go.href = p.project;
      go.textContent = `${projectName(p.project)} →`;
      cap.append(' · ', go);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tc-view__close';
    close.textContent = 'Close';
    close.addEventListener('click', () => viewer.close());
    viewer.append(img, cap, close);
    viewer.showModal();
  };
  // A tap on the backdrop (the dialog itself, outside its contents) closes it.
  viewer.addEventListener('click', (e) => e.target === viewer && viewer.close());

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
    if (!on || viewer.open) return;
    if (e.key === 'Escape' && lead !== null) pushed ? history.back() : reset();
  });

  // Shuffle and -/+ act on the tab while it is showing.
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
  take('pf-minus', () => (zoom = Math.max(0.55, zoom / 1.25)));
  take('pf-plus', () => (zoom = Math.min(2, zoom * 1.25)));

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
      picsField.replaceChildren();
      if (viewer.open) viewer.close();
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
