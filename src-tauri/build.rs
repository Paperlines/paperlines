use std::path::Path;

/// Tauri refuses to compile until every `externalBin` exists. Bundles always get the real CLI
/// (the before-dev/before-build hooks run scripts/build-cli.mjs first); for plain `cargo check`,
/// `clippy` or `test` on a fresh checkout an empty placeholder is enough.
fn ensure_sidecar_placeholder() {
    println!("cargo:rerun-if-changed=../branding/branding.json");
    let Ok(text) = std::fs::read_to_string("../branding/branding.json") else {
        return;
    };
    let Ok(b) = serde_json::from_str::<serde_json::Value>(&text) else {
        return;
    };
    let (Some(name), Ok(target)) = (b["binaryName"].as_str(), std::env::var("TARGET")) else {
        return;
    };
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let path = Path::new("binaries").join(format!("{name}-{target}{ext}"));
    if !path.exists() {
        println!("cargo:warning=CLI sidecar missing; created a placeholder at {}. Run `node scripts/build-cli.mjs` to build the real one.", path.display());
        let _ = std::fs::create_dir_all("binaries");
        let _ = std::fs::write(&path, b"");
    }
}

fn main() {
    ensure_sidecar_placeholder();
    tauri_build::build()
}
