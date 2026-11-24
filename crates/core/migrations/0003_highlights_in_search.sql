-- Highlight text and comments become searchable as part of their item.
DROP VIEW item_search_doc;
CREATE VIEW item_search_doc AS
SELECT
  i.id AS id,
  i.title AS title,
  coalesce((SELECT group_concat(a.given || ' ' || a.family, '; ')
            FROM item_authors ia JOIN authors a ON a.id = ia.author_id
            WHERE ia.item_id = i.id), '') AS authors,
  coalesce(i.abstract, '') AS abstract,
  coalesce((SELECT group_concat(n.body, char(10)) FROM notes n WHERE n.item_id = i.id), '') || char(10) ||
  coalesce((SELECT group_concat(coalesce(h.text, '') || ' ' || coalesce(h.comment, ''), char(10))
            FROM highlights h JOIN attachments at ON at.id = h.attachment_id
            WHERE at.item_id = i.id), '') AS notes,
  i.citekey || ' ' || coalesce(i.venue, '') || ' ' || coalesce(i.doi, '') || ' ' || coalesce(i.arxiv_id, '') AS meta
FROM items i;

CREATE TRIGGER highlights_fts_ai AFTER INSERT ON highlights BEGIN
  DELETE FROM items_fts WHERE rowid = (SELECT item_id FROM attachments WHERE id = new.attachment_id);
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc
  WHERE id = (SELECT item_id FROM attachments WHERE id = new.attachment_id);
END;
CREATE TRIGGER highlights_fts_au AFTER UPDATE ON highlights BEGIN
  DELETE FROM items_fts WHERE rowid = (SELECT item_id FROM attachments WHERE id = new.attachment_id);
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc
  WHERE id = (SELECT item_id FROM attachments WHERE id = new.attachment_id);
END;
CREATE TRIGGER highlights_fts_ad AFTER DELETE ON highlights BEGIN
  DELETE FROM items_fts WHERE rowid = (SELECT item_id FROM attachments WHERE id = old.attachment_id);
  INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
  SELECT id, title, authors, abstract, notes, meta FROM item_search_doc
  WHERE id = (SELECT item_id FROM attachments WHERE id = old.attachment_id);
END;

DELETE FROM items_fts;
INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
SELECT id, title, authors, abstract, notes, meta FROM item_search_doc;

CREATE INDEX ix_highlights_attachment ON highlights(attachment_id);
CREATE INDEX ix_note_links_item ON note_links(target_item_id);
CREATE INDEX ix_note_links_note_target ON note_links(target_note_id);
CREATE INDEX ix_notes_item ON notes(item_id);
