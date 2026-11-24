//! The assistant panel's agents: the user's own Claude Code or Codex (signed in with their own
//! account, so no API key here), run headless with the Paperlines tools. Each message runs the
//! agent once and resumes the previous session, so the conversation carries on.
use crate::Event;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

const SERVER: &str = "paperlines";

/// The tools Claude Code may use: all of ours when changes are allowed, otherwise the read-only
/// ones. Its own tools (shell, files, web) aren't allowed, and in print mode anything not allowed
/// is refused rather than asked about.
pub fn allowed_tools(allow_writes: bool) -> String {
    if allow_writes {
        return format!("mcp__{SERVER}");
    }
    crate::tool_defs()
        .iter()
        .filter(|t| t.read_only)
        .map(|t| format!("mcp__{SERVER}__{}", t.name))
        .collect::<Vec<_>>()
        .join(",")
}

/// Which agent the panel runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Agent {
    Claude,
    Codex,
}

impl Agent {
    pub const ALL: [Agent; 2] = [Agent::Claude, Agent::Codex];

    pub fn id(self) -> &'static str {
        match self {
            Agent::Claude => "claude",
            Agent::Codex => "codex",
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Agent::Claude => "Claude Code",
            Agent::Codex => "Codex",
        }
    }

    /// The command it's started with.
    pub fn binary(self) -> &'static str {
        self.id()
    }

    pub fn from_id(id: &str) -> Option<Agent> {
        Agent::ALL.into_iter().find(|a| a.id() == id)
    }
}

/// What every agent is told about working inside the app.
pub fn instructions(allow_writes: bool) -> String {
    let note = if allow_writes {
        "The app has allowed you to change the library (notes, highlights, connections, suggestions). Say briefly what you're writing as you do it."
    } else {
        "In this conversation you can only read the library. If the user wants something written, give them the text and tell them to switch the panel to \"Can edit\"."
    };
    format!(
        "You are running inside {name}, the user's reference manager, from its assistant panel. Work through the {SERVER} tools. Mention papers as @citekey and link highlights as [p. N](#hl-ID); the app turns these into links. A message may start with <context>…</context>: what the user has open in the app right now; use it to resolve \"this paper\" or \"this note\" and don't repeat it back. Keep answers short and concrete unless asked for more. {note}",
        name = paperlines_core::branding::DISPLAY_NAME
    )
}

pub fn args(mcp_command: &Path, session: Option<&str>, allow_writes: bool) -> Vec<String> {
    let mcp = json!({ "mcpServers": { SERVER: { "command": mcp_command, "args": ["mcp"] } } });
    let mut a = vec![
        "-p".to_string(),
        "--output-format=stream-json".into(),
        "--verbose".into(),
        "--include-partial-messages".into(),
        format!("--mcp-config={mcp}"),
        "--strict-mcp-config".into(),
        format!("--allowedTools={}", allowed_tools(allow_writes)),
        format!("--append-system-prompt={}", instructions(allow_writes)),
    ];
    if let Some(s) = session {
        a.push(format!("--resume={s}"));
    }
    a
}

/// Turns an agent's JSON lines into panel events.
pub trait Stream {
    fn line(&mut self, line: &str, emit: &mut dyn FnMut(Event));
    /// The agent said it finished (successfully or with an error it reported).
    fn done(&self) -> bool;
    /// The session to resume next time.
    fn session(&self) -> Option<String>;
}

impl Stream for Reader {
    fn line(&mut self, line: &str, emit: &mut dyn FnMut(Event)) {
        Reader::line(self, line, emit)
    }
    fn done(&self) -> bool {
        self.done
    }
    fn session(&self) -> Option<String> {
        self.session.clone()
    }
}

/// Turns Claude Code's stream-json lines into panel events. Returns the session id when seen.
#[derive(Default)]
pub struct Reader {
    pub session: Option<String>,
    pub done: bool,
    /// Text came as partial chunks, so whole messages' text is not repeated.
    partial: bool,
    /// Our tool calls shown so far, and whether each one can change the library. Claude Code's
    /// own steps (e.g. looking tools up) aren't shown.
    shown: std::collections::HashMap<String, bool>,
}

fn short(name: &str) -> String {
    name.strip_prefix(&format!("mcp__{SERVER}__"))
        .unwrap_or(name)
        .to_string()
}

