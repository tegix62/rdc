/*
  A board's own file, beside its page: what functions/api/picks.ts needs to
  check a submission or a request for results. Its kind, whether it is
  taking responses, which pieces it shows, and the SHA-256 of its results
  key - never the key itself, which stays in the board's private Sanity
  document and Studio. See src/lib/picks.ts.
*/
import type {APIRoute} from 'astro';
import {createHash} from 'node:crypto';
import {getBoards, type Board} from '../../../lib/picks';

export async function getStaticPaths() {
  return (await getBoards()).map((board) => ({params: {code: board.code}, props: {board}}));
}

export const GET: APIRoute = ({props}) => {
  const b = props.board as Board;
  return new Response(
    JSON.stringify({
      kind: b.kind,
      open: b.open !== false,
      collect: b.kind !== 'pitch' || b.collect !== false,
      pieces: b.pieces?.length ? b.pieces : null,
      keyHash: createHash('sha256').update(b.key).digest('hex'),
    }),
    {headers: {'Content-Type': 'application/json'}},
  );
};
