use std::io::Write;
use std::process::{Command, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_paperlines");

fn cli(lib: &std::path::Path, args: &[&str]) -> (i32, String, String) {
    let o = Command::new(BIN).arg("--library").arg(lib).args(args).output().unwrap();
    (
        o.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&o.stdout).into(),
        String::from_utf8_lossy(&o.stderr).into(),
    )
}

#[test]
fn end_to_end_against_a_temporary_library() {
    let dir = tempfile::tempdir().unwrap();
    let lib = dir.path().join("lib");
    let bib = dir.path().join("in.bib");
    std::fs::write(
        &bib,
        "@inproceedings{vaswani2017attention, title={Attention Is All You Need}, author={Vaswani, Ashish}, year=2017, eprint={1706.03762}, archivePrefix={arXiv}}\n\
         @article{devlin2019bert, title={BERT}, author={Devlin, Jacob}, year=2019, keywords={x}}",
    )
    .unwrap();

    let (code, out, _) = cli(&lib, &["add", "--offline", bib.to_str().unwrap()]);
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("added 2 paper(s)"), "{out}");
    let (_, out, _) = cli(&lib, &["add", "--offline", bib.to_str().unwrap()]);
    assert!(out.contains("skipped duplicate"), "duplicates are skipped: {out}");

    let (_, out, _) = cli(&lib, &["--json", "search", "attention"]);
    let v: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(v["results"][0]["citekey"], "vaswani2017attention");

    let (code, _, _) = cli(
        &lib,
        &["note", "devlin2019bert", "--add", "Builds on [[vaswani2017attention]]"],
    );
    assert_eq!(code, 0);
    let (_, out, _) = cli(&lib, &["show", "devlin2019bert"]);
    assert!(out.contains("- Builds on [[vaswani2017attention]]"), "{out}");

    let (_, out, _) = cli(&lib, &["export", "--format", "bibtex", "vaswani2017attention"]);
    assert!(out.starts_with("@inproceedings{vaswani2017attention,"), "{out}");
    let out_file = dir.path().join("all.ris");
    let (code, _, err) = cli(&lib, &["export", "-f", "ris", "-o", out_file.to_str().unwrap()]);
    assert_eq!(code, 0, "{err}");
    assert!(std::fs::read_to_string(&out_file).unwrap().contains("TY  - CONF"));

    let (code, out, _) = cli(&lib, &["doctor"]);
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("everything looks good"));
    let (code, out, _) = cli(&lib, &["backup"]);
    assert_eq!(code, 0);
    assert!(out.contains("manual-"));
    let (code, _, err) = cli(&lib, &["backup", "--restore", "nope.sqlite"]);
    assert_eq!(code, 1);
    assert!(err.contains("--yes"));

    let (code, _, err) = cli(&lib, &["show", "nobody2020"]);
    assert_eq!(code, 1);
    assert!(err.contains("No paper matches"));

    // citation styles, Trash and auto-export
    let (_, out, _) = cli(&lib, &["cite", "vaswani2017attention", "--style", "apa"]);
    assert_eq!(out.trim(), "(Vaswani, 2017)");
    let (_, out, _) = cli(
        &lib,
        &["cite", "-b", "vaswani2017attention", "devlin2019bert", "-s", "ieee"],
    );
    assert!(out.contains("[1]") && out.contains("Attention"), "{out}");
    let bib_out = dir.path().join("live.bib");
    let (code, _, err) = cli(&lib, &["auto-export", "add", bib_out.to_str().unwrap()]);
    assert_eq!(code, 0, "{err}");
    assert!(std::fs::read_to_string(&bib_out).unwrap().contains("devlin2019bert"));
    let (code, out, _) = cli(&lib, &["rm", "devlin2019bert"]);
    assert_eq!(code, 0, "{out}");
    assert!(
        !std::fs::read_to_string(&bib_out).unwrap().contains("devlin2019bert"),
        "auto-export follows the Trash"
    );
    let (_, out, _) = cli(&lib, &["trash"]);
    assert!(out.contains("devlin2019bert"));
    let (code, _, _) = cli(&lib, &["trash", "restore", "devlin2019bert"]);
    assert_eq!(code, 0);
    assert!(std::fs::read_to_string(&bib_out).unwrap().contains("devlin2019bert"));
    let (_, out, _) = cli(&lib, &["duplicates"]);
    assert!(out.contains("no duplicates found"), "{out}");

    // MCP over a real pipe
    let mut child = Command::new(BIN)
        .arg("--library")
        .arg(&lib)
        .arg("mcp")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    {
        let stdin = child.stdin.as_mut().unwrap();
        writeln!(
            stdin,
            r#"{{"jsonrpc":"2.0","id":1,"method":"initialize","params":{{"protocolVersion":"2025-06-18"}}}}"#
        )
        .unwrap();
        writeln!(stdin, r#"{{"jsonrpc":"2.0","method":"notifications/initialized"}}"#).unwrap();
        writeln!(stdin, r#"{{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{{"name":"get_paper_note","arguments":{{"key":"devlin2019bert"}}}}}}"#).unwrap();
    }
    let out = child.wait_with_output().unwrap();
    let lines: Vec<serde_json::Value> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 2);
    assert!(lines[1]["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Builds on"));
}

