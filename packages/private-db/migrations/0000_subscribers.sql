-- M1-02 (#18): the private database, bd-private. Subscriber data lives
-- here and nowhere else (ADR 0012, 0019). Migrations only add.
-- Times are epoch milliseconds. Ids are text, made by the pipeline.
-- No foreign keys and CHECKs for enums, as in the content database.
-- docs/schema.md describes each table.

-- One address on the mailing list.
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL,
  edition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  added_via TEXT NOT NULL,
  added_by TEXT,
  added_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER,
  bounces_in_a_row INTEGER NOT NULL DEFAULT 0,
  stopped_at INTEGER,
  CONSTRAINT subscribers_lang CHECK (lang IN ('en', 'zh', 'ja')),
  CONSTRAINT subscribers_edition CHECK (edition IN ('morning', 'weekly')),
  CONSTRAINT subscribers_status CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  CONSTRAINT subscribers_added_via CHECK (added_via IN ('form', 'desk')),
  CONSTRAINT subscribers_added_by CHECK ((added_via = 'desk') = (added_by IS NOT NULL)),
  CONSTRAINT subscribers_bounces CHECK (bounces_in_a_row >= 0)
);

CREATE INDEX IF NOT EXISTS subscribers_list ON subscribers (status, edition);

-- One email sent to the list: an edition or a hand-written one.
CREATE TABLE IF NOT EXISTS sends (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  edition_key TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sending',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  CONSTRAINT sends_kind CHECK (kind IN ('morning', 'weekly', 'notice', 'correction', 'announcement', 'letter')),
  CONSTRAINT sends_status CHECK (status IN ('sending', 'sent', 'held')),
  CONSTRAINT sends_edition_key CHECK ((kind IN ('morning', 'weekly')) = (edition_key IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS sends_edition ON sends (kind, edition_key) WHERE edition_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sends_created ON sends (created_at);

-- One send to one subscriber. The key makes a second delivery of the same
-- send to the same person impossible.
CREATE TABLE IF NOT EXISTS deliveries (
  send_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (send_id, subscriber_id),
  CONSTRAINT deliveries_status CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced'))
);

CREATE INDEX IF NOT EXISTS deliveries_subscriber ON deliveries (subscriber_id);
