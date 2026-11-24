//! Settings → AI assistants: connect the MCP server and install the skill (see
//! `paperlines_ops::assistants`).
use paperlines_core::{Error, Result};
use paperlines_ops::assistants::{self, AssistantStatus, Env, SkillInfo};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub read_only: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantsReport {
    /// The program each assistant starts (with the argument `mcp`).
    pub command: String,
    pub assistants: Vec<AssistantStatus>,
    /// What the server lets an assistant do.
    pub tools: Vec<McpTool>,
    /// The skills Paperlines installs, and what each one teaches.
    pub skills: Vec<SkillInfo>,
}

fn env() -> Result<Env> {
    Env::current().ok_or_else(|| Error::Msg("No home folder".into()))
}

fn command() -> Result<std::path::PathBuf> {
    crate::platform::mcp_command().map_err(Error::Msg)
}

#[tauri::command]
pub fn assistants_status() -> Result<AssistantsReport> {
    let cmd = command()?;
    let tools = paperlines_mcp::tools()
        .as_array()
        .map(|a| {
            a.iter()
                .map(|t| McpTool {
                    name: t["name"].as_str().unwrap_or_default().into(),
                    description: t["description"].as_str().unwrap_or_default().into(),
                    read_only: t["annotations"]["readOnlyHint"].as_bool().unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(AssistantsReport {
        command: cmd.to_string_lossy().into_owned(),
        assistants: assistants::status(&env()?, &cmd),
        tools,
        skills: assistants::skills(),
    })
}

#[tauri::command]
pub fn assistant_connect(id: String, on: bool) -> Result<()> {
    assistants::connect(&env()?, &id, &command()?, on).map_err(Error::Msg)
}

#[tauri::command]
pub fn assistant_skill(id: String, on: bool) -> Result<()> {
    assistants::skill(&env()?, &id, on).map_err(Error::Msg)
}

/// Writes `<dir>/paperlines/SKILL.md` (for Claude Desktop and other apps that take a skill folder).
#[tauri::command]
pub fn assistant_save_skill(dir: String) -> Result<String> {
    assistants::save_skill(std::path::Path::new(&dir))
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(Error::Msg)
}
