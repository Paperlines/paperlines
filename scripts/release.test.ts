import { describe, expect, it } from "vitest";
import {
  bumpCargoLock,
  bumpCargoToml,
  changelogNotes,
  contributorsFrom,
  latestJson,
  nextVersion,
  releaseBody,
  stampChangelog,
  updaterPlatforms,
} from "./release-lib.mjs";

describe("release helpers", () => {
  it("computes the next version", () => {
    expect(nextVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(nextVersion("0.1.3", "minor")).toBe("0.2.0");
    expect(nextVersion("0.9.3", "major")).toBe("1.0.0");
    expect(nextVersion("0.1.0", "current")).toBe("0.1.0");
    expect(nextVersion("0.1.0", "v2.0.1")).toBe("2.0.1");
    expect(() => nextVersion("0.1.0", "soon")).toThrow(/Unknown version/);
  });

  it("stamps the unreleased changelog section and returns its notes", () => {
    const log =
      "# What's new\n\n## Unreleased\n\n### Fixes\n- One\n\n## 0.1.0 (2026-11-25)\n\n- Old\n";
    const { text, notes } = stampChangelog(log, "0.1.1", "2026-12-01");
    expect(text).toContain("## 0.1.1 (2026-12-01)\n");
    expect(notes).toBe("### Fixes\n- One");
    expect(changelogNotes(text, "0.1.0")).toBe("- Old");
    // the first release's heading
    expect(
      stampChangelog("## 0.1.0 (not released yet)\n\nAll new.\n", "0.1.0", "2026-11-25").notes,
    ).toBe("All new.");
    // nothing unreleased: refuse
    expect(() => stampChangelog(text, "0.1.2", "2026-12-02")).toThrow(/Unreleased/);
  });

  it("bumps only the workspace's own crates", () => {
    const lock =
      '[[package]]\nname = "paperlines-core"\nversion = "0.1.0"\n\n[[package]]\nname = "other"\nversion = "0.1.0"\n';
    expect(bumpCargoLock(lock, "paperlines", "0.1.0", "0.2.0")).toBe(
      '[[package]]\nname = "paperlines-core"\nversion = "0.2.0"\n\n[[package]]\nname = "other"\nversion = "0.1.0"\n',
    );
    expect(
      bumpCargoToml('a = { version = "0.1.0", path = "../a" }\nb = "0.1.0"', "0.1.0", "0.2.0"),
    ).toBe('a = { version = "0.2.0", path = "../a" }\nb = "0.1.0"');
  });

  it("maps release assets to updater platforms", () => {
    expect(updaterPlatforms("Paperlines_aarch64.app.tar.gz")).toEqual(["darwin-aarch64"]);
    expect(updaterPlatforms("Paperlines_x64.app.tar.gz")).toEqual(["darwin-x86_64"]);
    expect(updaterPlatforms("Paperlines_0.2.0_amd64.AppImage")).toEqual(["linux-x86_64"]);
    expect(updaterPlatforms("Paperlines_0.2.0_aarch64.AppImage")).toEqual(["linux-aarch64"]);
    expect(updaterPlatforms("Paperlines_0.2.0_x64-setup.exe")).toEqual([
      "windows-x86_64",
      "windows-x86_64-nsis",
    ]);
    expect(updaterPlatforms("Paperlines_0.2.0_x64_en-US.msi")).toEqual(["windows-x86_64-msi"]);
    expect(updaterPlatforms("Paperlines_0.2.0_amd64.deb")).toEqual([]);
    expect(updaterPlatforms("Paperlines_aarch64.dmg")).toEqual([]);
  });

  it("writes latest.json only for signed bundles", () => {
    const j = latestJson({
      version: "0.2.0",
      notes: "- New",
      date: "2026-12-01T00:00:00Z",
      assets: [
        { name: "Paperlines_aarch64.app.tar.gz", url: "https://x/a" },
        { name: "Paperlines_0.2.0_amd64.AppImage", url: "https://x/b" },
        { name: "Paperlines_0.2.0_amd64.deb", url: "https://x/c" },
      ],
      signatures: { "Paperlines_aarch64.app.tar.gz": "SIG\n" },
      contributors: [],
    });
    expect(j.platforms).toEqual({ "darwin-aarch64": { signature: "SIG", url: "https://x/a" } });
    expect(j.pub_date).toBe("2026-12-01T00:00:00Z");
  });

  it("lists each contributor once, without bots or the organization", () => {
    const c = (login: string | null, name: string, type = "User") => ({
      author: login ? { login, type } : null,
      commit: { author: { name } },
    });
    const people = contributorsFrom([
      c("ada", "Ada Lovelace"),
      c("Ada", "Ada L."),
      c(null, "Grace Hopper"),
      c("dependabot[bot]", "dependabot[bot]", "Bot"),
      c("Paperlines", "paperlines", "Organization"),
      c(null, "github-actions[bot]"),
      c(null, "grace hopper"),
    ]);
    expect(people).toEqual([
      { login: "ada", name: "Ada Lovelace" },
      { login: null, name: "Grace Hopper" },
    ]);
    expect(releaseBody("- New", people)).toBe("- New\n\n**Contributors:** @ada, Grace Hopper");
    expect(releaseBody("- New", [])).toBe("- New");
  });
});
