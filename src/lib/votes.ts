/*
  VOTES, the page's side - "Vote" on any piece of the portfolio.
  Chris: "one of those tertiary buttons ... that anyone can press ... next
  to the plus and the minus and the shuffle ... a toggle. It would turn on
  an ability to click on things ... they do their usual thing. They expand
  or they gather ... added functionality between that expansion and
  collapsing ... a simple upvoting system." And: "maybe I throw email ... at
  the back end ... easy to hand wave ... so I don't lose the initial data of
  the upvote."

  - The Vote button in the toolbar ([data-vote], both arrangements) turns it
    on and off. On, the address carries ?vote=1, so a link Chris sends -
    "tell me which design you like" - opens with it on.
  - One "Vote" button, made here, goes into whichever piece is open:
    an expanded tile on the grids (.pf-item.is-expanded), a grown piece on
    All (.wd-piece.is-open). Pressed again, the vote is taken back.
  - Who is who: a random id this browser keeps, and the pieces it dug, so
    the buttons say "Voted" on the next visit too. The server's side,
    and what it keeps and does not, is in functions/api/votes.ts.
  - Spam: on this browser's first vote, Cloudflare Turnstile runs out of
    sight when the site has a key (PUBLIC_TURNSTILE_SITE_KEY); passed once,
    never asked again. Without a key, or if it fails, the vote still goes,
    under the server's tighter limits.
  - Signing it: after the first vote has been saved, once, a small box
    offers to put their name on their votes - a name or @handle, a link to
    their work, shown on the site or just for Chris - and an address for new
    work, all optional. Chris: "making the votes public or private so that
    people could leave their name or their username ... and like a link to
    their work." The name then rides on every vote this browser makes; a
    public one shows only once Chris has said so (src/lib/endorse.ts). The
    address goes to the blog's list (/api/subscribe, source "votes"). "No
    thanks" and it never asks again; the vote was already kept either way.
  - The names: with Votes on, each piece someone has put their name on says
    so in a small tag - "@sam voted", "@sam and 2 others" - and the open
    piece lists them, linked to their work. Asked for (/api/endorse) only
    when Votes is turned on, never on an ordinary visit. Chris: "little
    pop-up votes if the vote filter is on that says, like, this person liked
    this ... I could sort of get endorsements that way."

  Browser storage is a convenience here (Chris's own record is the
  database), so every read and write is guarded and the page works without.
*/

const KEY = 'rdc-votes';
const SITE_KEY = (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';

type Sign = {name: string; link: string; public: boolean};
type Saved = {visitor: string; dug: string[]; checked?: boolean; asked?: boolean; sign?: Sign};
type Name = {piece: string; name: string; link: string};

const load = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (s && typeof s.visitor === 'string' && Array.isArray(s.dug)) return s;
  } catch {}
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return {visitor: Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''), dug: []};
};
const save = (s: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
};

// Turnstile, loaded only when a first vote needs it; a token or '' within 8s.
let ts: Promise<string> | null = null;
const token = (): Promise<string> => {
  if (!SITE_KEY) return Promise.resolve('');
  ts ??= new Promise<string>((done) => {
    const give = (t: string) => done(t);
    const timer = setTimeout(() => give(''), 8000);
    const w = window as any;
    const run = () => {
      try {
        const box = document.createElement('div');
        box.className = 'vt-check';
        document.body.append(box);
        w.turnstile.render(box, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          callback: (t: string) => {
            clearTimeout(timer);
            give(t);
            setTimeout(() => box.remove(), 500);
          },
          'error-callback': () => give(''),
        });
      } catch {
        give('');
      }
    };
    if (w.turnstile) run();
    else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = run;
      s.onerror = () => give('');
      document.head.append(s);
    }
  }).finally(() => (ts = null));
  return ts;
};

