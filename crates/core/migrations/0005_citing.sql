-- Papers that cite a library paper ("Find citing papers"), and each paper's OpenAlex work ID,
-- used to tell which citing papers also cite other papers in the library.

-- NULL: not looked up yet; '': looked up, OpenAlex has no such work
ALTER TABLE items ADD COLUMN openalex_id TEXT;
CREATE INDEX ix_items_openalex ON items(openalex_id) WHERE openalex_id IS NOT NULL AND openalex_id <> '';

CREATE TABLE citing_cache(
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('openalex','semantic_scholar')),
  -- how many papers cite it according to the source (the cache may hold fewer)
  total INTEGER NOT NULL,
  works_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

-- a changed DOI or arXiv ID makes both stale
CREATE TRIGGER items_ids_changed AFTER UPDATE OF doi, arxiv_id ON items
WHEN OLD.doi IS NOT NEW.doi OR OLD.arxiv_id IS NOT NEW.arxiv_id
BEGIN
  UPDATE items SET openalex_id = NULL WHERE id = NEW.id;
  DELETE FROM citing_cache WHERE item_id = NEW.id;
END;
