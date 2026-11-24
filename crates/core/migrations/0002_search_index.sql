-- One full-text document per item (rowid = item id), kept current by triggers.
DROP TABLE search_fts;

CREATE VIRTUAL TABLE items_fts USING fts5(
  title, authors, abstract, notes, meta,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

CREATE VIEW item_search_doc AS
SELECT
  i.id AS id,
  i.title AS title,
  coalesce((SELECT group_concat(a.given || ' ' || a.family, '; ')
            FROM item_authors ia JOIN authors a ON a.id = ia.author_id
            WHERE ia.item_id = i.id), '') AS authors,
  coalesce(i.abstract, '') AS abstract,
  coalesce((SELECT group_concat(n.body, char(10)) FROM notes n WHERE n.item_id = i.id), '') AS notes,
  i.citekey || ' ' || coalesce(i.venue, '') || ' ' || coalesce(i.doi, '') || ' ' || coalesce(i.arxiv_id, '') AS meta
FROM items i;

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc WHERE id = new.id;
END;
CREATE TRIGGER items_fts_au AFTER UPDATE ON items BEGIN
  DELETE FROM items_fts WHERE rowid = old.id;
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc WHERE id = new.id;
END;
CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE rowid = old.id;
END;

CREATE TRIGGER item_authors_fts_ai AFTER INSERT ON item_authors BEGIN
  DELETE FROM items_fts WHERE rowid = new.item_id;
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc WHERE id = new.item_id;
END;
CREATE TRIGGER item_authors_fts_ad AFTER DELETE ON item_authors BEGIN
  DELETE FROM items_fts WHERE rowid = old.item_id;
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc WHERE id = old.item_id;
END;

CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes WHEN new.item_id IS NOT NULL AND new.body <> '' BEGIN
  DELETE FROM items_fts WHERE rowid = new.item_id;
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc WHERE id = new.item_id;
END;
CREATE TRIGGER notes_fts_au AFTER UPDATE ON notes BEGIN
  DELETE FROM items_fts WHERE rowid IN (old.item_id, new.item_id);
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc WHERE id IN (old.item_id, new.item_id);
END;
CREATE TRIGGER notes_fts_ad AFTER DELETE ON notes WHEN old.item_id IS NOT NULL BEGIN
  DELETE FROM items_fts WHERE rowid = old.item_id;
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc WHERE id = old.item_id;
END;

INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
SELECT id, title, authors, abstract, notes, meta FROM item_search_doc;

CREATE INDEX ix_item_tags_tag ON item_tags(tag_id);
CREATE INDEX ix_project_items_item ON project_items(item_id);
CREATE INDEX ix_item_authors_author ON item_authors(author_id);
