//! Connecting AI assistants to the library: registers `paperlines mcp` in each assistant's MCP
//! configuration and installs a skill (SKILL.md) that teaches it how to use the library.
//!
//! Every edit keeps the rest of the file as it was (other servers, comments in TOML, key order
//! in JSON) and is written atomically. Nothing is sent anywhere: these are local files.
use paperlines_core::branding;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::process::Command;

/// The skills Paperlines installs (Agent Skills format: a folder with SKILL.md each).
pub const SKILLS: &[(&str, &str)] = &[
    ("paperlines", include_str!("../assets/skills/paperlines/SKILL.md")),
    (
        "paperlines-notes",
        include_str!("../assets/skills/paperlines-notes/SKILL.md"),
    ),
    (
        "paperlines-scout",
        include_str!("../assets/skills/paperlines-scout/SKILL.md"),
    ),
];

/// Where we are: the home folder, the OS, and where to look for assistants' own commands.
#[derive(Clone, Debug)]
pub struct Env {
    pub home: PathBuf,
    pub macos: bool,
    /// Folders to look in for e.g. the `claude` command (an app started from the Dock or a
    /// launcher has a short PATH, so the usual install folders are added).
    pub bin_dirs: Vec<PathBuf>,
}

impl Env {
    pub fn current() -> Option<Env> {
        let home = PathBuf::from(std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?);
        let mut bin_dirs: Vec<PathBuf> = std::env::var_os("PATH")
            .map(|p| std::env::split_paths(&p).collect())
            .unwrap_or_default();
        for d in [
            ".local/bin",
            ".claude/local",
            ".npm-global/bin",
            ".bun/bin",
            ".volta/bin",
            ".nix-profile/bin",
        ] {
            bin_dirs.push(home.join(d));
        }
        // Windows: npm's global folder (claude.cmd, codex.cmd) and per-user installs
        if cfg!(windows) {
            for var in ["APPDATA", "LOCALAPPDATA"] {
                if let Some(base) = std::env::var_os(var).map(PathBuf::from) {
                    bin_dirs.push(base.join("npm"));
                    bin_dirs.push(base.join("Programs").join("claude"));
                }
            }
        }
        for d in [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/run/current-system/sw/bin",
            "/usr/bin",
        ] {
            bin_dirs.push(PathBuf::from(d));
        }
        Some(Env {
            home,
            macos: cfg!(target_os = "macos"),
            bin_dirs,
        })
    }

    /// A command by name; on Windows also `name.exe` and npm's `name.cmd`.
    pub fn find(&self, name: &str) -> Option<PathBuf> {
        let names: Vec<String> = if cfg!(windows) {
            vec![format!("{name}.exe"), format!("{name}.cmd"), name.to_string()]
        } else {
            vec![name.to_string()]
        };
        self.bin_dirs
            .iter()
            .flat_map(|d| names.iter().map(move |n| d.join(n)))
            .find(|p| p.is_file())
    }
}

/// A command run in the background: on Windows, without a console window flashing up.
fn quiet(program: &Path) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

/// How an assistant keeps its MCP servers.
enum Config {
    /// `{"mcpServers": {name: {command, args}}}` in one or more JSON files (the first is the
    /// current location; the others are older ones, updated too when they exist).
    Json(Vec<PathBuf>),
    /// `[mcp_servers.name]` with `command` and `args` in a TOML file (Codex).
    Toml(PathBuf),
    /// Claude Code: its own `claude mcp add/remove --scope user`, so its config file is never
    /// edited behind its back; the result is read from `~/.claude.json`.
    ClaudeCode(PathBuf),
    /// Grok (xAI's `grok` CLI): `grok mcp add/remove` when the command is found, else the
    /// `[mcp_servers.name]` table in `~/.grok/config.toml`, which is also where status is read.
    Grok(PathBuf),
}

