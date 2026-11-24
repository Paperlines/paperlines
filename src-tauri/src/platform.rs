//! Desktop-shell behavior that differs per OS. Shared crates never branch on the OS.
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

pub const SETTINGS_MENU_ID: &str = "settings";

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let name = paperlines_core::branding::DISPLAY_NAME;
    let settings = MenuItem::with_id(app, SETTINGS_MENU_ID, "Settings…", true, Some("CmdOrCtrl+,"))?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view = Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;
    if cfg!(target_os = "macos") {
        let app_menu = Submenu::with_items(
            app,
            name,
            true,
            &[
                &PredefinedMenuItem::about(app, Some(&format!("About {name}")), None)?,
                &PredefinedMenuItem::separator(app)?,
                &settings,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        Menu::with_items(app, &[&app_menu, &edit, &view, &window])
    } else {
        let file = Submenu::with_items(
            app,
            "File",
            true,
            &[
                &settings,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        Menu::with_items(app, &[&file, &edit, &view, &window])
    }
}

/// macOS convention: closing the last window hides it; the app keeps running until Cmd+Q.
pub fn keep_alive_on_close() -> bool {
    cfg!(target_os = "macos")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInstall {
    pub path: String,
    /// symlink | copy | package (installed by Nix, deb or rpm)
    pub method: &'static str,
    /// Whether the folder is on PATH for new terminals (best effort).
    pub in_path: bool,
}

/// Puts the bundled command-line tool on PATH: a symlink into ~/.local/bin (macOS app bundles
/// stay valid across updates), or a copy for AppImages, whose mount path disappears on exit.
pub fn install_cli() -> Result<CliInstall, String> {
    let name = paperlines_core::branding::BINARY_NAME;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let src = exe.with_file_name(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    if !src.exists() {
        return Err(format!(
            "The command-line tool was not found next to the app ({}). Build it with `cargo build -p {}-cli`.",
            src.display(),
            paperlines_core::branding::BINARY_NAME
        ));
    }
    // Nix, deb, rpm: the package already put the CLI on PATH
    #[cfg(target_os = "linux")]
    if crate::linux::packaged(&exe) {
        let on_path =
            std::env::var_os("PATH").and_then(|p| std::env::split_paths(&p).map(|d| d.join(name)).find(|c| c.exists()));
        return Ok(CliInstall {
            path: on_path.unwrap_or(src).to_string_lossy().into_owned(),
            method: "package",
            in_path: true,
        });
    }
    // Windows: the installer put the tool next to the app; adding that folder to PATH is the
    // user's choice (System settings), so just say where it is
    #[cfg(windows)]
    {
        let dir = src.parent().map(std::path::Path::to_path_buf).unwrap_or_default();
        let in_path = std::env::var_os("PATH").is_some_and(|p| std::env::split_paths(&p).any(|x| x == dir));
        return Ok(CliInstall {
            path: src.to_string_lossy().into_owned(),
            method: "package",
            in_path,
        });
    }
    #[allow(unreachable_code)]
    let home = std::env::var_os("HOME").ok_or("No home folder")?;
    let dir = std::path::Path::new(&home).join(".local").join("bin");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(name);
    if dest.symlink_metadata().is_ok() {
        std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
    }
    let appimage = std::env::var_os("APPIMAGE").is_some();
    let method = if appimage {
        std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        "copy"
    } else {
        #[cfg(unix)]
        std::os::unix::fs::symlink(&src, &dest).map_err(|e| e.to_string())?;
        #[cfg(not(unix))]
        std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        if cfg!(unix) {
            "symlink"
        } else {
            "copy"
        }
    };
    let in_path = std::env::var_os("PATH").is_some_and(|p| std::env::split_paths(&p).any(|x| x == dir));
    Ok(CliInstall {
        path: dest.to_string_lossy().into_owned(),
        method,
        in_path,
    })
}

/// File paths passed on the command line ("Open with" on Linux, a second launch).
pub fn file_args(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter(|a| std::path::Path::new(a).is_file())
        .cloned()
        .collect()
}

/// The program assistants should start for the MCP server: a path that stays valid across app
/// updates (the CLI inside the macOS app bundle; on Linux the package's link on PATH, never a
/// /nix/store path that changes with every update; for an AppImage, the copy in ~/.local/bin).
pub fn mcp_command() -> Result<std::path::PathBuf, String> {
    let name = paperlines_core::branding::BINARY_NAME;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let src = exe.with_file_name(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    #[cfg(target_os = "linux")]
    if crate::linux::packaged(&exe) {
        let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
        let user = std::env::var("USER").unwrap_or_default();
        let mut dirs: Vec<std::path::PathBuf> = std::env::var_os("PATH")
            .map(|p| std::env::split_paths(&p).collect())
            .unwrap_or_default();
        dirs.extend(home.iter().map(|h| h.join(".nix-profile/bin")));
        dirs.push(format!("/etc/profiles/per-user/{user}/bin").into());
        dirs.push("/run/current-system/sw/bin".into());
        dirs.push("/usr/bin".into());
        if let Some(p) = dirs
            .into_iter()
            .map(|d| d.join(name))
            .find(|p| p.exists() && !p.starts_with("/nix/store"))
        {
            return Ok(p);
        }
    }
    if std::env::var_os("APPIMAGE").is_some() {
        return install_cli().map(|i| i.path.into());
    }
    if src.exists() {
        Ok(src)
    } else {
        Err(format!(
            "The command-line tool was not found next to the app ({})",
            src.display()
        ))
    }
}
