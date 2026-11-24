-- Each project has a color (the graph fills its papers with it; the sidebar shows it).
-- Existing projects get distinct colors in creation order; new ones get the least used.
ALTER TABLE projects ADD COLUMN color TEXT;
UPDATE projects SET color = CASE (
  SELECT count(*) FROM projects p2 WHERE p2.id < projects.id) % 7
  WHEN 0 THEN 'blue' WHEN 1 THEN 'orange' WHEN 2 THEN 'teal' WHEN 3 THEN 'purple'
  WHEN 4 THEN 'red' WHEN 5 THEN 'green' ELSE 'yellow' END;