struct Assistant {
    id: &'static str,
    name: &'static str,
    /// Any of these existing means the assistant is installed.
    signs: Vec<PathBuf>,
    config: Config,
    /// Skill folders it reads (`<dir>/paperlines/SKILL.md`); empty: no skills on disk.
    skill_dirs: Vec<PathBuf>,
}

fn assistants(env: &Env) -> Vec<Assistant> {
    let h = &env.home;
    let claude_desktop = if env.macos {
        h.join("Library/Application Support/Claude")
    } else if cfg!(windows) {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| h.join("AppData").join("Roaming"))
            .join("Claude")
    } else {
        h.join(".config/Claude")
    };
    vec![
        Assistant {
            id: "claude-code",
            name: "Claude Code",
            signs: vec![h.join(".claude"), h.join(".claude.json")],
            config: Config::ClaudeCode(h.join(".claude.json")),
            skill_dirs: vec![h.join(".claude/skills")],
        },
        Assistant {
            id: "claude-desktop",
            name: "Claude Desktop",
            signs: vec![claude_desktop.clone(), PathBuf::from("/Applications/Claude.app")],
            config: Config::Json(vec![claude_desktop.join("claude_desktop_config.json")]),
            // skills are added in the app (Settings → Capabilities), from the exported folder
            skill_dirs: vec![],
        },
        Assistant {
            id: "codex",
            name: "Codex",
            signs: vec![h.join(".codex")],
            config: Config::Toml(h.join(".codex/config.toml")),
            skill_dirs: vec![h.join(".agents/skills")],
        },
        Assistant {
            id: "antigravity",
            name: "Antigravity",
            signs: vec![
                h.join(".gemini/config"),
                h.join(".gemini/antigravity"),
                PathBuf::from("/Applications/Antigravity.app"),
            ],
            config: Config::Json(vec![
                h.join(".gemini/config/mcp_config.json"),
                h.join(".gemini/antigravity/mcp_config.json"),
            ]),
            skill_dirs: vec![h.join(".gemini/config/skills")],
        },
        Assistant {
            id: "gemini-cli",
            name: "Gemini CLI",
            signs: vec![h.join(".gemini/settings.json")],
            config: Config::Json(vec![h.join(".gemini/settings.json")]),
            skill_dirs: vec![h.join(".gemini/skills")],
        },
        Assistant {
            id: "grok",
            name: "Grok",
            signs: vec![h.join(".grok")],
            config: Config::Grok(h.join(".grok/config.toml")),
            skill_dirs: vec![h.join(".grok/skills")],
        },
        Assistant {
            id: "cursor",
            name: "Cursor",
            signs: vec![h.join(".cursor"), PathBuf::from("/Applications/Cursor.app")],
            config: Config::Json(vec![h.join(".cursor/mcp.json")]),
            skill_dirs: vec![],
        },
    ]
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStatus {
    pub id: String,
    pub name: String,
    /// The assistant seems to be installed on this machine.
    pub installed: bool,
    /// Our server is in its configuration.
    pub connected: bool,
    /// Connected, but to another program than this app's CLI (e.g. an old install).
    pub stale: bool,
    pub config_path: String,
    /// None: this assistant has no skills folder; Some(installed?)
    pub skill: Option<bool>,
    pub skill_path: Option<String>,
    /// What to paste by hand, for an assistant that isn't installed yet or a config we can't edit.
    pub manual: String,
}

const SERVER: &str = branding::BINARY_NAME;

fn server_entry(command: &Path) -> Value {
    json!({ "command": command.to_string_lossy(), "args": ["mcp"] })
}

fn read_json(path: &Path) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(s) if s.trim().is_empty() => Ok(json!({})),
        Ok(s) => serde_json::from_str(&s)
            .map_err(|e| format!("{} isn't valid JSON ({e}); fix or move it first", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// Writes through a temporary file in the same folder, so a crash never leaves half a file.
fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("no folder")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let tmp = dir.join(format!(
        ".{}.{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("config"),
        std::process::id()
    ));
    std::fs::write(&tmp, text).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("{}: {e}", path.display()))
}

