-- Email subscribers, in the same D1 database as enquiries.
--
-- Same privacy reasoning: email addresses belong in D1 (no public read path),
-- not in the public-read Sanity dataset.
--
-- Apply with:
--   npx wrangler d1 execute rdc-enquiries --remote --file=db/subscribers.sql

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  subscribed_at TEXT NOT NULL,

  -- Where on the site they signed up, so you can see which pages convert.
  source TEXT
);
