//! Linux desktop integration that GTK3/WebKitGTK does not do by itself: following the desktop's
//! light/dark setting (COSMIC, GNOME 42+ and KDE publish it through the XDG desktop portal, which
//! GTK3 never reads) and working around the WebKitGTK DMA-BUF renderer on NVIDIA + Wayland.
//! Compiled on every Unix so it is type-checked on macOS too; only Linux calls it.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::{OwnedValue, Value};

const DEST: &str = "org.freedesktop.portal.Desktop";
const PATH: &str = "/org/freedesktop/portal/desktop";
const IFACE: &str = "org.freedesktop.portal.Settings";
const NS: &str = "org.freedesktop.appearance";
const KEY: &str = "color-scheme";

/// The desktop's preference: Some(true) dark, Some(false) light, None no preference / no portal.
pub type Dark = Option<bool>;

/// Portal color-scheme: 0 no preference, 1 prefer dark, 2 prefer light.
fn scheme(n: u32) -> Dark {
    match n {
        1 => Some(true),
        2 => Some(false),
        _ => None,
    }
}

/// Unwraps the variant-in-variant the old `Read` method returns.
fn as_u32(v: &Value<'_>) -> Option<u32> {
    match v {
        Value::U32(n) => Some(*n),
        Value::Value(inner) => as_u32(inner),
        _ => None,
    }
}

fn proxy(conn: &Connection) -> zbus::Result<Proxy<'_>> {
    Proxy::new(conn, DEST, PATH, IFACE)
}

/// Reads the current preference (portal v2 `ReadOne`, falling back to `Read`).
pub fn color_scheme() -> Dark {
    let conn = Connection::session().ok()?;
    let p = proxy(&conn).ok()?;
    let v: OwnedValue = p
        .call("ReadOne", &(NS, KEY))
        .or_else(|_| p.call("Read", &(NS, KEY)))
        .ok()?;
    scheme(as_u32(&v)?)
}

/// Calls `on_change` whenever the desktop switches light/dark. Runs until the bus goes away.
pub fn watch_color_scheme(on_change: impl Fn(Dark) + Send + 'static) {
    std::thread::spawn(move || {
        let Ok(conn) = Connection::session() else { return };
        let Ok(p) = proxy(&conn) else { return };
        let Ok(signals) = p.receive_signal("SettingChanged") else {
            return;
        };
        for msg in signals {
            let Ok((ns, key, value)) = msg.body().deserialize::<(String, String, OwnedValue)>() else {
                continue;
            };
            if ns == NS && key == KEY {
                if let Some(n) = as_u32(&value) {
                    on_change(scheme(n));
                }
            }
        }
    });
}

/// WebKitGTK's DMA-BUF renderer shows a blank or flickering window with NVIDIA's driver under
/// Wayland (COSMIC is Wayland-only). Must run before GTK starts; an explicit setting wins.
pub fn webkit_env() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
    let nvidia = std::path::Path::new("/proc/driver/nvidia/version").exists();
    if wayland && nvidia {
        // SAFETY: called first thing in main, before any other thread exists
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
}

/// True when the app was installed by a package manager (Nix, deb, rpm, Flatpak): the CLI is then
/// already on PATH and must not be linked from ~/.local/bin (a Nix store path disappears after an
/// upgrade and garbage collection).
pub fn packaged(exe: &std::path::Path) -> bool {
    let s = exe.to_string_lossy();
    s.starts_with("/nix/store/")
        || s.starts_with("/usr/bin/")
        || s.starts_with("/usr/lib/")
        || s.starts_with("/app/")
        || s.contains("/.nix-profile/")
        || s.starts_with("/run/current-system/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portal_values() {
        assert_eq!(scheme(1), Some(true));
        assert_eq!(scheme(2), Some(false));
        assert_eq!(scheme(0), None);
        let nested = Value::Value(Box::new(Value::U32(1)));
        assert_eq!(as_u32(&nested), Some(1));
        assert_eq!(as_u32(&Value::U32(2)), Some(2));
        assert_eq!(as_u32(&Value::Bool(true)), None);
    }

    #[test]
    fn packaged_paths() {
        assert!(packaged(std::path::Path::new(
            "/nix/store/abc-paperlines-0.1.0/bin/paperlines-app"
        )));
        assert!(packaged(std::path::Path::new("/usr/bin/paperlines-app")));
        assert!(!packaged(std::path::Path::new(
            "/home/a/Applications/Paperlines.AppImage"
        )));
        assert!(!packaged(std::path::Path::new(
            "/Applications/Paperlines.app/Contents/MacOS/paperlines-app"
        )));
    }
}
