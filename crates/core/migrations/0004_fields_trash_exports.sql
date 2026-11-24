-- Richer bibliographic fields (used by citation styles and exports).
ALTER TABLE items ADD COLUMN volume TEXT;
ALTER TABLE items ADD COLUMN issue TEXT;
ALTER TABLE items ADD COLUMN pages TEXT;
ALTER TABLE items ADD COLUMN publisher TEXT;
ALTER TABLE items ADD COLUMN place TEXT;
ALTER TABLE items ADD COLUMN isbn TEXT;
ALTER TABLE items ADD COLUMN issn TEXT;
ALTER TABLE items ADD COLUMN edition TEXT;
ALTER TABLE items ADD COLUMN language TEXT;
ALTER TABLE items ADD COLUMN series TEXT;
ALTER TABLE items ADD COLUMN number TEXT;

-- Trash: deleted papers keep everything until purged.
ALTER TABLE items ADD COLUMN deleted_at TEXT;
CREATE INDEX ix_items_deleted ON items(deleted_at);

-- Editors (and future roles) next to authors.
ALTER TABLE item_authors ADD COLUMN role TEXT NOT NULL DEFAULT 'author';

-- Files that are rewritten whenever the library changes (Better BibTeX style).
CREATE TABLE auto_exports(
  id INTEGER PRIMARY KEY,
  format TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_value TEXT,
  path TEXT NOT NULL UNIQUE,
  last_written TEXT,
  last_error TEXT
);

-- Pairs the user marked as "not duplicates".
CREATE TABLE dismissed_duplicates(
  a INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  b INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY(a, b),
  CHECK(a < b)
);
