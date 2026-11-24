-- A project's spine: the ordered steps of its argument, each holding one or more papers.
CREATE TABLE spine_steps(
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT
);
CREATE INDEX ix_spine_steps_project ON spine_steps(project_id, position);

CREATE TABLE spine_items(
  step_id INTEGER NOT NULL REFERENCES spine_steps(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  -- order within the step
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(step_id, item_id)
);
CREATE INDEX ix_spine_items_item ON spine_items(item_id);