/// Our server's command in a JSON config, if registered.
fn json_command(path: &Path) -> Option<String> {
    let v = read_json(path).ok()?;
    v.get("mcpServers")?
        .get(SERVER)?
        .get("command")?
        .as_str()
        .map(str::to_string)
}

fn toml_command(path: &Path) -> Option<String> {
    let doc: toml_edit::DocumentMut = std::fs::read_to_string(path).ok()?.parse().ok()?;
    doc.get("mcp_servers")?
        .get(SERVER)?
        .get("command")?
        .as_str()
        .map(str::to_string)
}

fn set_json(path: &Path, command: Option<&Path>) -> Result<(), String> {
    let mut v = read_json(path)?;
    let root = v
        .as_object_mut()
        .ok_or_else(|| format!("{} isn't a JSON object", path.display()))?;
    let servers = root.entry("mcpServers").or_insert_with(|| Value::Object(Map::new()));
    let servers = servers
        .as_object_mut()
        .ok_or_else(|| format!("mcpServers in {} isn't an object", path.display()))?;
    match command {
        Some(c) => {
            servers.insert(SERVER.into(), server_entry(c));
        }
        None => {
            if servers.remove(SERVER).is_none() {
                return Ok(());
            }
        }
    }
    let text = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    write_atomic(path, &format!("{text}\n"))
}

fn set_toml(path: &Path, command: Option<&Path>) -> Result<(), String> {
    let text = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("{}: {e}", path.display())),
    };
    let mut doc: toml_edit::DocumentMut = text
        .parse()
        .map_err(|e| format!("{} isn't valid TOML ({e}); fix or move it first", path.display()))?;
    match command {
        Some(c) => {
            if doc.get("mcp_servers").is_none() {
                let mut t = toml_edit::Table::new();
                t.set_implicit(true); // only [mcp_servers.paperlines] is written, not an empty [mcp_servers]
                doc.insert("mcp_servers", toml_edit::Item::Table(t));
            }
            let servers = doc["mcp_servers"].as_table_mut().ok_or("mcp_servers isn't a table")?;
            let mut t = toml_edit::Table::new();
            t.insert("command", toml_edit::value(c.to_string_lossy().as_ref()));
            let mut args = toml_edit::Array::new();
            args.push("mcp");
            t.insert("args", toml_edit::value(args));
            servers.insert(SERVER, toml_edit::Item::Table(t));
        }
        None => {
            let Some(servers) = doc.get_mut("mcp_servers").and_then(|s| s.as_table_mut()) else {
                return Ok(());
            };
            if servers.remove(SERVER).is_none() {
                return Ok(());
            }
        }
    }
    write_atomic(path, &doc.to_string())
}

fn claude_code_command(path: &Path) -> Option<String> {
    json_command(path)
}

fn manual_for(a: &Assistant, command: &Path) -> String {
    let c = command.to_string_lossy();
    match &a.config {
        Config::ClaudeCode(_) => format!("claude mcp add --scope user {SERVER} -- \"{c}\" mcp"),
        Config::Grok(p) => format!(
            "grok mcp add {SERVER} -- \"{c}\" mcp\n\n# or add to {}:\n[mcp_servers.{SERVER}]\ncommand = \"{c}\"\nargs = [\"mcp\"]",
            p.display()
        ),
        Config::Toml(p) => format!(
            "# {}\n[mcp_servers.{SERVER}]\ncommand = \"{c}\"\nargs = [\"mcp\"]",
            p.display()
        ),
        Config::Json(ps) => {
            let snippet = json!({ "mcpServers": { SERVER: server_entry(command) } });
            format!(
                "// {}\n{}",
                ps[0].display(),
                serde_json::to_string_pretty(&snippet).unwrap_or_default()
            )
        }
    }
}

