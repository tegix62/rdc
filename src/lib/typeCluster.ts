/*
  THE TYPE TAB AS A NOISE CLUSTER - preview only.

  Chris: each tab "pretty radically different"; All and Merch are
  successful, "Type is half-baked" - "Let's try Typography as the noise
  cluster", the outline he liked on /next/cluster/home.

  While the grid is in the Type/Lettering view (portfolio.astro puts
  .is-type-view on it), the grid is hidden and its type pieces are shown
  instead as one central cluster - lib/cluster.ts, with the noise outline
  and hairline gaps. Pick a piece and its whole project gathers round it in
  the same place, the piece in the middle and larger, with the project's
  name and a link under it; pick the middle piece to open the project; Back
  or Escape returns to all the type. Leaving the view gives the grid back
  exactly as it was: nothing here touches the grid's own tiles or its
  layout engine, only reads them.

  The pictures are the grid's own, copied (same srcset, so the same cached
  files), each told its drawn width so the browser fetches no more than it
  needs. Styles for what is built here are in global.css (TYPE CLUSTER),
  not scoped: the build's critical-CSS step drops rules for elements that
  only exist once the script runs.
*/
import {layoutCluster, seedOf} from './cluster';

interface Piece {
  tile: HTMLElement;
  w: number;
  h: number;
  project: string | null;
  title: string;
  img: HTMLImageElement;
}

const GAP = 3;
const GAP_PHONE = 2;

export function startTypeCluster(grid: HTMLElement) {
  const stage = document.createElement('div');
  stage.className = 'tc';
  stage.hidden = true;
  const field = document.createElement('div');
  field.className = 'tc-field';
  const under = document.createElement('div');
  under.className = 'tc-under';
  stage.append(field, under);
  grid.after(stage);

  let pieces: Piece[] = [];
  let typeSet: number[] = [];
  let shown: number[] = [];
  let lead: number | null = null;
  let on = false;

  const phone = () => innerWidth < 768;
  const clean = (s: string) => s.replace(/[​-‍⁠﻿]/g, '').trim();

  /* Everything on the grid, read once per visit to the view. */
  const read = () => {
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>('.pf-item')).filter(
      (el) => !el.classList.contains('pf-end') && el.querySelector('img'),
    );
    pieces = tiles.map((tile) => {
      const src = tile.querySelector<HTMLImageElement>('.pf-item__img') ?? tile.querySelector('img')!;
      const w = Number(src.getAttribute('width')) || src.naturalWidth || 1;
      const h = Number(src.getAttribute('height')) || src.naturalHeight || 1;
      const img = document.createElement('img');
      img.alt = src.alt;
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      const set = src.dataset.upgradeSrcset || src.getAttribute('srcset');
      if (set) img.srcset = set;
      img.src = src.currentSrc || src.src;
      return {
        tile,
        w,
        h,
        project:
          tile.querySelector('.pf-item__jump')?.getAttribute('href') ?? tile.dataset.family ?? null,
        title: clean(src.alt || ''),
        img,
      };
    });
    typeSet = pieces.map((p, i) => (p.tile.classList.contains('type-lettering') ? i : -1)).filter((i) => i >= 0);
  };

  const projectName = (href: string) => {
    const own = pieces.find((p) => p.project === href && p.tile.classList.contains('pf-item--study'));
    return own?.title ?? pieces.find((p) => p.project === href)?.title ?? '';
  };

  const draw = () => {
    if (!on) return;
    const width = Math.min(stage.clientWidth, phone() ? stage.clientWidth : 1040);
    const top = stage.getBoundingClientRect().top + scrollY;
    const maxHeight = Math.max(280, innerHeight - Math.min(top, 220) - (lead === null ? 60 : 110));
    const project = lead === null ? null : pieces[lead].project;
    const out = layoutCluster(
      shown.map((i) => pieces[i]),
      {
        width,
        maxHeight,
        gap: phone() ? GAP_PHONE : GAP,
        minRow: phone() ? 50 : 80,
        maxRow: phone() ? 170 : 260,
        lead: lead === null ? 1 : 1.35,
        outline: {seed: seedOf(project ?? 'type-lettering')},
      },
    );
    field.replaceChildren();
    field.style.width = `${out.width}px`;
    field.style.height = `${Math.ceil(out.height)}px`;
    for (const p of out.placed) {
      const k = shown[p.i];
      const piece = pieces[k];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tc-piece';
      if (k === lead) b.classList.add('is-lead');
      if (piece.tile.classList.contains('pf-item--mark')) b.classList.add('is-mark');
      b.setAttribute('aria-label', piece.title);
      b.style.left = `${p.x}px`;
      b.style.top = `${p.y}px`;
      b.style.width = `${p.w}px`;
      b.style.height = `${p.h}px`;
      // The drawn width, so the browser picks the file this size needs.
      piece.img.sizes = `${Math.ceil(p.w)}px`;
      b.append(piece.img);
      b.addEventListener('click', () => pick(k));
      field.append(b);
    }
    under.replaceChildren();
    if (project !== null && lead !== null) {
      const name = document.createElement('p');
      name.className = 'tc-name';
      name.textContent = projectName(project);
      const links = document.createElement('p');
      links.className = 'tc-links';
      if (project.startsWith('/')) {
        const go = document.createElement('a');
        go.href = project;
        go.textContent = 'See the project →';
        links.append(go);
      }
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'tc-back';
      back.textContent = 'Back to all type';
      back.addEventListener('click', reset);
      links.append(back);
      under.append(name, links);
    } else {
      const hint = document.createElement('p');
      hint.className = 'tc-hint';
      hint.textContent = 'Pick a piece to see the project it belongs to.';
      under.append(hint);
    }
  };

  /* One project gathered round the piece picked; its middle piece opens it. */
  const pick = (k: number) => {
    const href = pieces[k].project;
    if (k === lead && href?.startsWith('/')) {
      location.href = href;
      return;
    }
    const family = href ? pieces.map((p, i) => (p.project === href ? i : -1)).filter((i) => i >= 0) : [k];
    // Its own type pieces next to it, then the rest of the project.
    const type = family.filter((i) => i !== k && typeSet.includes(i));
    const rest = family.filter((i) => i !== k && !typeSet.includes(i));
    shown = [k, ...type, ...rest];
    lead = k;
    draw();
    stage.scrollIntoView({block: 'nearest'});
  };

  const reset = () => {
    shown = typeSet;
    lead = null;
    draw();
  };

  const sync = () => {
    const want = grid.classList.contains('is-type-view');
    if (want === on) return;
    on = want;
    if (on) {
      read();
      shown = typeSet;
      lead = null;
      grid.style.visibility = 'hidden';
      grid.style.position = 'absolute';
      grid.style.pointerEvents = 'none';
      stage.hidden = false;
      draw();
    } else {
      stage.hidden = true;
      field.replaceChildren();
      grid.style.visibility = '';
      grid.style.position = '';
      grid.style.pointerEvents = '';
    }
  };

  new MutationObserver(sync).observe(grid, {attributes: true, attributeFilter: ['class']});
  addEventListener('keydown', (e) => {
    if (on && e.key === 'Escape' && lead !== null) reset();
  });
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    if (Math.abs(entry.contentRect.width - lastWidth) < 1) return;
    lastWidth = entry.contentRect.width;
    requestAnimationFrame(draw);
  }).observe(stage);
  sync();
}
