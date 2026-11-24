//! The assistant panel: chats with the user's own Claude Code or Codex (`paperlines_agent`),
//! whichever are installed and connected in Settings ▸ AI Assistants. Each conversation remembers
//! the agent's session for as long as the app is open; replies stream through a channel.
use crate::AppState;
use paperlines_agent::cli::Agent;
use paperlines_agent::config as cfgfile;
use paperlines_agent::{AgentConfig, Event};
use paperlines_core::chats::{self, ChatSummary};
use paperlines_core::{Error, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

#[derive(Default)]
struct Chat {
    /// The agent the session belongs to; another agent starts a fresh one.
    agent: Option<&'static str>,
    /// Claude Code's session, resumed by the next message.
    session: Option<String>,
    /// Set while a reply is being written; setting it to true stops it.
    running: Option<Arc<AtomicBool>>,
}

#[derive(Default, Clone)]
pub struct Runtime(Arc<Mutex<HashMap<String, Chat>>>);

impl Runtime {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Chat>> {
        self.0.lock().unwrap_or_else(|p| p.into_inner())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChoice {
    id: &'static str,
    name: &'static str,
    /// Where it's installed.
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    config: AgentConfig,
    /// The agents to choose from: installed, and connected to our MCP server in
    /// Settings ▸ AI Assistants (the panel follows what the user set up there).
    agents: Vec<AgentChoice>,
    /// The agent messages go to: the chosen one if installed, else the first installed.
    active: Option<&'static str>,
}

/// The id Settings ▸ AI Assistants uses for an agent.
fn assistant_id(agent: Agent) -> &'static str {
    match agent {
        Agent::Claude => "claude-code",
        Agent::Codex => "codex",
    }
}

/// The agents that are installed and connected, with where they're installed.
fn available() -> Vec<(Agent, std::path::PathBuf)> {
    let Some(env) = paperlines_ops::assistants::Env::current() else {
        return vec![];
    };
    let connected: Vec<String> = crate::platform::mcp_command()
        .map(|cmd| {
            paperlines_ops::assistants::status(&env, &cmd)
                .into_iter()
                .filter(|s| s.connected)
                .map(|s| s.id)
                .collect()
        })
        .unwrap_or_default();
    Agent::ALL
        .into_iter()
        .filter(|a| connected.iter().any(|c| c == assistant_id(*a)))
        .filter_map(|a| env.find(a.binary()).map(|p| (a, p)))
        .collect()
}

/// The chosen agent if it's available, else the first one that is.
fn active(cfg: &AgentConfig, list: &[(Agent, std::path::PathBuf)]) -> Option<(Agent, std::path::PathBuf)> {
    let chosen = cfg.agent.as_deref().and_then(Agent::from_id);
    list.iter()
        .find(|(a, _)| Some(*a) == chosen)
        .or_else(|| list.first())
        .cloned()
}

#[tauri::command]
pub fn agent_info(state: tauri::State<AppState>) -> AgentInfo {
    let config = cfgfile::load(&state.dirs.config);
    let list = available();
    AgentInfo {
        active: active(&config, &list).map(|(a, _)| a.id()),
        agents: list
            .into_iter()
            .map(|(a, p)| AgentChoice {
                id: a.id(),
                name: a.name(),
                path: p.to_string_lossy().into_owned(),
            })
            .collect(),
        config,
    }
}

#[tauri::command]
pub fn agent_save_config(state: tauri::State<AppState>, config: AgentConfig) -> Result<()> {
    cfgfile::save(&state.dirs.config, &config).map_err(Error::from)
}

/// Sends a message to the user's agent, continuing the chat's session.
#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri passes each argument by name
pub async fn agent_send(
    state: tauri::State<'_, AppState>,
    runtime: tauri::State<'_, Runtime>,
    chat: String,
    text: String,
    context: Option<String>,
    item_id: Option<i64>,
    note_id: Option<i64>,
    on_event: Channel<Event>,
) -> Result<()> {
    let cfg = cfgfile::load(&state.dirs.config);
    let (agent, exe) = active(&cfg, &available()).ok_or_else(|| {
        Error::msg("No agent is connected. Connect Claude Code or Codex in Settings ▸ AI Assistants.")
    })?;
    let mcp = crate::platform::mcp_command().map_err(Error::msg)?;
    let work = state.dirs.cache.join("assistant");
    let cancel = Arc::new(AtomicBool::new(false));
    // the chat is saved from its first message; a saved session lets it continue after a restart
    let saved_session = {
        let db = state.db();
        chats::begin(&db.conn, &chat, agent.id(), &text, item_id, note_id)?;
        chats::session_for(&db.conn, &chat, agent.id())?
    };
    let session = {
        let mut map = runtime.lock();
        let c = map.entry(chat.clone()).or_default();
        if c.running.is_some() {
            return Err(Error::msg("Still answering the last message"));
        }
        c.running = Some(cancel.clone());
        if c.agent != Some(agent.id()) {
            c.session = None;
            c.agent = Some(agent.id());
        }
        c.session.clone().or(saved_session)
    };
    let rt = runtime.inner().clone();
    let db = state.db.clone();
    let prompt = paperlines_agent::with_context(&text, context.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        let mut emit = |e: Event| {
            let _ = on_event.send(e);
        };
        let session = paperlines_agent::cli::run(
            agent,
            &exe,
            &mcp,
            &work,
            &prompt,
            session.as_deref(),
            cfg.cli_allow_writes,
            &mut emit,
            cancel,
        );
        {
            let g = db.lock().unwrap_or_else(|p| p.into_inner());
            let _ = chats::set_session(&g.conn, &chat, agent.id(), session.as_deref());
        }
        let mut map = rt.lock();
        let c = map.entry(chat).or_default();
        c.session = session;
        c.running = None;
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))
}

#[tauri::command]
pub fn agent_stop(runtime: tauri::State<Runtime>, chat: String) {
    if let Some(cancel) = runtime.lock().get(&chat).and_then(|c| c.running.clone()) {
        cancel.store(true, Ordering::Relaxed);
    }
}

/// Forgets a conversation (New chat).
#[tauri::command]
pub fn agent_forget(runtime: tauri::State<Runtime>, chat: String) {
    let mut map = runtime.lock();
    match map.get(&chat).and_then(|c| c.running.clone()) {
        Some(cancel) => cancel.store(true, Ordering::Relaxed),
        None => {
            map.remove(&chat);
        }
    }
}

/// Saved chats, the most recent first.
#[tauri::command]
pub fn agent_chats(state: tauri::State<AppState>) -> Result<Vec<ChatSummary>> {
    chats::list(&state.db().conn)
}

#[tauri::command]
pub fn agent_chat_get(state: tauri::State<AppState>, id: String) -> Result<chats::Chat> {
    chats::get(&state.db().conn, &id)
}

/// Stores the panel's transcript of a chat (JSON).
#[tauri::command]
pub fn agent_chat_save(state: tauri::State<AppState>, id: String, messages: String) -> Result<()> {
    chats::save_messages(&state.db().conn, &id, &messages)
}

#[tauri::command]
pub fn agent_chat_delete(state: tauri::State<AppState>, runtime: tauri::State<Runtime>, id: String) -> Result<()> {
    runtime.lock().remove(&id);
    chats::delete(&state.db().conn, &id)
}
