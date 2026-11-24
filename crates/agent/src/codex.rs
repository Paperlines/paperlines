//! Codex (OpenAI's coding agent, signed in with the user's ChatGPT account or key) run headless:
//! `codex exec --json`, resuming the thread for each follow-up message.
//!
//! The JSON events follow Codex's documented shape (`thread.started`, `item.started`,
//! `item.completed`, `turn.completed`, `turn.failed`, `error`); fields the docs don't spell out
//! (an MCP call's result, an error's message) are read leniently.
use crate::cli::{instructions, Stream};
use crate::Event;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

const SERVER: &str = "paperlines";

/// A TOML value for a `-c key=value` override (a JSON string is a valid TOML string).
fn toml_str(s: &str) -> String {
    Value::String(s.into()).to_string()
}

pub fn args(mcp_command: &Path, session: Option<&str>, allow_writes: bool) -> Vec<String> {
    let cmd = mcp_command.to_string_lossy();
    let mut a = vec![
        "exec".to_string(),
        "--json".into(),
        "--skip-git-repo-check".into(),
        // its shell can't change anything; the library changes only through our tools
        "--sandbox".into(),
        "read-only".into(),
        "-c".into(),
        format!("mcp_servers.{SERVER}.command={}", toml_str(&cmd)),
        "-c".into(),
        format!("mcp_servers.{SERVER}.args=[\"mcp\"]"),
        // nobody is there to answer a prompt: the panel's Read only / Can edit decides instead
        "-c".into(),
        format!("mcp_servers.{SERVER}.default_tools_approval_mode=\"approve\""),
    ];
    if !allow_writes {
        let tools: Vec<String> = crate::tool_defs()
            .iter()
            .filter(|t| t.read_only)
            .map(|t| toml_str(&t.name))
            .collect();
        a.push("-c".into());
        a.push(format!("mcp_servers.{SERVER}.enabled_tools=[{}]", tools.join(",")));
    }
    if let Some(s) = session {
        a.push("resume".into());
        a.push(s.into());
    }
    // the prompt comes on stdin
    a.push("-".into());
    a
}

/// Codex has no flag for extra instructions in exec mode, so the first message carries them.
pub fn prompt(text: &str, first: bool, allow_writes: bool) -> String {
    if first {
        format!(
            "<app-instructions>\n{}\n</app-instructions>\n\n{text}",
            instructions(allow_writes)
        )
    } else {
        text.to_string()
    }
}

pub struct Reader {
    session: Option<String>,
    done: bool,
    /// Our MCP calls shown so far, and whether each can change the library.
    shown: HashMap<String, bool>,
}

impl Reader {
    pub fn new(session: Option<&str>) -> Reader {
        Reader {
            session: session.map(String::from),
            done: false,
            shown: HashMap::new(),
        }
    }
}

fn first_line(s: &str) -> String {
    s.lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim()
        .chars()
        .take(140)
        .collect()
}

