-- Typed connections between papers ("extends", "contradicts", ...), set by the user, separate from
-- citation links. Built-in types can be renamed or recolored but not deleted.
CREATE TABLE relation_types(
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  -- how the connection reads from the other paper ("Extended by"); NULL: same both ways
  inverse_label TEXT,
  color TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
INSERT INTO relation_types(key, label, inverse_label, color, builtin, sort) VALUES
  ('extends', 'Extends', 'Extended by', 'blue', 1, 1),
  ('contradicts', 'Contradicts', 'Contradicted by', 'red', 1, 2),
  ('replicates', 'Replicates', 'Replicated by', 'green', 1, 3),
  ('applies_method', 'Applies method of', 'Method applied by', 'purple', 1, 4);

CREATE TABLE relations(
  id INTEGER PRIMARY KEY,
  from_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  to_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  type_id INTEGER NOT NULL REFERENCES relation_types(id) ON DELETE CASCADE,
  note TEXT,
  -- a highlight (in either paper) that supports the connection
  evidence_highlight_id INTEGER REFERENCES highlights(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_item_id, to_item_id, type_id),
  CHECK(from_item_id <> to_item_id)
);
CREATE INDEX ix_relations_to ON relations(to_item_id);
