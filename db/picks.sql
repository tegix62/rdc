-- What people send from a picks board (/picks/<code>): a client's favourites,
-- or a vote. See functions/api/picks.ts, which makes this table on first use
-- with the same statement, and studio/tools/PicksTool.tsx, which reads it back.
--
-- No sender details beyond what they typed: a vote keeps no name or note.
--
-- Apply by hand, if ever needed, with:
--   npx wrangler d1 execute rdc-enquiries --remote --file=db/picks.sql

CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The board's code, from its address.
  board TEXT NOT NULL,
  -- The chosen pieces' Sanity ids, as a JSON array.
  pieces TEXT NOT NULL,
  name TEXT,
  note TEXT,
  -- ISO 8601, written by the Function.
  submitted_at TEXT NOT NULL
);
