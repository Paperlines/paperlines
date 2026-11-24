//! Saved conversations with the assistant panel's agent. The agent keeps its own history and is
//! resumed by `session`; the panel's transcript is stored as it was shown (`messages`, JSON).
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

/// A chat in the history list (without its transcript).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummary {
    pub id: String,
    pub agent: String,
    pub title: String,
    pub item_id: Option<i64>,
    pub note_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    #[serde(flatten)]
    pub summary: ChatSummary,
    pub session: Option<String>,
    /// The panel's transcript, JSON.
    pub messages: String,
}

/// A chat's title: the first line of its first message, shortened.
pub fn title_of(text: &str) -> String {
    // what the app sends in front of a message is not part of it
    let text = text.rsplit_once("</context>").map_or(text, |(_, rest)| rest);
    let line = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('<'))
        .unwrap_or("New chat");
    if line.chars().count() > 80 {
        format!("{}…", line.chars().take(79).collect::<String>().trim_end())
    } else {
        line.to_string()
    }
}

/// Starts a chat (or touches it). The first call sets its agent, title and what it's about.
pub fn begin(
    conn: &Connection,
    id: &str,
    agent: &str,
    first_message: &str,
    item_id: Option<i64>,
    note_id: Option<i64>,
) -> Result<()> {
    // ids of papers or notes that are gone are left out rather than failing the chat
    let item = item_id.filter(|i| exists(conn, "items", *i));
    let note = note_id.filter(|n| exists(conn, "notes", *n));
    conn.execute(
        "INSERT INTO assistant_chats(id, agent, title, item_id, note_id) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now')",
        params![id, agent, title_of(first_message), item, note],
    )?;
    Ok(())
}

fn exists(conn: &Connection, table: &str, id: i64) -> bool {
    conn.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |_| Ok(()))
        .optional()
        .ok()
        .flatten()
        .is_some()
}

/// Remembers the agent's session for the chat, so it can be resumed after a restart.
pub fn set_session(conn: &Connection, id: &str, agent: &str, session: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE assistant_chats SET session = ?3, agent = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, agent, session],
    )?;
    Ok(())
}

/// The session to resume, when the chat was with this agent.
pub fn session_for(conn: &Connection, id: &str, agent: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT session FROM assistant_chats WHERE id = ?1 AND agent = ?2",
            params![id, agent],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten())
}

/// Stores the panel's transcript (valid JSON, at most 4 MB).
pub fn save_messages(conn: &Connection, id: &str, messages: &str) -> Result<()> {
    if messages.len() > 4 << 20 {
        return Err(Error::msg("This chat is too long to save"));
    }
    serde_json::from_str::<serde_json::Value>(messages)?;
    let n = conn.execute(
        "UPDATE assistant_chats SET messages = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, messages],
    )?;
    if n == 0 {
        return Err(Error::msg("Chat not found"));
    }
    Ok(())
}

fn summary(r: &rusqlite::Row) -> rusqlite::Result<ChatSummary> {
    Ok(ChatSummary {
        id: r.get(0)?,
        agent: r.get(1)?,
        title: r.get(2)?,
        item_id: r.get(3)?,
        note_id: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

/// Every saved chat, the most recent first.
pub fn list(conn: &Connection) -> Result<Vec<ChatSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, agent, title, item_id, note_id, created_at, updated_at FROM assistant_chats
         ORDER BY updated_at DESC, rowid DESC",
    )?;
    let out = stmt.query_map([], summary)?.collect::<rusqlite::Result<_>>()?;
    Ok(out)
}

pub fn get(conn: &Connection, id: &str) -> Result<Chat> {
    conn.query_row(
        "SELECT id, agent, title, item_id, note_id, created_at, updated_at, session, messages
         FROM assistant_chats WHERE id = ?1",
        [id],
        |r| {
            Ok(Chat {
                summary: summary(r)?,
                session: r.get(7)?,
                messages: r.get(8)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| Error::msg("Chat not found"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM assistant_chats WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn chats_are_kept_with_their_session_and_transcript() {
        let db = Db::open_in_memory().unwrap();
        let c = &db.conn;
        let paper = crate::items::insert_item(
            c,
            &crate::model::ItemInput {
                title: "A paper".into(),
                ..Default::default()
            },
        )
        .unwrap();
        begin(
            c,
            "chat-1",
            "claude",
            "<context>\nx\n</context>\n\nSummarize this paper\nplease",
            Some(paper),
            Some(999),
        )
        .unwrap();
        let s = &list(c).unwrap()[0];
        assert_eq!(
            s.title, "Summarize this paper",
            "the context block and later lines are left out"
        );
        assert_eq!(s.item_id, Some(paper));
        assert_eq!(s.note_id, None, "a note that doesn't exist is left out");
        // a second message keeps the title
        begin(c, "chat-1", "claude", "and more", None, None).unwrap();
        assert_eq!(get(c, "chat-1").unwrap().summary.title, "Summarize this paper");
        set_session(c, "chat-1", "claude", Some("s-123")).unwrap();
        assert_eq!(session_for(c, "chat-1", "claude").unwrap().as_deref(), Some("s-123"));
        assert_eq!(
            session_for(c, "chat-1", "codex").unwrap(),
            None,
            "a session belongs to its agent"
        );
        save_messages(c, "chat-1", r#"[{"role":"user","text":"hi"}]"#).unwrap();
        assert!(get(c, "chat-1").unwrap().messages.contains("hi"));
        assert!(save_messages(c, "chat-1", "not json").is_err());
        assert!(save_messages(c, "nope", "[]").is_err());
        // deleting the paper keeps the chat
        c.execute("DELETE FROM items WHERE id = ?1", [paper]).unwrap();
        assert_eq!(get(c, "chat-1").unwrap().summary.item_id, None);
        delete(c, "chat-1").unwrap();
        assert!(list(c).unwrap().is_empty());
        assert_eq!(title_of(&"x".repeat(100)).chars().count(), 80);
    }
}
