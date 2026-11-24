//! API keys: the OS credential store (Keychain / Secret Service via `keyring`), or, when none is
//! available (common on minimal Linux setups), an encrypted file in the config folder.
//!
//! The fallback file is encrypted with ChaCha20-Poly1305 under a random key kept in a separate
//! file with owner-only permissions. That keeps keys out of plain config and backups of the
//! library, but anyone who can read your user's files can decrypt them.
use crate::{branding, Error, Result};
use chacha20poly1305::aead::{Aead, Generate, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const NAMES: &[&str] = &["semantic_scholar", "openalex"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Backend {
    Os,
    EncryptedFile,
}

pub struct Secrets {
    dir: PathBuf,
    use_os: bool,
    service: String,
}

fn check(name: &str) -> Result<()> {
    if NAMES.contains(&name) {
        Ok(())
    } else {
        Err(Error::msg(format!("Unknown secret: {name}")))
    }
}

#[cfg(unix)]
fn restrict(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict(_path: &Path) -> Result<()> {
    Ok(())
}

impl Secrets {
    /// `config_dir` holds the fallback file. `use_os` is false only in tests.
    pub fn new(config_dir: &Path, use_os: bool) -> Self {
        Secrets {
            dir: config_dir.to_path_buf(),
            use_os,
            service: branding::APP_ID.to_string(),
        }
    }

    /// A separate credential-store namespace, so tests never touch real keys.
    pub fn with_service(mut self, service: &str) -> Self {
        self.service = service.to_string();
        self
    }

    fn entry(&self, name: &str) -> Option<keyring::Entry> {
        if !self.use_os {
            return None;
        }
        keyring::Entry::new(&self.service, name).ok()
    }

    fn key_path(&self) -> PathBuf {
        self.dir.join("secrets.key")
    }

    fn file_path(&self) -> PathBuf {
        self.dir.join("secrets.enc")
    }

    fn cipher(&self, create: bool) -> Result<Option<ChaCha20Poly1305>> {
        let p = self.key_path();
        if !p.exists() {
            if !create {
                return Ok(None);
            }
            fs::create_dir_all(&self.dir)?;
            let key = Key::generate();
            fs::write(&p, key.as_slice())?;
            restrict(&p)?;
        }
        let bytes = fs::read(&p)?;
        ChaCha20Poly1305::new_from_slice(&bytes)
            .map(Some)
            .map_err(|_| Error::msg("Secret key file is damaged"))
    }

    fn read_file(&self) -> Result<BTreeMap<String, String>> {
        let Some(cipher) = self.cipher(false)? else {
            return Ok(BTreeMap::new());
        };
        let Ok(data) = fs::read(self.file_path()) else {
            return Ok(BTreeMap::new());
        };
        if data.len() < 12 {
            return Err(Error::msg("Secrets file is damaged"));
        }
        let nonce = Nonce::try_from(&data[..12]).map_err(|_| Error::msg("Secrets file is damaged"))?;
        let plain = cipher
            .decrypt(&nonce, &data[12..])
            .map_err(|_| Error::msg("Secrets file could not be decrypted"))?;
        Ok(serde_json::from_slice(&plain)?)
    }

    fn write_file(&self, map: &BTreeMap<String, String>) -> Result<()> {
        if map.is_empty() {
            let _ = fs::remove_file(self.file_path());
            return Ok(());
        }
        let cipher = self.cipher(true)?.ok_or_else(|| Error::msg("No secret key"))?;
        let nonce = Nonce::generate();
        let mut out = nonce.as_slice().to_vec();
        out.extend(
            cipher
                .encrypt(&nonce, serde_json::to_vec(map)?.as_slice())
                .map_err(|_| Error::msg("Encryption failed"))?,
        );
        let p = self.file_path();
        let tmp = p.with_extension("tmp");
        fs::write(&tmp, out)?;
        restrict(&tmp)?;
        fs::rename(tmp, p)?;
        Ok(())
    }

    /// Stores a secret; returns where it went.
    pub fn set(&self, name: &str, value: &str) -> Result<Backend> {
        check(name)?;
        let value = value.trim();
        if value.is_empty() {
            self.delete(name)?;
            return Err(Error::msg("Empty key"));
        }
        if let Some(e) = self.entry(name) {
            if e.set_password(value).is_ok() {
                // make sure a stale fallback copy does not shadow the OS store
                let mut map = self.read_file()?;
                if map.remove(name).is_some() {
                    self.write_file(&map)?;
                }
                return Ok(Backend::Os);
            }
        }
        let mut map = self.read_file()?;
        map.insert(name.into(), value.into());
        self.write_file(&map)?;
        Ok(Backend::EncryptedFile)
    }

    pub fn get(&self, name: &str) -> Result<Option<String>> {
        check(name)?;
        if let Some(e) = self.entry(name) {
            if let Ok(v) = e.get_password() {
                return Ok(Some(v));
            }
        }
        Ok(self.read_file()?.remove(name))
    }

    /// Where a secret is stored, if anywhere. Never returns the value.
    pub fn location(&self, name: &str) -> Result<Option<Backend>> {
        check(name)?;
        if let Some(e) = self.entry(name) {
            if e.get_password().is_ok() {
                return Ok(Some(Backend::Os));
            }
        }
        Ok(self.read_file()?.contains_key(name).then_some(Backend::EncryptedFile))
    }

    pub fn delete(&self, name: &str) -> Result<()> {
        check(name)?;
        if let Some(e) = self.entry(name) {
            let _ = e.delete_credential();
        }
        let mut map = self.read_file()?;
        if map.remove(name).is_some() {
            self.write_file(&map)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Writes a dummy key to the real OS store under a test-only service name, then deletes it.
    /// `cargo test -p paperlines-core os_store -- --ignored`
    #[test]
    #[ignore = "touches the OS credential store"]
    fn os_store_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let s = Secrets::new(dir.path(), true).with_service(&format!("{}.selftest", branding::APP_ID));
        let backend = s.set("openalex", "dummy-test-value").unwrap();
        println!("stored via {backend:?}");
        assert_eq!(s.get("openalex").unwrap().as_deref(), Some("dummy-test-value"));
        s.delete("openalex").unwrap();
        assert_eq!(s.get("openalex").unwrap(), None);
        if cfg!(target_os = "macos") {
            assert_eq!(backend, Backend::Os, "macOS should use the Keychain");
            assert!(!dir.path().join("secrets.enc").exists());
        }
    }

    #[test]
    fn encrypted_file_fallback_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let s = Secrets::new(dir.path(), false);
        assert_eq!(s.get("openalex").unwrap(), None);
        assert_eq!(s.set("openalex", " abc123 ").unwrap(), Backend::EncryptedFile);
        s.set("semantic_scholar", "s2key").unwrap();
        assert_eq!(s.get("openalex").unwrap().as_deref(), Some("abc123"));
        assert_eq!(s.location("semantic_scholar").unwrap(), Some(Backend::EncryptedFile));
        let raw = fs::read(dir.path().join("secrets.enc")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("abc123"), "stored encrypted");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(dir.path().join("secrets.key"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        s.delete("openalex").unwrap();
        assert_eq!(s.get("openalex").unwrap(), None);
        assert!(s.get("unknown").is_err());
        // a tampered file is reported, not silently accepted
        let mut data = fs::read(dir.path().join("secrets.enc")).unwrap();
        let last = data.len() - 1;
        data[last] ^= 1;
        fs::write(dir.path().join("secrets.enc"), data).unwrap();
        assert!(s.get("semantic_scholar").is_err());
    }
}