fn result_text(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(a) => a
            .iter()
            .filter_map(|c| c["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

impl Reader {
    pub fn line(&mut self, line: &str, emit: &mut dyn FnMut(Event)) {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            return;
        };
        match v["type"].as_str().unwrap_or("") {
            "system" => {
                if let Some(id) = v["session_id"].as_str() {
                    if self.session.as_deref() != Some(id) {
                        self.session = Some(id.into());
                        emit(Event::Session { id: id.into() });
                    }
                }
            }
            "stream_event" => {
                let e = &v["event"];
                if e["type"] == "content_block_delta" && e["delta"]["type"] == "text_delta" {
                    self.partial = true;
                    if let Some(t) = e["delta"]["text"].as_str() {
                        emit(Event::Text { delta: t.into() });
                    }
                }
            }
            "assistant" => {
                for b in v["message"]["content"].as_array().into_iter().flatten() {
                    match b["type"].as_str() {
                        Some("text") if !self.partial => {
                            emit(Event::Text {
                                delta: b["text"].as_str().unwrap_or("").into(),
                            });
                        }
                        Some("tool_use") => {
                            let full = b["name"].as_str().unwrap_or("");
                            let name = short(full);
                            if name == full {
                                continue;
                            }
                            let id = b["id"].as_str().unwrap_or("").to_string();
                            let writes = !crate::tool_defs().iter().any(|t| t.name == name && t.read_only);
                            self.shown.insert(id.clone(), writes);
                            emit(Event::Tool {
                                id,
                                name,
                                input: b["input"].clone(),
                            });
                        }
                        _ => {}
                    }
                }
            }
            "user" => {
                for b in v["message"]["content"].as_array().into_iter().flatten() {
                    if b["type"] == "tool_result" {
                        let id = b["tool_use_id"].as_str().unwrap_or("");
                        let Some(&writes) = self.shown.get(id) else { continue };
                        let text = result_text(&b["content"]);
                        let ok = !b["is_error"].as_bool().unwrap_or(false);
                        let line = text.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
                        emit(Event::ToolDone {
                            id: id.into(),
                            ok,
                            summary: line.chars().take(140).collect(),
                            changed: ok && writes,
                        });
                    }
                }
            }
            "result" => {
                self.done = true;
                if let Some(id) = v["session_id"].as_str() {
                    self.session = Some(id.into());
                }
                if v["is_error"].as_bool().unwrap_or(false) {
                    let msg = v["result"]
                        .as_str()
                        .or(v["error"].as_str())
                        .unwrap_or("Claude Code stopped with an error.");
                    emit(Event::Error { message: msg.into() });
                } else {
                    emit(Event::Done { stop: "done".into() });
                }
            }
            _ => {}
        }
    }
}

/// Runs one message through Claude Code. Returns the session id to resume next time.
#[allow(clippy::too_many_arguments)]
pub fn run(
    agent: Agent,
    exe: &Path,
    mcp_command: &Path,
    work_dir: &Path,
    prompt: &str,
    session: Option<&str>,
    allow_writes: bool,
    emit: &mut dyn FnMut(Event),
    cancel: Arc<AtomicBool>,
) -> Option<String> {
    let _ = std::fs::create_dir_all(work_dir);
    let (argv, prompt) = match agent {
        Agent::Claude => (args(mcp_command, session, allow_writes), prompt.to_string()),
        Agent::Codex => (
            crate::codex::args(mcp_command, session, allow_writes),
            crate::codex::prompt(prompt, session.is_none(), allow_writes),
        ),
    };
    let mut command = Command::new(exe);
    #[cfg(windows)]
    {
        // no console window flashing up behind the app
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let child = command
        .args(argv)
        // an empty folder of its own: the agent's file tools have nothing to look at
        .current_dir(work_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            emit(Event::Error {
                message: format!("Couldn't start {}: {e}", agent.name()),
            });
            return session.map(String::from);
        }
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(prompt.as_bytes());
    }
    let stdout = child.stdout.take();
    // read stderr alongside, so a chatty agent can't fill the pipe and stall; keep the end of it
    let stderr = child.stderr.take().map(|mut e| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = e.read_to_string(&mut buf);
            let start = buf.len().saturating_sub(2000);
            let start = (start..buf.len())
                .find(|&i| buf.is_char_boundary(i))
                .unwrap_or(buf.len());
            buf[start..].to_string()
        })
    });
    let child = Arc::new(Mutex::new(child));
    // stop button: end the process (reading its output blocks until it writes or exits)
    let stop = Arc::new(AtomicBool::new(false));
    let watcher = {
        let (child, stop, cancel) = (child.clone(), stop.clone(), cancel.clone());
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                if cancel.load(Ordering::Relaxed) {
                    let _ = child.lock().map(|mut c| c.kill());
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
        })
    };
    let mut reader: Box<dyn Stream> = match agent {
        Agent::Claude => Box::new(Reader {
            session: session.map(String::from),
            ..Default::default()
        }),
        Agent::Codex => Box::new(crate::codex::Reader::new(session)),
    };
    if let Some(out) = stdout {
        for line in BufReader::new(out).lines() {
            let Ok(line) = line else { break };
            reader.line(&line, emit);
        }
    }
    stop.store(true, Ordering::Relaxed);
    let _ = watcher.join();
    let status = child.lock().ok().and_then(|mut c| c.wait().ok());
    if cancel.load(Ordering::Relaxed) {
        emit(Event::Done {
            stop: "cancelled".into(),
        });
    } else if !reader.done() {
        let err = stderr.and_then(|h| h.join().ok()).unwrap_or_default();
        let err = err.trim();
        emit(Event::Error {
            message: if err.is_empty() {
                format!(
                    "{} stopped unexpectedly ({}).",
                    agent.name(),
                    status.map(|s| s.to_string()).unwrap_or_default()
                )
            } else {
                err.chars().take(600).collect()
            },
        });
    }
    reader.session()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_json_becomes_panel_events() {
        let lines = [
            r#"{"type":"system","subtype":"init","session_id":"s1","tools":[]}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t0","name":"ToolSearch","input":{}}]}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t0","content":"found"}]}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"},{"type":"tool_use","id":"t1","name":"mcp__paperlines__search_library","input":{"query":"x"}}]}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"2 of 2 results\n- a"}]}]}}"#,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"Hello","session_id":"s1"}"#,
        ];
        let mut r = Reader::default();
        let mut ev = vec![];
        for l in lines {
            r.line(l, &mut |e| ev.push(e));
        }
        assert_eq!(r.session.as_deref(), Some("s1"));
        assert!(r.done);
        let text: String = ev
            .iter()
            .filter_map(|e| match e {
                Event::Text { delta } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(text, "Hello", "partial text isn't repeated by the whole message");
        assert!(ev.contains(&Event::Tool {
            id: "t1".into(),
            name: "search_library".into(),
            input: json!({"query": "x"})
        }));
        assert!(ev
            .iter()
            .any(|e| matches!(e, Event::ToolDone { summary, ok: true, .. } if summary == "2 of 2 results")));
        assert_eq!(ev.last(), Some(&Event::Done { stop: "done".into() }));
    }

    #[test]
    fn read_only_unless_changes_are_allowed() {
        let ro = allowed_tools(false);
        assert!(ro.contains("mcp__paperlines__search_library"));
        assert!(!ro.contains("create_note"));
        assert_eq!(allowed_tools(true), "mcp__paperlines");
        let a = args(Path::new("/bin/paperlines"), Some("s1"), false);
        assert!(a.contains(&"--resume=s1".to_string()));
        assert!(a
            .iter()
            .any(|x| x.starts_with("--mcp-config=") && x.contains("/bin/paperlines")));
    }

    /// The user's real Claude Code and library: `cargo test -p paperlines-agent -- --ignored`.
    #[test]
    #[ignore]
    fn live_claude_code_reads_the_library() {
        let env = paperlines_ops::assistants::Env::current().unwrap();
        let claude = env.find("claude").expect("Claude Code installed");
        let mcp = std::env::var("PAPERLINES_BIN")
            .unwrap_or_else(|_| "/Applications/Paperlines.app/Contents/MacOS/paperlines".into());
        let dir = tempfile::tempdir().unwrap();
        let mut ev = vec![];
        let session = run(
            Agent::Claude,
            &claude,
            Path::new(&mcp),
            dir.path(),
            "Use the list_projects tool, then reply with just the number of projects.",
            None,
            false,
            &mut |e| ev.push(e),
            Arc::new(AtomicBool::new(false)),
        );
        eprintln!("{ev:#?}");
        assert!(session.is_some());
        assert!(ev
            .iter()
            .any(|e| matches!(e, Event::Tool { name, .. } if name == "list_projects")));
        assert!(ev.iter().any(|e| matches!(e, Event::ToolDone { ok: true, .. })));
        assert!(matches!(ev.last(), Some(Event::Done { .. })));

        // a later message, as after a restart: only the saved session id carries the conversation
        let mut ev2 = vec![];
        run(
            Agent::Claude,
            &claude,
            Path::new(&mcp),
            dir.path(),
            "Without using any tool: what number did you answer in your previous reply? Reply with just that number.",
            session.as_deref(),
            false,
            &mut |e| ev2.push(e),
            Arc::new(AtomicBool::new(false)),
        );
        let first: String = ev
            .iter()
            .filter_map(|e| match e {
                Event::Text { delta } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        let second: String = ev2
            .iter()
            .filter_map(|e| match e {
                Event::Text { delta } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        eprintln!("first: {first:?} second: {second:?}");
        assert_eq!(
            second.trim(),
            first.trim(),
            "the resumed session remembers the first answer"
        );
    }
}
