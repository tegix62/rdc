/*
  VOTES, the page's side - "I dig this" on any piece of the portfolio.
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
  - One "I dig this" button, made here, goes into whichever piece is open:
    an expanded tile on the grids (.pf-item.is-expanded), a grown piece on
    All (.wd-piece.is-open). Pressed again, the vote is taken back.
  - Who is who: a random id this browser keeps, and the pieces it dug, so
    the buttons say "You dig this" on the next visit too. The server's side,
    and what it keeps and does not, is in functions/api/votes.ts.
  - Spam: on this browser's first vote, Cloudflare Turnstile runs out of
    sight when the site has a key (PUBLIC_TURNSTILE_SITE_KEY); passed once,
    never asked again. Without a key, or if it fails, the vote still goes,
    under the server's tighter limits.
  - The email: after the first vote has been saved, once, a small box asks
    for an address for new work. "No thanks" and it never asks again; the
    vote was already kept either way. It goes to the same list as the blog's
    sign-up (/api/subscribe, source "votes").

  Browser storage is a convenience here (Chris's own record is the
  database), so every read and write is guarded and the page works without.
*/

const KEY = 'rdc-votes';
const SITE_KEY = (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';

type Saved = {visitor: string; dug: string[]; checked?: boolean; asked?: boolean};

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

  const paint = () => {
    const dug = !!current && state.dug.includes(current.id);
    button.setAttribute('aria-pressed', String(dug));
    label.textContent = dug ? 'You dig this' : 'I dig this';
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
    try {
      const t = dig && !state.checked ? await token() : '';
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({piece: id, visitor: state.visitor, on: dig, token: t || undefined}),
      });
      const body = (await res.json().catch(() => ({}))) as {ok?: boolean; verified?: boolean};
      if (!res.ok || !body.ok) throw new Error('not kept');
      if (body.verified && !state.checked) save((state = {...state, checked: true}));
      if (first) ask();
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

  // Once, after the first vote is in: an address for new work, or not.
  const ask = () => {
    save((state = {...state, asked: true}));
    const box = document.createElement('form');
    box.className = 'vt-ask';
    box.setAttribute('aria-label', 'Email for new work');
    box.innerHTML =
      '<p class="vt-ask__line">Noted, thanks. Want an email when there is new work?</p>' +
      '<div class="vt-ask__row">' +
      '<input class="vt-ask__email" type="email" name="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address">' +
      '<button class="vt-ask__yes" type="submit">Sign me up</button>' +
      '<button class="vt-ask__no" type="button">No thanks</button>' +
      '</div>' +
      '<p class="vt-ask__small">Only for new work, now and then. <a href="/privacy-policy">How it is kept</a></p>';
    document.body.append(box);
    const close = () => box.remove();
    box.querySelector('.vt-ask__no')!.addEventListener('click', close);
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (box.querySelector('.vt-ask__email') as HTMLInputElement).value.trim();
      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email, source: 'votes'}),
        });
        if (!res.ok) throw new Error();
        close();
        note("You're on the list. Thanks.");
      } catch {
        note('That did not go through. Please try again.');
      }
    });
  };

  if (on) setOn(true);
}