/// Every known assistant: installed or not, connected or not, skill or not.
pub fn status(env: &Env, command: &Path) -> Vec<AssistantStatus> {
    let want = command.to_string_lossy().to_string();
    assistants(env)
        .into_iter()
        .map(|a| {
            let (path, found) = match &a.config {
                Config::Json(ps) => {
                    let found = ps.iter().find_map(|p| json_command(p));
                    (ps[0].clone(), found)
                }
                Config::Toml(p) => (p.clone(), toml_command(p)),
                Config::ClaudeCode(p) => (p.clone(), claude_code_command(p)),
                Config::Grok(p) => (p.clone(), toml_command(p)),
            };
            // the skills count as installed when all of them are there
            let skills_dir = a.skill_dirs.first();
            AssistantStatus {
                id: a.id.into(),
                name: a.name.into(),
                installed: a.signs.iter().any(|s| s.exists()),
                connected: found.is_some(),
                stale: found.as_deref().is_some_and(|f| f != want),
                config_path: path.to_string_lossy().into_owned(),
                skill: skills_dir.map(|d| SKILLS.iter().all(|(n, _)| d.join(n).join("SKILL.md").is_file())),
                skill_path: skills_dir.map(|d| d.to_string_lossy().into_owned()),
                manual: manual_for(&a, command),
            }
        })
        .collect()
}

fn find(env: &Env, id: &str) -> Result<Assistant, String> {
    assistants(env)
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| format!("Unknown assistant: {id}"))
}

/// Adds (`on`) or removes our MCP server in the assistant's configuration.
pub fn connect(env: &Env, id: &str, command: &Path, on: bool) -> Result<(), String> {
    let a = find(env, id)?;
    let cmd = on.then_some(command);
    match &a.config {
        Config::Json(ps) => {
            set_json(&ps[0], cmd)?;
            // older locations the assistant may still read: keep them in step when they exist
            for p in ps.iter().skip(1).filter(|p| p.exists()) {
                set_json(p, cmd)?;
            }
            Ok(())
        }
        Config::Toml(p) => set_toml(p, cmd),
        Config::ClaudeCode(_) => {
            let claude = env
                .find("claude")
                .ok_or("The `claude` command wasn't found. Run the command shown below in a terminal instead.")?;
            // re-adding replaces an old entry; removing a missing one is not an error
            let _ = quiet(&claude)
                .args(["mcp", "remove", "--scope", "user", SERVER])
                .output();
            if on {
                let out = quiet(&claude)
                    .args(["mcp", "add", "--scope", "user", SERVER, "--"])
                    .arg(command)
                    .arg("mcp")
                    .output()
                    .map_err(|e| format!("{}: {e}", claude.display()))?;
                if !out.status.success() {
                    return Err(format!(
                        "claude mcp add failed: {}",
                        String::from_utf8_lossy(&out.stderr).trim()
                    ));
                }
            }
            Ok(())
        }
        Config::Grok(p) => match env.find("grok") {
            Some(grok) => {
                let _ = quiet(&grok).args(["mcp", "remove", SERVER]).output();
                if on {
                    let out = quiet(&grok)
                        .args(["mcp", "add", SERVER, "--"])
                        .arg(command)
                        .arg("mcp")
                        .output()
                        .map_err(|e| format!("{}: {e}", grok.display()))?;
                    if !out.status.success() {
                        return Err(format!(
                            "grok mcp add failed: {}",
                            String::from_utf8_lossy(&out.stderr).trim()
                        ));
                    }
                }
                Ok(())
            }
            // no grok command on hand: its config file, edited like Codex's
            None => set_toml(p, cmd),
        },
    }
}

/// Installs (`on`) or removes the skills in every skills folder this assistant reads.
pub fn skill(env: &Env, id: &str, on: bool) -> Result<(), String> {
    let a = find(env, id)?;
    let Some(dir) = a.skill_dirs.first() else {
        return Err(format!(
            "{} has no skills folder; use “Save skill…” and add it in the app",
            a.name
        ));
    };
    for (name, md) in SKILLS {
        let folder = dir.join(name);
        if on {
            write_atomic(&folder.join("SKILL.md"), md)?;
        } else {
            // only our own file: anything the user added to the folder stays
            let file = folder.join("SKILL.md");
            if file.exists() {
                std::fs::remove_file(&file).map_err(|e| format!("{}: {e}", file.display()))?;
            }
            let _ = std::fs::remove_dir(&folder); // only if now empty
        }
    }
    Ok(())
}

