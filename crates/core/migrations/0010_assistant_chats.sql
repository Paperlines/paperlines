-- Conversations with the assistant panel's agent (Claude Code, Codex), kept so they can be read
-- and continued later. `session` is the agent's own id for resuming; `messages` is the panel's
-- transcript (JSON). A chat can be about a paper or a note; it stays if that is deleted.
CREATE TABLE assistant_chats(
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  session TEXT,
  title TEXT NOT NULL,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  messages TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_assistant_chats_updated ON assistant_chats(updated_at);
CREATE INDEX ix_assistant_chats_item ON assistant_chats(item_id);
CREATE INDEX ix_assistant_chats_note ON assistant_chats(note_id);