#[test]
fn citing_papers_from_the_cache_and_clear_errors() {
    let dir = tempfile::tempdir().unwrap();
    let lib = dir.path().join("lib");
    let bib = dir.path().join("in.bib");
    std::fs::write(
        &bib,
        "@article{vaswani2017attention, title={Attention Is All You Need}, author={Vaswani, Ashish}, year=2017, doi={10.1/attn}}\n\
         @article{devlin2019bert, title={BERT: Pre-training}, author={Devlin, Jacob}, year=2019, doi={10.1/bert}}\n\
         @article{noids2020, title={No Identifiers Here}, author={Doe, Jane}, year=2020}",
    )
    .unwrap();
    let (code, out, _) = cli(&lib, &["add", "--offline", bib.to_str().unwrap()]);
    assert_eq!(code, 0, "{out}");

    // no DOI or arXiv ID: a clear message, no network
    let (code, _, err) = cli(&lib, &["citing", "noids2020"]);
    assert_ne!(code, 0);
    assert!(err.contains("no DOI or arXiv ID"), "{err}");

    // a cached list (as the app would have stored it) is used without asking the network
    {
        let db = paperlines_core::db::Db::open(&lib.join("library.sqlite")).unwrap();
        let id: i64 = db
            .conn
            .query_row("SELECT id FROM items WHERE citekey = 'vaswani2017attention'", [], |r| {
                r.get(0)
            })
            .unwrap();
        db.conn
            .execute(
                "UPDATE items SET openalex_id = 'W2' WHERE citekey = 'devlin2019bert'",
                [],
            )
            .unwrap();
        let works = serde_json::json!([
            {"openalexId": "W9", "title": "A Survey of Transformers", "year": 2021, "citedByCount": 50, "authors": ["Lin, T."], "references": ["W2"]},
            {"openalexId": "W2", "doi": "10.1/bert", "title": "BERT: Pre-training", "year": 2019, "citedByCount": 900, "authors": ["Devlin, J."]},
            {"openalexId": "W8", "title": "Newer Work", "year": 2024, "citedByCount": 5, "authors": []}
        ]);
        db.conn
            .execute(
                "INSERT INTO citing_cache(item_id, source, total, works_json, fetched_at) VALUES (?1, 'openalex', 1234, ?2, datetime('now'))",
                paperlines_core::rusqlite::params![id, works.to_string()],
            )
            .unwrap();
    }
    let (code, out, err) = cli(&lib, &["citing", "vaswani2017attention"]);
    assert_eq!(code, 0, "{err}");
    assert!(
        out.starts_with("1234 papers cite vaswani2017attention (OpenAlex"),
        "{out}"
    );
    assert!(out.contains("[in library: devlin2019bert]"), "{out}");
    assert!(
        out.contains("A Survey of Transformers") && out.contains("[also cites devlin2019bert]"),
        "{out}"
    );

    let (_, out, _) = cli(
        &lib,
        &[
            "--json",
            "citing",
            "vaswani2017attention",
            "--sort",
            "newest",
            "-n",
            "2",
        ],
    );
    let v: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(v["papers"].as_array().unwrap().len(), 2);
    assert_eq!(v["papers"][0]["title"], "Newer Work");
    let (_, out, _) = cli(
        &lib,
        &["--json", "citing", "vaswani2017attention", "--sort", "connected"],
    );
    let v: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(v["papers"][0]["connected"][0], "devlin2019bert");

    let (code, _, err) = cli(&lib, &["citing", "vaswani2017attention", "--sort", "best"]);
    assert_ne!(code, 0);
    assert!(err.contains("cited, newest or connected"), "{err}");
}