/// What an MCP call returned, as text: `result.content[].text`, or whatever is there.
fn result_text(item: &Value) -> String {
    let r = &item["result"];
    if let Some(list) = r["content"].as_array() {
        return list
            .iter()
            .filter_map(|c| c["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
    }
    if let Some(s) = r.as_str() {
        return s.into();
    }
    item["error"]["message"]
        .as_str()
        .or(item["error"].as_str())
        .unwrap_or("")
        .to_string()
}

fn error_message(v: &Value) -> String {
    v["error"]["message"]
        .as_str()
        .or(v["message"].as_str())
        .or(v["error"].as_str())
        .unwrap_or("Codex stopped with an error.")
        .to_string()
}

impl Stream for Reader {
    fn line(&mut self, line: &str, emit: &mut dyn FnMut(Event)) {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            return;
        };
        let item = &v["item"];
        match v["type"].as_str().unwrap_or("") {
            "thread.started" => {
                if let Some(id) = v["thread_id"].as_str() {
                    self.session = Some(id.into());
                    emit(Event::Session { id: id.into() });
                }
            }
            "item.started" if item["type"] == "mcp_tool_call" => {
                // only our tools are shown; anything else Codex does stays out of the chat
                if item["server"].as_str().is_some_and(|s| s != SERVER) {
                    return;
                }
                let id = item["id"].as_str().unwrap_or("").to_string();
                let name = item["tool"].as_str().unwrap_or("").to_string();
                let writes = !crate::tool_defs().iter().any(|t| t.name == name && t.read_only);
                self.shown.insert(id.clone(), writes);
                let input = match &item["arguments"] {
                    Value::String(s) => serde_json::from_str(s).unwrap_or(Value::Null),
                    other => other.clone(),
                };
                emit(Event::Tool { id, name, input });
            }
            "item.completed" => match item["type"].as_str() {
                Some("agent_message") => {
                    let text = item["text"].as_str().unwrap_or("");
                    if !text.is_empty() {
                        emit(Event::Text { delta: text.into() });
                    }
                }
                Some("mcp_tool_call") => {
                    let id = item["id"].as_str().unwrap_or("");
                    let Some(&writes) = self.shown.get(id) else { return };
                    let ok = item["status"] != "failed" && item["error"].is_null();
                    emit(Event::ToolDone {
                        id: id.into(),
                        ok,
                        summary: first_line(&result_text(item)),
                        changed: ok && writes,
                    });
                }
                _ => {}
            },
            "turn.completed" => {
                self.done = true;
                emit(Event::Done { stop: "done".into() });
            }
            "turn.failed" | "error" => {
                self.done = true;
                emit(Event::Error {
                    message: error_message(&v),
                });
            }
            _ => {}
        }
    }

    fn done(&self) -> bool {
        self.done
    }

    fn session(&self) -> Option<String> {
        self.session.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn exec_events_become_panel_events() {
        let lines = [
            r#"{"type":"thread.started","thread_id":"0199a213"}"#,
            r#"{"type":"turn.started"}"#,
            r#"{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}"#,
            r#"{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"ls","status":"in_progress"}}"#,
            r#"{"type":"item.started","item":{"id":"item_2","type":"mcp_tool_call","server":"paperlines","tool":"search_library","arguments":{"query":"x"},"status":"in_progress"}}"#,
            r#"{"type":"item.completed","item":{"id":"item_2","type":"mcp_tool_call","server":"paperlines","tool":"search_library","status":"completed","result":{"content":[{"type":"text","text":"2 of 2 results\n- a"}]}}}"#,
            r#"{"type":"item.started","item":{"id":"item_3","type":"mcp_tool_call","server":"paperlines","tool":"create_note","arguments":"{\"title\":\"T\"}","status":"in_progress"}}"#,
            r#"{"type":"item.completed","item":{"id":"item_3","type":"mcp_tool_call","server":"paperlines","tool":"create_note","status":"completed","result":{"content":[{"type":"text","text":"Created note 4"}]}}}"#,
            r#"{"type":"item.started","item":{"id":"item_4","type":"mcp_tool_call","server":"other","tool":"x","status":"in_progress"}}"#,
            r#"{"type":"item.completed","item":{"id":"item_5","type":"agent_message","text":"Found @a."}}"#,
            r#"{"type":"turn.completed","usage":{"input_tokens":1}}"#,
        ];
        let mut r = Reader::new(None);
        let mut ev = vec![];
        for l in lines {
            r.line(l, &mut |e| ev.push(e));
        }
        assert_eq!(r.session().as_deref(), Some("0199a213"));
        assert!(r.done());
        assert_eq!(
            ev,
            vec![
                Event::Session { id: "0199a213".into() },
                Event::Tool {
                    id: "item_2".into(),
                    name: "search_library".into(),
                    input: json!({"query": "x"})
                },
                Event::ToolDone {
                    id: "item_2".into(),
                    ok: true,
                    summary: "2 of 2 results".into(),
                    changed: false
                },
                Event::Tool {
                    id: "item_3".into(),
                    name: "create_note".into(),
                    input: json!({"title": "T"})
                },
                Event::ToolDone {
                    id: "item_3".into(),
                    ok: true,
                    summary: "Created note 4".into(),
                    changed: true
                },
                Event::Text {
                    delta: "Found @a.".into()
                },
                Event::Done { stop: "done".into() },
            ],
            "its shell commands, reasoning and other servers' tools stay out of the chat"
        );
    }

    #[test]
    fn failures_are_reported() {
        let mut r = Reader::new(Some("t"));
        let mut ev = vec![];
        r.line(
            r#"{"type":"turn.failed","error":{"message":"usage limit reached"}}"#,
            &mut |e| ev.push(e),
        );
        assert_eq!(
            ev,
            vec![Event::Error {
                message: "usage limit reached".into()
            }]
        );
        assert!(r.done());
        assert_eq!(r.session().as_deref(), Some("t"), "the thread can still be resumed");
    }

    #[test]
    fn arguments_limit_tools_unless_editing_and_resume_the_thread() {
        let a = args(Path::new("/bin/paper lines"), None, false);
        assert_eq!(&a[..2], &["exec", "--json"]);
        assert!(a.contains(&"mcp_servers.paperlines.command=\"/bin/paper lines\"".to_string()));
        let enabled = a.iter().find(|x| x.contains("enabled_tools")).unwrap();
        assert!(enabled.contains("\"search_library\"") && !enabled.contains("create_note"));
        assert_eq!(a.last().unwrap(), "-");
        let b = args(Path::new("/bin/p"), Some("th1"), true);
        assert!(!b.iter().any(|x| x.contains("enabled_tools")));
        let n = b.len();
        assert_eq!(&b[n - 3..], &["resume", "th1", "-"]);
        assert!(prompt("hi", true, false).starts_with("<app-instructions>"));
        assert_eq!(prompt("hi", false, false), "hi");
    }
}
