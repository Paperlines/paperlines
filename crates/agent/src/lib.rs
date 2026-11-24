//! The assistant panel: the user's own Claude Code, run headless with only the Paperlines tools
//! (see `cli`). Replies stream to the panel as `Event`s.
pub mod cli;
pub mod codex;
pub mod config;

use serde::Serialize;

pub use config::AgentConfig;
pub use serde_json::Value;

/// One of the MCP server's tools, as far as the panel needs to know.
#[derive(Debug, Clone)]
pub struct ToolDef {
    pub name: String,
    pub read_only: bool,
}

pub fn tool_defs() -> Vec<ToolDef> {
    paperlines_mcp::tools()
        .as_array()
        .map(|a| {
            a.iter()
                .map(|t| ToolDef {
                    name: t["name"].as_str().unwrap_or_default().into(),
                    read_only: t["annotations"]["readOnlyHint"].as_bool().unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// What the panel shows while a reply is being written.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Event {
    Text {
        delta: String,
    },
    /// A tool started (`input` as the model gave it).
    Tool {
        id: String,
        name: String,
        input: Value,
    },
    ToolDone {
        id: String,
        ok: bool,
        summary: String,
        /// The library changed: the app reloads what it shows.
        changed: bool,
    },
    /// Claude Code's session, to continue the conversation.
    Session {
        id: String,
    },
    Done {
        stop: String,
    },
    Error {
        message: String,
    },
}

/// The user's message with what they have open in front of it.
pub fn with_context(text: &str, context: Option<&str>) -> String {
    match context.map(str::trim).filter(|c| !c.is_empty()) {
        Some(c) => format!("<context>\n{c}\n</context>\n\n{text}"),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_goes_in_front_of_the_message() {
        assert_eq!(
            with_context("hi", Some("Open: @a")),
            "<context>\nOpen: @a\n</context>\n\nhi"
        );
        assert_eq!(with_context("hi", Some("  ")), "hi");
    }

    #[test]
    fn the_library_tools_are_known() {
        let defs = tool_defs();
        assert!(defs.iter().any(|d| d.name == "create_note" && !d.read_only));
        assert!(defs.iter().any(|d| d.name == "search_library" && d.read_only));
    }
}
