-- The enquiries table, in Cloudflare D1.
--
-- WHY D1 AND NOT SANITY
--
-- These rows are the most sensitive data this project holds: real names, email
-- addresses, phone numbers, budgets, and a description of someone's business.
-- They lived in Sanity briefly and should not have: that dataset is
-- public-read, the project ID and dataset name are committed in a public
-- repository, and so every enquiry was readable by anyone with no credentials.
-- Sanity's public/private switch is per-dataset and private datasets are a
-- paid tier, so there was no free way to keep content public and enquiries
-- private in one dataset.
--
-- D1 has no public read path at all. A row is reachable only through a Worker
-- or Function with the database bound to it, or through the Cloudflare
-- dashboard behind Chris's own login. That is the property being bought here,
-- and it is the reason for the move - not performance, not cost.
--
-- Sanity remains the CMS for every page, post and case study. Nothing about
-- editing the website changes.
--
-- Apply with:
--   npx wrangler d1 execute rdc-enquiries --remote --file=parked/contact-form/schema.sql

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- ISO 8601, written by the Function rather than defaulted here, so the
  -- timestamp is the moment the enquiry was accepted rather than the moment
  -- SQLite happened to insert it. Also keeps the value identical to the one
  -- put in the notification email.
  submitted_at TEXT NOT NULL,

  -- new | replied | archived. The pipeline state Studio used to provide, kept
  -- because it is the only field here that is genuinely mutable - everything
  -- else is a record of what somebody typed and must not be edited after the
  -- fact.
  status TEXT NOT NULL DEFAULT 'new',

  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  business_description TEXT,
  goals TEXT,

  -- 0-10 self-rating. INTEGER not TEXT: it is sorted and compared, and storing
  -- it as text sorts "10" before "2".
  seriousness INTEGER,

  timeframe TEXT,

  -- Whole dollars. Nullable because "not sure yet" is a real answer and
  -- storing 0 for it would be indistinguishable from an actual zero budget -
  -- exactly the Number('') === 0 bug the validation tests already caught once.
  budget_min INTEGER,
  budget_max INTEGER,

  -- SQLite has no boolean; 0/1 with a CHECK so a stray value cannot creep in.
  budget_open_ended INTEGER NOT NULL DEFAULT 0 CHECK (budget_open_ended IN (0, 1)),
  budget_not_sure INTEGER NOT NULL DEFAULT 0 CHECK (budget_not_sure IN (0, 1)),

  found_via TEXT,
  phone TEXT
);

-- The admin list is "newest first, optionally filtered by status", and that is
-- the only read pattern there is. One index covering both beats two.
CREATE INDEX IF NOT EXISTS idx_enquiries_status_submitted
  ON enquiries (status, submitted_at DESC);