/// Writes every skill as `<dir>/<name>/SKILL.md`, for assistants that take a folder or upload.
/// Returns the folder.
pub fn save_skill(dir: &Path) -> Result<PathBuf, String> {
    for (name, md) in SKILLS {
        write_atomic(&dir.join(name).join("SKILL.md"), md)?;
    }
    Ok(dir.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(dir: &Path) -> Env {
        Env {
            home: dir.to_path_buf(),
            macos: false,
            bin_dirs: vec![],
        }
    }

    fn st<'a>(all: &'a [AssistantStatus], id: &str) -> &'a AssistantStatus {
        all.iter().find(|s| s.id == id).unwrap()
    }

    #[test]
    fn json_configs_keep_other_servers_and_key_order() {
        let t = tempfile::tempdir().unwrap();
        let e = env(t.path());
        let cfg = t.path().join(".cursor/mcp.json");
        std::fs::create_dir_all(cfg.parent().unwrap()).unwrap();
        std::fs::write(
            &cfg,
            r#"{"zeta": 1, "mcpServers": {"other": {"command": "x"}}, "alpha": 2}"#,
        )
        .unwrap();
        let cmd = Path::new("/opt/Paperlines/paperlines");
        assert!(st(&status(&e, cmd), "cursor").installed);
        assert!(!st(&status(&e, cmd), "cursor").connected);

        connect(&e, "cursor", cmd, true).unwrap();
        let text = std::fs::read_to_string(&cfg).unwrap();
        assert!(
            text.find("zeta").unwrap() < text.find("alpha").unwrap(),
            "key order kept"
        );
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["mcpServers"]["other"]["command"], "x");
        assert_eq!(v["mcpServers"]["paperlines"]["args"][0], "mcp");
        let s = status(&e, cmd);
        assert!(st(&s, "cursor").connected && !st(&s, "cursor").stale);
        // a different install path shows as stale
        assert!(st(&status(&e, Path::new("/elsewhere/paperlines")), "cursor").stale);

        connect(&e, "cursor", cmd, false).unwrap();
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&cfg).unwrap()).unwrap();
        assert!(v["mcpServers"].get("paperlines").is_none());
        assert_eq!(v["mcpServers"]["other"]["command"], "x");
    }

    #[test]
    fn codex_toml_keeps_comments_and_other_tables() {
        let t = tempfile::tempdir().unwrap();
        let e = env(t.path());
        let cfg = t.path().join(".codex/config.toml");
        std::fs::create_dir_all(cfg.parent().unwrap()).unwrap();
        std::fs::write(
            &cfg,
            "# my settings\nmodel = \"o3\"\n\n[mcp_servers.docs]\ncommand = \"npx\"\n",
        )
        .unwrap();
        let cmd = Path::new("/opt/Paperlines/paperlines");
        connect(&e, "codex", cmd, true).unwrap();
        let text = std::fs::read_to_string(&cfg).unwrap();
        assert!(text.starts_with("# my settings\nmodel = \"o3\""));
        assert!(text.contains("[mcp_servers.docs]"));
        assert!(text.contains("[mcp_servers.paperlines]\ncommand = \"/opt/Paperlines/paperlines\"\nargs = [\"mcp\"]"));
        assert!(st(&status(&e, cmd), "codex").connected);
        connect(&e, "codex", cmd, false).unwrap();
        let text = std::fs::read_to_string(&cfg).unwrap();
        assert!(!text.contains("paperlines") && text.contains("[mcp_servers.docs]"));

        // a fresh file gets only our table
        std::fs::remove_file(&cfg).unwrap();
        connect(&e, "codex", cmd, true).unwrap();
        assert_eq!(
            std::fs::read_to_string(&cfg).unwrap(),
            "[mcp_servers.paperlines]\ncommand = \"/opt/Paperlines/paperlines\"\nargs = [\"mcp\"]\n"
        );
    }

    #[test]
    fn antigravity_updates_the_legacy_file_only_when_it_exists() {
        let t = tempfile::tempdir().unwrap();
        let e = env(t.path());
        let cmd = Path::new("/p/paperlines");
        connect(&e, "antigravity", cmd, true).unwrap();
        assert!(t.path().join(".gemini/config/mcp_config.json").is_file());
        assert!(!t.path().join(".gemini/antigravity/mcp_config.json").exists());
        std::fs::create_dir_all(t.path().join(".gemini/antigravity")).unwrap();
        std::fs::write(t.path().join(".gemini/antigravity/mcp_config.json"), "{}").unwrap();
        connect(&e, "antigravity", cmd, true).unwrap();
        assert!(json_command(&t.path().join(".gemini/antigravity/mcp_config.json")).is_some());
    }

    #[test]
    fn broken_config_is_left_alone() {
        let t = tempfile::tempdir().unwrap();
        let e = env(t.path());
        let cfg = t.path().join(".gemini/settings.json");
        std::fs::create_dir_all(cfg.parent().unwrap()).unwrap();
        std::fs::write(&cfg, "{ not json").unwrap();
        let err = connect(&e, "gemini-cli", Path::new("/p"), true).unwrap_err();
        assert!(err.contains("isn't valid JSON"));
        assert_eq!(std::fs::read_to_string(&cfg).unwrap(), "{ not json");
    }

    #[test]
    fn skills_install_and_remove_only_our_file() {
        let t = tempfile::tempdir().unwrap();
        let e = env(t.path());
        skill(&e, "claude-code", true).unwrap();
        let f = t.path().join(".claude/skills/paperlines/SKILL.md");
        assert!(std::fs::read_to_string(&f)
            .unwrap()
            .starts_with("---\nname: paperlines\n"));
        assert_eq!(st(&status(&e, Path::new("/p")), "claude-code").skill, Some(true));
        std::fs::write(t.path().join(".claude/skills/paperlines/mine.md"), "x").unwrap();
        skill(&e, "claude-code", false).unwrap();
        assert!(!f.exists());
        assert!(t.path().join(".claude/skills/paperlines/mine.md").exists());
        assert_eq!(st(&status(&e, Path::new("/p")), "claude-desktop").skill, None);
        assert!(skill(&e, "claude-desktop", true).is_err());
        skill(&e, "codex", true).unwrap();
        assert!(t.path().join(".agents/skills/paperlines/SKILL.md").is_file());
    }

    #[test]
    fn grok_without_its_command_gets_its_config_file_and_three_skills() {
        let t = tempfile::tempdir().unwrap();
        let e = env(t.path());
        let cfg = t.path().join(".grok/config.toml");
        std::fs::create_dir_all(cfg.parent().unwrap()).unwrap();
        std::fs::write(&cfg, "# mine\n[mcp_servers.other]\ncommand = \"x\"\n").unwrap();
        let cmd = Path::new("/Applications/Paperlines.app/Contents/MacOS/paperlines");
        assert!(st(&status(&e, cmd), "grok").installed);
        connect(&e, "grok", cmd, true).unwrap();
        let text = std::fs::read_to_string(&cfg).unwrap();
        assert!(text.starts_with("# mine") && text.contains("[mcp_servers.other]"));
        assert!(text.contains("[mcp_servers.paperlines]"));
        let s = status(&e, cmd);
        assert!(st(&s, "grok").connected && !st(&s, "grok").stale);
        assert!(st(&s, "grok").manual.starts_with("grok mcp add paperlines -- "));
        // all three skills, or the assistant isn't counted as having them
        skill(&e, "grok", true).unwrap();
        for name in ["paperlines", "paperlines-notes", "paperlines-scout"] {
            assert!(
                t.path().join(".grok/skills").join(name).join("SKILL.md").is_file(),
                "{name}"
            );
        }
        assert_eq!(st(&status(&e, cmd), "grok").skill, Some(true));
        std::fs::remove_file(t.path().join(".grok/skills/paperlines-scout/SKILL.md")).unwrap();
        assert_eq!(st(&status(&e, cmd), "grok").skill, Some(false));
        connect(&e, "grok", cmd, false).unwrap();
        assert!(!std::fs::read_to_string(&cfg).unwrap().contains("paperlines"));
    }

    #[test]
    fn three_skills_describe_themselves() {
        let s = skills();
        let names: Vec<&str> = s.iter().map(|x| x.name.as_str()).collect();
        assert_eq!(names, vec!["paperlines", "paperlines-notes", "paperlines-scout"]);
        assert!(s
            .iter()
            .all(|x| !x.description.is_empty() && !x.rules.is_empty() && !x.abilities.is_empty()));
        assert!(s[2].rules.iter().any(|r| r.starts_with("Never import")));
        let t = tempfile::tempdir().unwrap();
        save_skill(t.path()).unwrap();
        assert!(t.path().join("paperlines-notes/SKILL.md").is_file());
    }

    #[test]
    fn claude_code_without_its_command_says_what_to_run() {
        let t = tempfile::tempdir().unwrap();
        let e = env(t.path());
        let err = connect(&e, "claude-code", Path::new("/p/paperlines"), true).unwrap_err();
        assert!(err.contains("wasn't found"));
        let s = status(&e, Path::new("/p/paperlines"));
        assert_eq!(
            st(&s, "claude-code").manual,
            "claude mcp add --scope user paperlines -- \"/p/paperlines\" mcp"
        );
    }
}