export function startVotes() {
  const toggles = document.querySelectorAll<HTMLButtonElement>('[data-vote]');
  if (!toggles.length) return;
  let state = load();
  let on = new URL(location.href).searchParams.get('vote') === '1';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vt-dig';
  const label = document.createElement('span');
  button.append(label);
  let current: {el: HTMLElement; id: string} | null = null;

  // Under the button in the open piece: who put their name on it.
  const by = document.createElement('p');
  by.className = 'vt-by';

  const paint = () => {
    const dug = !!current && state.dug.includes(current.id);
    button.setAttribute('aria-pressed', String(dug));
    label.textContent = dug ? 'Voted' : 'Vote';
    const who = current ? (names.get(current.id) ?? []) : [];
    by.replaceChildren();
    if (who.length) {
      by.append('Voted by ');
      who.slice(0, 12).forEach((n, i) => {
        if (i) by.append(i === who.length - 1 || i === 11 ? ' and ' : ', ');
        by.append(nameEl(n));
      });
      if (who.length > 12) by.append(` and ${who.length - 12} more`);
      if (by.parentElement !== button.parentElement) button.after(by);
    } else by.remove();
  };

  // A name, linked to their work when they gave a link. Text only, never markup.
  const nameEl = (n: Name) => {
    const el = document.createElement(n.link ? 'a' : 'span');
    el.textContent = n.name;
    if (n.link && el instanceof HTMLAnchorElement) {
      el.href = n.link;
      el.target = '_blank';
      el.rel = 'noopener nofollow ugc';
    }
    return el;
  };

  // The names, fetched once, the first time Votes is turned on.
  const names = new Map<string, Name[]>();
  let fetched: Promise<void> | null = null;
  const loadNames = () =>
    (fetched ??= fetch('/api/endorse')
      .then((r) => (r.ok ? r.json() : {names: []}))
      .then((d: {names?: Name[]}) => {
        for (const n of d.names ?? []) {
          const list = names.get(n.piece) ?? [];
          if (!list.some((x) => x.name === n.name)) list.push(n);
          names.set(n.piece, list);
        }
        tag();
        paint();
      })
      .catch(() => {}));

  // A small tag on each piece with names: "@sam voted", "@sam and 2 others".
  const tag = () => {
    for (const el of document.querySelectorAll<HTMLElement>('.wd-piece[data-piece], .pf-item[data-piece]')) {
      const who = names.get(el.dataset.piece!);
      if (!who?.length || el.querySelector(':scope .vt-tag')) continue;
      const t = document.createElement('span');
      t.className = 'vt-tag';
      t.textContent = who.length === 1 ? `${who[0].name} voted` : `${who[0].name} and ${who.length - 1} other${who.length > 2 ? 's' : ''}`;
      (el.querySelector<HTMLElement>('.wd-frame') ?? el).append(t);
    }
  };

  // The open piece, in whichever view is showing.
  const openPiece = (): {el: HTMLElement; id: string} | null => {
    // The one on screen: the portfolio keeps both arrangements, one hidden.
    const el = [...document.querySelectorAll<HTMLElement>('.wd-piece.is-open[data-piece], .pf-item.is-expanded[data-piece]')].find(
      (x) => x.offsetParent !== null,
    );
    const id = el?.dataset.piece;
    return el && id ? {el, id} : null;
  };
  const place = () => {
    const next = on ? openPiece() : null;
    if (!next) {
      button.remove();
      current = null;
      return;
    }
    // A grown piece's frame on All; the tile itself on the grids (it is positioned, its frame is not).
    const frame = next.el.querySelector<HTMLElement>('.wd-frame') ?? next.el;
    if (button.parentElement !== frame) frame.append(button);
    current = next;
    paint();
  };

  const setOn = (v: boolean) => {
    on = v;
    document.documentElement.classList.toggle('is-voting', on);
    toggles.forEach((t) => t.setAttribute('aria-pressed', String(on)));
    const url = new URL(location.href);
    if (on) url.searchParams.set('vote', '1');
    else url.searchParams.delete('vote');
    history.replaceState(history.state, '', url);
    if (on) loadNames();
    place();
  };
  toggles.forEach((t) => t.addEventListener('click', () => setOn(!on)));

  // Pieces open and close by class; follow them, once a frame.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      place();
      // A view laid out afresh gets its tags back.
      if (on && names.size) tag();
    });
  }).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['class']});

  button.addEventListener('click', async (e) => {
    // A vote, not a click on the piece: it stays open.
    e.stopPropagation();
    if (!current) return;
    const id = current.id;
    const dig = !state.dug.includes(id);
    state = {...state, dug: dig ? [...state.dug, id] : state.dug.filter((x) => x !== id)};
    save(state);
    paint();
    const first = dig && !state.asked;
    const send = (extra: Record<string, unknown> = {}) =>
      fetch('/api/votes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({piece: id, visitor: state.visitor, on: dig, ...(state.sign ? {sign: state.sign} : {}), ...extra}),
      }).then(async (res) => ({res, body: (await res.json().catch(() => ({}))) as {ok?: boolean; verified?: boolean}}));
    try {
      // The vote goes at once; the spam check, if this browser has not passed one, runs beside it.
      const {res, body} = await send();
      if (!res.ok || !body.ok) throw new Error('not kept');
      if (body.verified && !state.checked) save((state = {...state, checked: true}));
      if (first) ask(id);
      if (dig && !state.checked && SITE_KEY) {
        token().then(async (t) => {
          // Not if the vote was taken back while the check ran.
          if (!t || !state.dug.includes(id)) return;
          // The same vote again with the token: kept once, and this browser marked as checked.
          const again = await send({token: t}).catch(() => null);
          if (again?.body.verified) save((state = {...state, checked: true}));
        });
      }
    } catch {
      // Not kept: put the button back as it was.
      state = {...state, dug: dig ? state.dug.filter((x) => x !== id) : [...state.dug, id]};
      save(state);
      paint();
      note('That did not go through. Please try again.');
    }
  });

  // A line at the foot of the screen, gone after a few seconds.
  let noteTimer = 0;
  const note = (text: string) => {
    let n = document.querySelector<HTMLElement>('.vt-note');
    if (!n) {
      n = document.createElement('p');
      n.className = 'vt-note';
      n.setAttribute('role', 'status');
      document.body.append(n);
    }
    n.textContent = text;
    n.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => (n!.hidden = true), 3500);
  };

  /*
    Once, after the first vote is in: their name on their votes, and an
    address for new work - each optional, all in one small box.
  */
  const ask = (piece: string) => {
    save((state = {...state, asked: true}));
    const box = document.createElement('form');
    box.className = 'vt-ask';
    box.setAttribute('aria-label', 'Put your name on it');
    box.innerHTML =
      '<p class="vt-ask__line">Vote counted. Put your name on it?</p>' +
      '<div class="vt-ask__row">' +
      '<input class="vt-ask__field" name="name" maxlength="60" autocomplete="nickname" placeholder="Name or @handle" aria-label="Name or handle">' +
      '<input class="vt-ask__field" name="link" maxlength="200" inputmode="url" autocomplete="url" placeholder="Link to your work (optional)" aria-label="Link to your work">' +
      '</div>' +
      '<label class="vt-ask__check"><input type="checkbox" name="public" checked> Show my name beside my votes (Chris sees each one first)</label>' +
      '<div class="vt-ask__row">' +
      '<input class="vt-ask__field" type="email" name="email" autocomplete="email" placeholder="Email for new work (optional)" aria-label="Email address">' +
      '<button class="vt-ask__yes" type="submit">Done</button>' +
      '<button class="vt-ask__no" type="button">No thanks</button>' +
      '</div>' +
      '<p class="vt-ask__small">All optional. <a href="/privacy-policy">How it is kept</a></p>';
    document.body.append(box);
    const close = () => box.remove();
    box.querySelector('.vt-ask__no')!.addEventListener('click', close);
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(box);
      const name = String(f.get('name') ?? '').trim();
      const email = String(f.get('email') ?? '').trim();
      const said: string[] = [];
      try {
        if (name) {
          const sign: Sign = {name, link: String(f.get('link') ?? '').trim(), public: f.get('public') === 'on'};
          const res = await fetch('/api/votes', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({piece, visitor: state.visitor, on: true, sign}),
          });
          const body = (await res.json().catch(() => ({}))) as {ok?: boolean; signed?: string};
          if (!res.ok || !body.ok) throw new Error();
          save((state = {...state, sign}));
          said.push(body.signed === 'pending' ? 'Your name shows once Chris has seen it.' : body.signed === 'shown' ? 'Your name is on it.' : 'Kept just for Chris.');
        }
        if (email) {
          const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, source: 'votes'}),
          });
          if (!res.ok) throw new Error();
          said.push("You're on the list.");
        }
        close();
        note(said.length ? `Thanks. ${said.join(' ')}` : 'Thanks.');
      } catch {
        note('That did not go through. Please try again.');
      }
    });
  };

  if (on) setOn(true);
}
