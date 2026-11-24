-- Papers an assistant suggested for a project (or the library as a whole, project_id NULL).
-- They wait here until the user adds or dismisses them; dismissed ones stay, so they are not
-- suggested again. `key` identifies the paper (doi:…, arxiv:… or title:…).
CREATE TABLE suggestions(
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  doi TEXT,
  arxiv_id TEXT,
  title TEXT NOT NULL,
  authors TEXT,
  year INTEGER,
  venue TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'added', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_suggestions_key ON suggestions(coalesce(project_id, 0), key);
CREATE INDEX ix_suggestions_project ON suggestions(project_id, status);
