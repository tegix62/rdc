/*
  Picks: what people send from a board (/picks/<code>), and the results
  for Studio's Picks tool. See studio/tools/PicksTool.tsx for what a board
  is - a pitch, a client's picks, or a public vote.

  STORED IN D1, with the enquiries, not in Sanity: the dataset is public,
  and a client's name and note are theirs. Nothing about the sender is
  kept beyond what they typed - no address, no browser details - in line
  with the site's rule on visitors' data. The table is made here on first
  use (db/picks.sql has the same statement, for reference).

  THE BOARD'S OWN FILE. Each board's page is built with /picks/<code>/board.json
  beside it: its kind, whether it is open, which pieces it shows, and the
  SHA-256 of its results key. This Function reads that file (env.ASSETS)
  to check a submission, and to check the key Studio sends for results -
  the key itself is only in the board's private Sanity document.

  POST /api/picks  {board, pieces: string[], name?, note?}
  GET  /api/picks?board=<code>&key=<key>   (Studio; CORS for the Studio's origin)
*/

interface D1Result<T> {
  results: T[];
}
interface D1Database {
  prepare(query: string): {
    bind(...values: unknown[]): {run(): Promise<unknown>; all<T>(): Promise<D1Result<T>>};
    run(): Promise<unknown>;
  };
}

interface Env {
  DB?: D1Database;
  ASSETS: {fetch(request: Request | string): Promise<Response>};
}

interface Context {
  request: Request;
  env: Env;
}

type Board = {kind: 'pitch' | 'picks' | 'vote'; open: boolean; collect: boolean; pieces: string[] | null; keyHash: string};

const STUDIO = ['https://rumeau-design-co.sanity.studio', 'http://localhost:3333'];
const MAX_PIECES = 60;

const json = (status: number, body: unknown, request?: Request) => {
  const headers: Record<string, string> = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'};
  const origin = request?.headers.get('origin') ?? '';
  if (STUDIO.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), {status, headers});
};

const CODE = /^[a-z2-9]{10}$/;

async function boardOf(env: Env, request: Request, code: string): Promise<Board | null> {
  if (!CODE.test(code)) return null;
  const res = await env.ASSETS.fetch(new URL(`/picks/${code}/board.json`, request.url).toString());
  if (!res.ok) return null;
  try {
    return (await res.json()) as Board;
  } catch {
    return null;
  }
}

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');

const TABLE = `CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,
  pieces TEXT NOT NULL,
  name TEXT,
  note TEXT,
  submitted_at TEXT NOT NULL
)`;

export const onRequestPost = async ({request, env}: Context): Promise<Response> => {
  if (!env.DB) return json(503, {ok: false, message: 'Picks are not switched on here yet.'});
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, {ok: false, message: 'Something was wrong with that request.'});
  }
  const code = String(body.board ?? '');
  const board = await boardOf(env, request, code);
  if (!board) return json(404, {ok: false, message: 'This link is not taking picks.'});
  if (!board.open || !board.collect) return json(403, {ok: false, message: 'This link has closed.'});

  const allowed = board.pieces ? new Set(board.pieces) : null;
  const pieces = [...new Set((Array.isArray(body.pieces) ? body.pieces : []).map(String))]
    .filter((id) => /^[\w.-]{1,80}$/.test(id) && (!allowed || allowed.has(id)))
    .slice(0, MAX_PIECES);
  if (!pieces.length) return json(400, {ok: false, message: 'Pick at least one piece first.'});
  // A vote asks for no name; a name or note sent anyway is not kept.
  const name = board.kind === 'vote' ? null : String(body.name ?? '').trim().slice(0, 120) || null;
  const note = board.kind === 'vote' ? null : String(body.note ?? '').trim().slice(0, 2000) || null;

  try {
    await env.DB.prepare(TABLE).run();
    await env.DB.prepare('INSERT INTO picks (board, pieces, name, note, submitted_at) VALUES (?, ?, ?, ?, ?)')
      .bind(code, JSON.stringify(pieces), name, note, new Date().toISOString())
      .run();
  } catch {
    return json(500, {ok: false, message: 'Something went wrong. Please try again.'});
  }
  return json(200, {ok: true});
};

export const onRequestGet = async ({request, env}: Context): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get('board') ?? '';
  const key = url.searchParams.get('key') ?? '';
  const board = await boardOf(env, request, code);
  if (!board || !key || (await sha256(key)) !== board.keyHash) return json(404, {message: 'No such board, or the wrong key.'}, request);
  if (!env.DB) return json(503, {message: 'The database is not connected to this deployment.'}, request);
  try {
    await env.DB.prepare(TABLE).run();
    const rows = (
      await env.DB.prepare('SELECT pieces, name, note, submitted_at FROM picks WHERE board = ? ORDER BY submitted_at DESC')
        .bind(code)
        .all<{pieces: string; name: string | null; note: string | null; submitted_at: string}>()
    ).results;
    const tally = new Map<string, number>();
    const entries = rows.map((r) => {
      const pieces = JSON.parse(r.pieces) as string[];
      for (const id of pieces) tally.set(id, (tally.get(id) ?? 0) + 1);
      return {at: r.submitted_at, name: r.name ?? undefined, note: r.note ?? undefined, pieces};
    });
    const counts = [...tally].map(([id, n]) => ({id, n})).sort((a, z) => z.n - a.n);
    return json(200, {total: rows.length, counts, entries}, request);
  } catch {
    return json(500, {message: 'Could not read the results.'}, request);
  }
};

export const onRequestOptions = async ({request}: Context): Promise<Response> => {
  const origin = request.headers.get('origin') ?? '';
  return new Response(null, {
    status: 204,
    headers: STUDIO.includes(origin) ? {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET', 'Vary': 'Origin'} : {},
  });
};
