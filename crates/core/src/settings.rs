use crate::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const DEFAULT_NOTE_TEMPLATE: &str = "- Key idea: \n- Method: \n- Why it matters: ";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HighlightColor {
    pub color: String,
    pub label: String,
}

/// The five colours every library starts with, in this order; their purpose can be renamed but
/// they can't be removed.
pub const BASE_HIGHLIGHT_COLORS: &[(&str, &str)] = &[
    ("yellow", "Key idea"),
    ("red", "Disagree"),
    ("green", "Method"),
    ("blue", "Definition"),
    ("purple", "Question"),
];

/// The colours a user can add after those, each with a suggested purpose to start from.
pub const EXTRA_HIGHLIGHT_COLORS: &[(&str, &str)] = &[
    ("orange", "To check"),
    ("pink", "Result"),
    ("teal", "Example"),
    ("lime", "Idea to try"),
    ("brown", "Background"),
    ("gray", "Not relevant"),
];

pub fn default_highlight_colors() -> Vec<HighlightColor> {
    BASE_HIGHLIGHT_COLORS
        .iter()
        .map(|(c, l)| HighlightColor {
            color: (*c).into(),
            label: (*l).into(),
        })
        .collect()
}

/// The five base colours first, always and in order (keeping the user's names for them), then
/// any added colours from the palette, each once. An empty purpose falls back to the suggestion.
pub fn normalize_highlight_colors(list: &[HighlightColor]) -> Vec<HighlightColor> {
    let label = |color: &str, fallback: &str| {
        list.iter()
            .find(|c| c.color == color)
            .map(|c| c.label.trim())
            .filter(|l| !l.is_empty())
            .unwrap_or(fallback)
            .to_string()
    };
    let mut out: Vec<HighlightColor> = BASE_HIGHLIGHT_COLORS
        .iter()
        .map(|(c, l)| HighlightColor {
            color: (*c).into(),
            label: label(c, l),
        })
        .collect();
    for c in list {
        let Some((_, suggested)) = EXTRA_HIGHLIGHT_COLORS.iter().find(|(e, _)| *e == c.color) else {
            continue;
        };
        if out.iter().any(|o| o.color == c.color) {
            continue;
        }
        out.push(HighlightColor {
            color: c.color.clone(),
            label: label(&c.color, suggested),
        });
    }
    out
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub offline_mode: bool,
    pub paper_note_template: String,
    pub highlight_colors: Vec<HighlightColor>,
    pub vim_mode: bool,
    /// Fetch reference lists automatically when papers are added (not in offline mode).
    pub auto_fetch_references: bool,
    /// Download a legal open-access PDF for papers added without a file (not in offline mode).
    pub auto_find_pdfs: bool,
    /// The user's own GROBID server for papers without DOI/arXiv ID, e.g. http://localhost:8070.
    pub grobid_url: Option<String>,
    /// CSL style id for "Copy citation" and formatted bibliographies (e.g. "apa", "ieee").
    pub citation_style: String,
    /// Papers in the Trash are deleted for good after this many days (0 = never).
    pub trash_days: i64,
    /// Look for a new version on GitHub when the app opens (not in offline mode).
    pub check_for_updates: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub offline_mode: Option<bool>,
    pub paper_note_template: Option<String>,
    pub highlight_colors: Option<Vec<HighlightColor>>,
    pub vim_mode: Option<bool>,
    pub auto_fetch_references: Option<bool>,
    pub auto_find_pdfs: Option<bool>,
    /// Some("") clears it.
    pub grobid_url: Option<String>,
    pub citation_style: Option<String>,
    pub trash_days: Option<i64>,
    pub check_for_updates: Option<bool>,
}

fn get(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .optional()?)
}

fn set(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn load(conn: &Connection) -> Result<Settings> {
    Ok(Settings {
        offline_mode: get(conn, "offline_mode")?.as_deref() == Some("true"),
        paper_note_template: get(conn, "paper_note_template")?.unwrap_or_else(|| DEFAULT_NOTE_TEMPLATE.into()),
        highlight_colors: get(conn, "highlight_colors")?
            .and_then(|v| serde_json::from_str::<Vec<HighlightColor>>(&v).ok())
            .map(|v| normalize_highlight_colors(&v))
            .unwrap_or_else(default_highlight_colors),
        vim_mode: get(conn, "vim_mode")?.as_deref() == Some("true"),
        auto_fetch_references: get(conn, "auto_fetch_references")?.as_deref() != Some("false"),
        auto_find_pdfs: get(conn, "auto_find_pdfs")?.as_deref() != Some("false"),
        grobid_url: get(conn, "grobid_url")?.filter(|u| !u.is_empty()),
        citation_style: get(conn, "citation_style")?
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "apa".into()),
        trash_days: get(conn, "trash_days")?.and_then(|d| d.parse().ok()).unwrap_or(30),
        check_for_updates: get(conn, "check_for_updates")?.as_deref() != Some("false"),
    })
}

