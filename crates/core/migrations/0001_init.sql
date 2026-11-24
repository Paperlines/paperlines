CREATE TABLE items(
  id INTEGER PRIMARY KEY,
  item_type TEXT NOT NULL DEFAULT 'article',
  citekey TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  title_norm TEXT NOT NULL,
  year INTEGER,
  pub_date TEXT,
  venue TEXT,
  doi TEXT,
  arxiv_id TEXT,
  url TEXT,
  abstract TEXT,
  read_status TEXT NOT NULL DEFAULT 'unread' CHECK(read_status IN ('unread','reading','read')),
  rating INTEGER CHECK(rating BETWEEN 0 AND 5),
  date_added TEXT NOT NULL DEFAULT (datetime('now')),
  date_modified TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ix_items_doi ON items(doi) WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX ix_items_arxiv ON items(arxiv_id) WHERE arxiv_id IS NOT NULL;
CREATE INDEX ix_items_title ON items(title_norm, year);

CREATE TABLE authors(
  id INTEGER PRIMARY KEY,
  family TEXT NOT NULL,
  given TEXT NOT NULL DEFAULT '',
  name_norm TEXT NOT NULL,
  UNIQUE(family, given)
);
CREATE TABLE item_authors(
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  position INTEGER NOT NULL,
  PRIMARY KEY(item_id, position)
);

CREATE TABLE tags(
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  color TEXT
);
CREATE TABLE item_tags(
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(item_id, tag_id)
);

CREATE TABLE projects(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);
CREATE TABLE project_items(
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position INTEGER,
  status TEXT,
  PRIMARY KEY(project_id, item_id)
);

CREATE TABLE attachments(
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'pdf',
  content_hash TEXT NOT NULL,
  filename TEXT,
  size INTEGER,
  page_count INTEGER,
  fulltext TEXT
);
CREATE INDEX ix_attachments_item ON attachments(item_id);
CREATE INDEX ix_attachments_hash ON attachments(content_hash);

CREATE TABLE highlights(
  id INTEGER PRIMARY KEY,
  attachment_id INTEGER NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('highlight','underline','rect')),
  rects TEXT NOT NULL,
  text TEXT,
  color TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE highlight_tags(
  highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(highlight_id, tag_id)
);

CREATE TABLE notes(
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('paper_note','free','project')),
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  highlight_id INTEGER REFERENCES highlights(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(kind <> 'paper_note' OR item_id IS NOT NULL)
);
CREATE UNIQUE INDEX ux_one_paper_note ON notes(item_id) WHERE kind = 'paper_note';
CREATE TABLE note_tags(
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(note_id, tag_id)
);
CREATE TABLE note_links(
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  target_note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  raw TEXT NOT NULL
);
CREATE INDEX ix_note_links_note ON note_links(note_id);

CREATE TABLE reference_cache(
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  refs_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('openalex','semantic_scholar','grobid')),
  fetched_at TEXT NOT NULL
);

CREATE TABLE citation_edges(
  citing_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  cited_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('openalex','semantic_scholar','grobid','manual')),
  is_manual INTEGER NOT NULL DEFAULT 0,
  is_suppressed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(citing_item_id, cited_item_id),
  CHECK(citing_item_id <> cited_item_id)
);
CREATE INDEX ix_edges_cited ON citation_edges(cited_item_id);

CREATE TABLE saved_searches(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  query TEXT NOT NULL
);
CREATE TABLE settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_fts USING fts5(
  kind UNINDEXED, ref_id UNINDEXED, title, authors, abstract, body,
  tokenize = 'unicode61 remove_diacritics 2'
);
