/*
  The picks boards, for the build: a pitch, a client's picks or a public
  vote, each made in Studio's Picks tool (studio/tools/PicksTool.tsx) and
  built into a page at /picks/<code>.

  Boards live at _id "picks.<code>", which a public dataset does not serve
  without signing in - so this reads them with the build's token
  (SANITY_API_TOKEN, set on the preview build's workflow). No token, or a
  production build while this is a preview trial: no boards, no pages.
*/
import {createClient} from '@sanity/client';

export type Board = {
  code: string;
  kind: 'pitch' | 'picks' | 'vote';
  heading?: string;
  note?: string;
  pieces?: string[];
  collect?: boolean;
  open?: boolean;
  key: string;
};

let boards: Promise<Board[]> | null = null;

export function getBoards(): Promise<Board[]> {
  const token = import.meta.env.SANITY_API_TOKEN ?? process.env.SANITY_API_TOKEN;
  if (import.meta.env.PUBLIC_IS_PREVIEW !== 'true' || !token) return Promise.resolve([]);
  boards ??= createClient({projectId: '8337vjtf', dataset: 'production', apiVersion: '2024-01-01', useCdn: false, token, perspective: 'raw'})
    .fetch<Board[]>(`*[_type == "picksBoard" && _id in path("picks.**") && defined(code) && defined(key)]{code, kind, heading, note, pieces, collect, open, key}`)
    .then((all) => all.filter((b) => /^[a-z2-9]{10}$/.test(b.code)));
  return boards;
}