pub fn apply(conn: &Connection, patch: &SettingsPatch) -> Result<Settings> {
    let b = |v: bool| if v { "true" } else { "false" };
    if let Some(v) = patch.offline_mode {
        set(conn, "offline_mode", b(v))?;
    }
    if let Some(v) = &patch.paper_note_template {
        set(conn, "paper_note_template", v)?;
    }
    if let Some(v) = &patch.highlight_colors {
        for c in v {
            if !crate::highlights::COLORS.contains(&c.color.as_str()) {
                return Err(crate::Error::msg(format!("Unknown highlight color: {}", c.color)));
            }
        }
        set(
            conn,
            "highlight_colors",
            &serde_json::to_string(&normalize_highlight_colors(v))?,
        )?;
    }
    if let Some(v) = patch.vim_mode {
        set(conn, "vim_mode", b(v))?;
    }
    if let Some(v) = patch.auto_fetch_references {
        set(conn, "auto_fetch_references", b(v))?;
    }
    if let Some(v) = patch.auto_find_pdfs {
        set(conn, "auto_find_pdfs", b(v))?;
    }
    if let Some(v) = patch.check_for_updates {
        set(conn, "check_for_updates", b(v))?;
    }
    if let Some(v) = &patch.citation_style {
        set(conn, "citation_style", v.trim())?;
    }
    if let Some(d) = patch.trash_days {
        if !(0..=3650).contains(&d) {
            return Err(crate::Error::msg("Keep papers in the Trash for 0 to 3650 days"));
        }
        set(conn, "trash_days", &d.to_string())?;
    }
    if let Some(v) = &patch.grobid_url {
        let v = v.trim().trim_end_matches('/');
        if !v.is_empty() && !(v.starts_with("http://") || v.starts_with("https://")) {
            return Err(crate::Error::msg(
                "The GROBID address must start with http:// or https://",
            ));
        }
        set(conn, "grobid_url", v)?;
    }
    load(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn defaults_and_patch() {
        let db = Db::open_in_memory().unwrap();
        let s = load(&db.conn).unwrap();
        assert!(!s.offline_mode && !s.vim_mode);
        assert_eq!(s.paper_note_template, DEFAULT_NOTE_TEMPLATE);
        assert_eq!(s.highlight_colors[0].label, "Key idea");
        let s = apply(
            &db.conn,
            &SettingsPatch {
                offline_mode: Some(true),
                vim_mode: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(s.offline_mode && s.vim_mode);
        assert!(s.auto_fetch_references && s.grobid_url.is_none());
        assert!(s.auto_find_pdfs, "on by default");
        assert!(s.check_for_updates, "on by default");
        let s = apply(
            &db.conn,
            &SettingsPatch {
                check_for_updates: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(!s.check_for_updates);
        let s = apply(
            &db.conn,
            &SettingsPatch {
                grobid_url: Some("http://localhost:8070/".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.grobid_url.as_deref(), Some("http://localhost:8070"));
        assert!(apply(
            &db.conn,
            &SettingsPatch {
                grobid_url: Some("localhost".into()),
                ..Default::default()
            }
        )
        .is_err());
        let bad = SettingsPatch {
            highlight_colors: Some(vec![HighlightColor {
                color: "magenta".into(),
                label: "x".into(),
            }]),
            ..Default::default()
        };
        assert!(apply(&db.conn, &bad).is_err());
    }

    #[test]
    fn the_five_colours_always_come_first_and_extras_come_from_the_palette() {
        let db = Db::open_in_memory().unwrap();
        let hc = |c: &str, l: &str| HighlightColor {
            color: c.into(),
            label: l.into(),
        };
        // the user renames one base colour, adds two from the palette (one twice), drops "blue"
        let s = apply(
            &db.conn,
            &SettingsPatch {
                highlight_colors: Some(vec![
                    hc("pink", "Finding"),
                    hc("yellow", "Main claim"),
                    hc("teal", "  "),
                    hc("pink", "again"),
                ]),
                ..Default::default()
            },
        )
        .unwrap();
        let got: Vec<(&str, &str)> = s
            .highlight_colors
            .iter()
            .map(|c| (c.color.as_str(), c.label.as_str()))
            .collect();
        assert_eq!(
            got,
            vec![
                ("yellow", "Main claim"),
                ("red", "Disagree"),
                ("green", "Method"),
                ("blue", "Definition"),
                ("purple", "Question"),
                ("pink", "Finding"),
                ("teal", "Example"),
            ],
            "base five first and in order, the user's name kept, extras once, empty purpose = suggestion"
        );
        // a stored list missing the base colours is repaired on load
        set(&db.conn, "highlight_colors", r#"[{"color":"gray","label":"Skip"}]"#).unwrap();
        let s = load(&db.conn).unwrap();
        assert_eq!(s.highlight_colors.len(), 6);
        assert_eq!(s.highlight_colors[0].color, "yellow");
        assert_eq!(s.highlight_colors[5].label, "Skip");
        assert!(EXTRA_HIGHLIGHT_COLORS
            .iter()
            .chain(BASE_HIGHLIGHT_COLORS)
            .all(|(c, _)| crate::highlights::COLORS.contains(c)));
    }
}
