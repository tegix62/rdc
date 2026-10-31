/*
  Signed votes: the public list, and Chris's say on each name.
  See src/lib/endorse.ts for the idea, functions/api/votes.ts for where a
  signature comes in.

  GET /api/endorse                          -> {names: [{piece, name, link}]}
      the public, approved names against each piece they voted for. Asked
      only when someone turns Votes on, so it costs a Function request then
      and never on an ordinary visit.
  GET /api/endorse?v=&do=show|hide&sig=     -> a page with one button
  POST the same                             -> done
      from the email a new public name sends Chris. A page and a button
      rather than acting on the link: mail scanners open links by themselves,
      and one would approve every name.
*/
import {signLink, escapeHtml} from '../../src/lib/endorse.ts';

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{results: T[]}>;
  first<T>(): Promise<T | null>;
}
interface D1Database {
  prepare(query: string): D1Statement;
}
interface Env {
  DB?: D1Database;
  RESEND_API_KEY?: string;
  ENDORSE_KEY?: string;
}
interface Context {
  request: Request;
  env: Env;
}

const VISITOR = /^[a-z0-9]{16,40}$/;
const ACTS: Record<string, {status: string; button: string; done: string}> = {
  show: {status: 'shown', button: 'Show their name', done: 'Their name now shows beside their votes.'},
  hide: {status: 'hidden', button: 'Keep it off', done: 'Their votes still count; their name stays off the site.'},
};

const page = (status: number, body: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
      `<title>Votes - Rumeau Design Co</title>` +
      `<style>body{font:17px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#1a1a1a}button{font:inherit;padding:.7rem 1.2rem;background:#002885;color:#fff;border:0;cursor:pointer}a{color:#002885}</style>` +
      body,
    {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}},
  );

// The request's own link, checked: whose name, which choice, and signed by the server.
async function readLink(request: Request, env: Env) {
  const q = new URL(request.url).searchParams;
  const visitor = q.get('v') ?? '';
  const act = q.get('do') ?? '';
  const sig = q.get('sig') ?? '';
  if (!VISITOR.test(visitor) || !ACTS[act] || !sig) return null;
  const want = await signLink(env, visitor, act);
  if (!want || want !== sig) return null;
  return {visitor, act};
}

export const onRequestGet = async ({request, env}: Context): Promise<Response> => {
  const q = new URL(request.url).searchParams;
  if (q.has('v')) {
    if (!env.DB) return page(503, '<p>The database is not connected here.</p>');
    const link = await readLink(request, env);
    if (!link) return page(403, '<p>That link is not valid.</p>');
    const who = await env.DB.prepare('SELECT name, link, status FROM vote_signers WHERE visitor = ?').bind(link.visitor).first<{name: string; link: string; status: string}>();
    if (!who) return page(404, '<p>That name is no longer there.</p>');
    if (who.status === 'private') return page(200, `<p><strong>${escapeHtml(who.name)}</strong> has since chosen to keep their name just for you.</p>`);
    const site = who.link ? ` (<a href="${escapeHtml(who.link)}">${escapeHtml(who.link)}</a>)` : '';
    const now = who.status === 'shown' ? 'It shows now.' : who.status === 'hidden' ? 'It is kept off now.' : 'It is waiting on you.';
    return page(
      200,
      `<p><strong>${escapeHtml(who.name)}</strong>${site} asked for their name to show beside their votes. ${now}</p>` +
        `<form method="post"><button>${ACTS[link.act].button}</button></form>`,
    );
  }

  if (!env.DB) return Response.json({names: []}, {headers: {'Cache-Control': 'no-store'}});
  try {
    const names = (
      await env.DB.prepare(
        `SELECT v.piece AS piece, s.name AS name, s.link AS link FROM votes v JOIN vote_signers s ON s.visitor = v.visitor
         WHERE s.status = 'shown' ORDER BY v.voted_at DESC LIMIT 2000`,
      ).all<{piece: string; name: string; link: string}>()
    ).results;
    return Response.json({names}, {headers: {'Cache-Control': 'public, max-age=120'}});
  } catch {
    // No votes table yet: nobody has voted.
    return Response.json({names: []}, {headers: {'Cache-Control': 'no-store'}});
  }
};

export const onRequestPost = async ({request, env}: Context): Promise<Response> => {
  if (!env.DB) return page(503, '<p>The database is not connected here.</p>');
  const link = await readLink(request, env);
  if (!link) return page(403, '<p>That link is not valid.</p>');
  const act = ACTS[link.act];
  // Not over a choice they have since made private.
  await env.DB.prepare("UPDATE vote_signers SET status = ? WHERE visitor = ? AND status != 'private'").bind(act.status, link.visitor).run();
  return page(200, `<p>Done. ${act.done}</p><p><a href="/portfolio?view=all&vote=1">See the votes</a></p>`);
};