#[test]
fn typed_connections_from_the_command_line() {
    let dir = tempfile::tempdir().unwrap();
    let lib = dir.path().join("lib");
    let bib = dir.path().join("in.bib");
    std::fs::write(
        &bib,
        "@article{smith2021, title={Foundations}, author={Smith, A}, year=2021}\n\
         @article{chen2022, title={Refinement}, author={Chen, B}, year=2022}\n\
         @article{patel2023, title={Application}, author={Patel, C}, year=2023}",
    )
    .unwrap();
    assert_eq!(cli(&lib, &["add", "--offline", bib.to_str().unwrap()]).0, 0);

    let (code, out, err) = cli(
        &lib,
        &["relate", "chen2022", "extends", "smith2021", "--note", "same loss"],
    );
    assert_eq!(code, 0, "{err}");
    assert_eq!(out.trim(), "chen2022 extends smith2021");
    // the inverse wording flips the direction
    let (_, out, _) = cli(&lib, &["relate", "smith2021", "contradicted-by", "patel2023"]);
    assert_eq!(out.trim(), "patel2023 contradicts smith2021");

    let (_, out, _) = cli(&lib, &["relations", "smith2021"]);
    assert!(out.contains("smith2021 extended by chen2022  — same loss"), "{out}");
    assert!(out.contains("smith2021 contradicted by patel2023"), "{out}");

    let (code, _, err) = cli(
        &lib,
        &[
            "relation-types",
            "add",
            "Supports",
            "--inverse",
            "Supported by",
            "--color",
            "teal",
        ],
    );
    assert_eq!(code, 0, "{err}");
    assert_eq!(cli(&lib, &["relate", "patel2023", "supports", "chen2022"]).0, 0);
    let (_, out, _) = cli(&lib, &["--json", "relations"]);
    let v: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(v.as_array().unwrap().len(), 3);

    let (code, _, err) = cli(&lib, &["relate", "chen2022", "refutes", "smith2021"]);
    assert_ne!(code, 0);
    assert!(err.contains("No connection type called “refutes”"), "{err}");
    assert_eq!(cli(&lib, &["unrelate", "chen2022", "extends", "smith2021"]).0, 0);
    let (_, out, _) = cli(&lib, &["relations", "chen2022"]);
    assert!(!out.contains("extends"), "{out}");
    // types you made can go (with their connections); built-in ones can't
    assert_eq!(cli(&lib, &["relation-types", "remove", "supports"]).0, 0);
    assert_ne!(cli(&lib, &["relation-types", "remove", "extends"]).0, 0);
}

