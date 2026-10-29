/*
  Votes: "I dig this" on any piece of the portfolio, for anyone. Chris: "a
  tertiary button ... anyone can press ... a simple upvoting system would be
  rad ... protect it from spam ... remembers people." See src/lib/votes.ts
  for the page's side.

  WHO IS WHO, AND WHAT IS KEPT. A person is the random id their browser
  makes on their first vote (kept in the browser): that is what remembers
  them from visit to visit, and what one vote per piece is counted against.
  Their IP address is used for one thing, limits against vote-stuffing, and
  never stored as it is: only a hash of it under a salt made fresh each day
  and thrown away the day after, so a day's hashes cannot be turned back
  into addresses or matched with any other day's. That keeps the site's rule
  on visitors' data - no address kept - while still noticing one connection
  voting a hundred times. Stored with the enquiries in D1, never in Sanity.

  SPAM. Every connection gets a day's allowance, and one piece counts at
  most a few times from one connection a day (a household or an office can
  share an address; a script hammering one piece cannot pass it off as many
  people). A browser that has passed Cloudflare Turnstile - once, on its
  first vote, when the site has a Turnstile key - gets the larger allowance.
  Votes over a limit are answered as if counted and not kept, so there is
  nothing to probe.

  POST /api/votes  {piece, visitor, on, token?}  -> {ok, on, verified}
  GET  /api/votes                                 -> {total, voters, counts: [{id, n}]}
       (public: counts per piece, nothing about anyone; Studio's Picks tool reads it)
*/

interface D1Result<T> {
  results: T[];
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
}
interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface Env {
  DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
}

interface Context {
  request: Request;
  env: Env;
}

const STUDIO = ['https://rumeau-design-co.sanity.studio', 'http://localhost:3333'];

// A day's allowance per connection: votes in all, and the times one piece counts.
const LIMIT = {checked: {day: 400, piece: 4}, unchecked: {day: 60, piece: 2}};

const PIECE = /^[\w.-]{1,80}$/;
const VISITOR = /^[a-z0-9]{16,40}$/;

const json = (status: number, body: unknown, request?: Request, cache = 'no-store') => {
  const headers: Record<string, string> = {'Content-Type': 'application/json', 'Cache-Control': cache};
  const origin = request?.headers.get('origin') ?? '';
  if (STUDIO.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), {status, headers});
};

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

const TABLES = [
  `CREATE TABLE IF NOT EXISTS votes (
    piece TEXT NOT NULL,
    visitor TEXT NOT NULL,
    day TEXT NOT NULL,
    conn TEXT NOT NULL,
    voted_at TEXT NOT NULL,
    PRIMARY KEY (piece, visitor)
  )`,
  'CREATE INDEX IF NOT EXISTS votes_conn ON votes (day, conn)',
  `CREATE TABLE IF NOT EXISTS vote_visitors (
    visitor TEXT PRIMARY KEY,
    checked_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS vote_salts (
    day TEXT PRIMARY KEY,
    salt TEXT NOT NULL
  )`,
];

const ready = async (db: D1Database) => {
  for (const t of TABLES) await db.prepare(t).run();
};

// Today's salt, made on the day's first vote; yesterday's and older are deleted.
const saltOf = async (db: D1Database, day: string) => {
  const row = await db.prepare('SELECT salt FROM vote_salts WHERE day = ?').bind(day).first<{salt: string}>();
  if (row) return row.salt;
  const fresh = hex(crypto.getRandomValues(new Uint8Array(24)).buffer as ArrayBuffer);
  await db.prepare('INSERT OR IGNORE INTO vote_salts (day, salt) VALUES (?, ?)').bind(day, fresh).run();
  await db.prepare('DELETE FROM vote_salts WHERE day < ?').bind(day).run();
  return (await db.prepare('SELECT salt FROM vote_salts WHERE day = ?').bind(day).first<{salt: string}>())?.salt ?? fresh;
};

const turnstile = async (secret: string, token: string, ip: string) => {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({secret, response: token, remoteip: ip}),
    });
    return Boolean(((await res.json()) as {success?: boolean}).success);
  } catch {
    return false;
  }
};

export const onRequestPost = async ({request, env}: Context): Promise<Response> => {
  if (!env.DB) return json(503, {ok: false, message: 'Votes are not switched on here yet.'});
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, {ok: false, message: 'Something was wrong with that request.'});
  }
  const piece = String(body.piece ?? '');
  const visitor = String(body.visitor ?? '');
  const on = body.on !== false;
  if (!PIECE.test(piece) || !VISITOR.test(visitor)) return json(400, {ok: false, message: 'Something was wrong with that request.'});

  const db = env.DB;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('x-real-ip') ?? 'unknown';
  try {
    await ready(db);

    // Passed Turnstile before, or passing it now.
    let checked = Boolean(await db.prepare('SELECT 1 AS y FROM vote_visitors WHERE visitor = ?').bind(visitor).first());
    const secret = (env.TURNSTILE_SECRET_KEY ?? '').trim();
    const token = typeof body.token === 'string' ? body.token : '';
    if (!checked && secret && token && (await turnstile(secret, token, ip))) {
      await db.prepare('INSERT OR IGNORE INTO vote_visitors (visitor, checked_at) VALUES (?, ?)').bind(visitor, now.toISOString()).run();
      checked = true;
    }

    if (!on) {
      await db.prepare('DELETE FROM votes WHERE piece = ? AND visitor = ?').bind(piece, visitor).run();
      return json(200, {ok: true, on: false, verified: checked});
    }

    const conn = (await sha256(`${await saltOf(db, day)}:${ip}`)).slice(0, 20);
    const limit = checked ? LIMIT.checked : LIMIT.unchecked;
    const today = await db
      .prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN piece = ? THEN 1 ELSE 0 END) AS p FROM votes WHERE day = ? AND conn = ?')
      .bind(piece, day, conn)
      .first<{n: number; p: number | null}>();
    if ((today?.n ?? 0) >= limit.day || (today?.p ?? 0) >= limit.piece) {
      // Over the limit: answered as counted, not kept.
      return json(200, {ok: true, on: true, verified: checked});
    }
    await db
      .prepare('INSERT OR IGNORE INTO votes (piece, visitor, day, conn, voted_at) VALUES (?, ?, ?, ?, ?)')
      .bind(piece, visitor, day, conn, now.toISOString())
      .run();
    return json(200, {ok: true, on: true, verified: checked});
  } catch {
    return json(500, {ok: false, message: 'That did not go through. Please try again.'});
  }
};

export const onRequestGet = async ({request, env}: Context): Promise<Response> => {
  if (!env.DB) return json(503, {message: 'The database is not connected to this deployment.'}, request);
  try {
    await ready(env.DB);
    const counts = (
      await env.DB.prepare('SELECT piece AS id, COUNT(*) AS n FROM votes GROUP BY piece ORDER BY n DESC, piece').all<{id: string; n: number}>()
    ).results;
    const voters = (await env.DB.prepare('SELECT COUNT(DISTINCT visitor) AS n FROM votes').first<{n: number}>())?.n ?? 0;
    const total = counts.reduce((s, c) => s + c.n, 0);
    return json(200, {total, voters, counts}, request, 'public, max-age=60');
  } catch {
    return json(500, {message: 'Could not read the votes.'}, request);
  }
};

export const onRequestOptions = async ({request}: Context): Promise<Response> => {
  const origin = request.headers.get('origin') ?? '';
  return new Response(null, {
    status: 204,
    headers: STUDIO.includes(origin) ? {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET', 'Vary': 'Origin'} : {},
  });
};