/// A skill as Settings describes it, read from its SKILL.md (so the two never disagree).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    /// When an assistant uses it (the frontmatter description).
    pub description: String,
    /// The rules it gives the assistant (bold lead of each "Ground rules" bullet).
    pub rules: Vec<String>,
    /// What you can ask for, with what the assistant then does ("Recipes").
    pub abilities: Vec<(String, String)>,
}

/// The skills Paperlines installs (one today: `paperlines`).
pub fn skills() -> Vec<SkillInfo> {
    SKILLS.iter().map(|(_, md)| parse_skill(md)).collect()
}

fn parse_skill(md: &str) -> SkillInfo {
    let mut name = String::new();
    let mut description = String::new();
    let mut rules = Vec::new();
    let mut abilities = Vec::new();
    let mut section = "";
    for line in md.lines() {
        if let Some(v) = line.strip_prefix("name:") {
            name = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("description:") {
            description = v.trim().to_string();
        } else if let Some(h) = line.strip_prefix("## ") {
            section = if h.starts_with("Ground rules") {
                "rules"
            } else if h.starts_with("Recipes") {
                "recipes"
            } else {
                ""
            };
        } else if let Some(item) = line.strip_prefix("- **") {
            let Some((lead, rest)) = item.split_once("**") else {
                continue;
            };
            let lead = lead.trim().trim_matches('"').trim_end_matches('.').to_string();
            let rest = rest.trim().to_string();
            match section {
                "rules" => rules.push(lead),
                "recipes" => abilities.push((lead.trim_matches('"').to_string(), rest)),
                _ => {}
            }
        }
    }
    SkillInfo {
        name,
        description,
        rules,
        abilities,
    }
}

#[cfg(test)]
mod skill_info_tests {
    #[test]
    fn the_skill_describes_itself() {
        let s = &super::skills()[0];
        assert_eq!(s.name, "paperlines");
        assert!(s.description.starts_with("Work with the user's own research library"));
        assert!(s.rules.iter().any(|r| r.starts_with("Ask before writing")));
        assert!(s
            .abilities
            .iter()
            .any(|(t, d)| t == "What do I have on X?" && d.contains("search_library")));
        assert_eq!(s.abilities.len(), 5);
    }
}