#[test]
fn a_projects_spine_from_the_command_line() {
    let dir = tempfile::tempdir().unwrap();
    let lib = dir.path().join("lib");
    let bib = dir.path().join("in.bib");
    std::fs::write(
        &bib,
        "@article{smith2018, title={Foundations}, author={Smith, A}, year=2018}\n\
         @article{garza2019, title={Foundations Too}, author={Garza, G}, year=2019}\n\
         @article{chen2022, title={Refinement}, author={Chen, B}, year=2022}",
    )
    .unwrap();
    assert_eq!(cli(&lib, &["add", "--offline", bib.to_str().unwrap()]).0, 0);
    // projects are made in the app; the dump import is the CLI's way in
    let dump = dir.path().join("dump.json");
    let (_, out, _) = cli(&lib, &["export", "-f", "json"]);
    let mut v: serde_json::Value = serde_json::from_str(&out).unwrap();
    v["projects"] = serde_json::json!([{"name": "Thesis", "papers": [], "spine": []}]);
    std::fs::write(&dump, v.to_string()).unwrap();
    let lib2 = dir.path().join("lib2");
    assert_eq!(cli(&lib2, &["import-dump", dump.to_str().unwrap()]).0, 0);

    assert_eq!(cli(&lib2, &["spine", "Thesis", "add", "smith2018"]).0, 0);
    let (code, _, err) = cli(&lib2, &["spine", "Thesis", "add", "garza2019", "--step", "1"]);
    assert_eq!(code, 0, "{err}");
    let (_, out, _) = cli(&lib2, &["spine", "Thesis", "add", "chen2022"]);
    assert_eq!(out.trim(), "1. smith2018 + garza2019\n2. chen2022");
    let (_, out, _) = cli(&lib2, &["spine", "thesis", "remove", "smith2018"]);
    assert_eq!(out.trim(), "1. garza2019\n2. chen2022");
    let (code, _, err) = cli(&lib2, &["spine", "Nope"]);
    assert_ne!(code, 0);
    assert!(err.contains("No project called “Nope”"), "{err}");
}

/// What Chrome does: start the binary with the extension's origin and talk through a pipe.
#[test]
fn browser_extension_over_native_messaging() {
    let dir = tempfile::tempdir().unwrap();
    let lib = dir.path().join("lib");
    let mut child = Command::new(BIN)
        .arg("chrome-extension://nalppkjoajknnmhpgfbdinkjmgnggdnk/")
        .env("PAPERLINES_LIBRARY", &lib)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let send = |w: &mut std::process::ChildStdin, v: serde_json::Value| {
        let body = serde_json::to_vec(&v).unwrap();
        w.write_all(&(body.len() as u32).to_ne_bytes()).unwrap();
        w.write_all(&body).unwrap();
    };
    // a page without identifiers, so nothing is looked up online
    let page = serde_json::json!({
        "title": "A Paper Found on the Web",
        "authors": ["Ada Lovelace"],
        "year": 1843,
        "url": "https://example.org/notes"
    });
    send(&mut stdin, serde_json::json!({"type": "ping"}));
    send(&mut stdin, serde_json::json!({"type": "lookup", "page": page}));
    send(&mut stdin, serde_json::json!({"type": "save", "page": page}));
    send(&mut stdin, serde_json::json!({"type": "lookup", "page": page}));
    drop(stdin);
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    let mut replies = Vec::new();
    let mut rest = out.stdout.as_slice();
    while rest.len() >= 4 {
        let len = u32::from_ne_bytes(rest[..4].try_into().unwrap()) as usize;
        replies.push(serde_json::from_slice::<serde_json::Value>(&rest[4..4 + len]).unwrap());
        rest = &rest[4 + len..];
    }
    assert_eq!(replies.len(), 4, "{replies:?}");
    assert_eq!(replies[0]["type"], "pong");
    assert_eq!(replies[1], serde_json::json!({"type": "found", "item": null}));
    assert_eq!(replies[2]["type"], "saved");
    assert_eq!(replies[2]["added"], true);
    assert_eq!(replies[2]["item"]["title"], "A Paper Found on the Web");
    assert_eq!(replies[3]["item"]["citekey"], replies[2]["item"]["citekey"]);
    // and it is in the library for the CLI (and the app) to see
    let (_, out, _) = cli(&lib, &["--json", "search", "web"]);
    assert!(out.contains("A Paper Found on the Web"), "{out}");
}
