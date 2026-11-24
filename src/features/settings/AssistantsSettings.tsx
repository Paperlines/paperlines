import type { AssistantStatus, AssistantsReport } from "@paperlines/backend-port";
import { Check, ChevronRight, Copy, FolderDown, Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { backend } from "../../backend";
import { AgentIcon } from "../../components/AgentIcon";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";

const firstSentence = (s: string) => s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s;

const installedIn = (r: AssistantsReport) => r.assistants.filter((a) => a.skill).length;

/** Recipe text without Markdown marks: `code` and **bold** read as plain words. */
const plain = (s: string) => s.replace(/[`*]/g, "");

/** One assistant: connect the server, install the skill, or copy the setup by hand. */
function AssistantRow({
  a,
  busy,
  run,
}: {
  a: AssistantStatus;
  busy: boolean;
  run(op: () => Promise<unknown>, done: string): void;
}) {
  const [manual, setManual] = useState(false);
  const state = !a.installed ? "missing" : a.stale ? "stale" : a.connected ? "connected" : "off";
  return (
    <li className="assistant" aria-label={a.name}>
      <div className="assistant-head">
        <AgentIcon agent={a.id} size={16} />
        <strong>{a.name}</strong>
        <span className={`assistant-state ${state}`}>{t(`ai.state.${state}`)}</span>
        <span className="spacer" />
        {a.installed && (
          <>
            {a.connected && !a.stale ? (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(
                    () => backend.assistantConnect(a.id, false),
                    t("ai.disconnected", { name: a.name }),
                  )
                }
              >
                {t("ai.disconnect")}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  run(
                    () => backend.assistantConnect(a.id, true),
                    t("ai.connected", { name: a.name }),
                  )
                }
              >
                {a.stale ? t("ai.update") : t("ai.connect")}
              </button>
            )}
            {a.skill !== null && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                aria-pressed={a.skill}
                title={a.skillPath ?? undefined}
                onClick={() =>
                  run(
                    () => backend.assistantSkill(a.id, !a.skill),
                    a.skill
                      ? t("ai.skillRemoved", { name: a.name })
                      : t("ai.skillAdded", { name: a.name }),
                  )
                }
              >
                {a.skill ? (
                  <>
                    <Check size={14} aria-hidden="true" /> {t("ai.skillOn")}
                  </>
                ) : (
                  t("ai.skillAdd")
                )}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-expanded={manual}
          aria-label={t("ai.manual", { name: a.name })}
          title={t("ai.manual", { name: a.name })}
          onClick={() => setManual(!manual)}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      </div>
      {manual && (
        <div className="assistant-manual">
          <span className="field-hint">
            {a.id === "claude-code"
              ? t("ai.manualRun")
              : t("ai.manualHint", { path: a.configPath })}
          </span>
          <div className="row">
            <pre className="code-block">{a.manual}</pre>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("maint.copy")}
              title={t("maint.copy")}
              onClick={() => navigator.clipboard?.writeText(a.manual)}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Settings → AI assistants: let Claude, Codex, Antigravity and others use the library through
 * the MCP server, and give them a skill that explains how.
 */
export function AssistantsSettings() {
  const [report, setReport] = useState<AssistantsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const load = useCallback(
    () =>
      backend
        .assistantsStatus()
        .then(setReport)
        .catch((e) => setError(String(e))),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  const run = async (op: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await op();
      setMsg(`${done} ${t("ai.restart")}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      load();
    }
  };

  const installed = report?.assistants.filter((a) => a.installed) ?? [];
  const others = report?.assistants.filter((a) => !a.installed) ?? [];

  return (
    <>
      <div className="field">
        <span className="field-label">
          {t("ai.title")}
          <InfoTip label={t("help.about", { what: t("ai.title") })}>{t("help.ai")}</InfoTip>
        </span>
        <span className="field-hint">{t("ai.intro")}</span>
      </div>
      {error && <div className="alert">{error}</div>}
      {msg && (
        <div className="alert alert-info" role="status">
          {msg}
        </div>
      )}
      {report && (
        <>
          <ul className="assistants" aria-label={t("ai.list")}>
            {installed.map((a) => (
              <AssistantRow key={a.id} a={a} busy={busy} run={run} />
            ))}
          </ul>
          {installed.length === 0 && <span className="field-hint">{t("ai.noneFound")}</span>}
          {others.length > 0 && (
            <div className="field">
              <span className="field-label">{t("ai.notFound")}</span>
              <span className="field-hint">{t("ai.notFoundHint")}</span>
              <ul className="assistants" aria-label={t("ai.notFound")}>
                {others.map((a) => (
                  <AssistantRow key={a.id} a={a} busy={busy} run={run} />
                ))}
              </ul>
            </div>
          )}
          <section className="field" aria-label={t("ai.skills")}>
            <span className="field-label">{t("ai.skills")}</span>
            <span className="field-hint">{t("ai.skillHint")}</span>
            {report.skills.map((s) => (
              <details key={s.name} className="skill-card">
                <summary className="skill-head" aria-label={t("ai.skillToggle", { name: s.name })}>
                  <ChevronRight size={14} className="skill-chevron" aria-hidden="true" />
                  <code>{s.name}</code>
                  <span className="skill-state muted small">
                    {installedIn(report) === 0
                      ? t("ai.skillNotInstalled")
                      : t("ai.skillInstalled", { n: installedIn(report) })}
                  </span>
                  <span className="skill-when">{s.description}</span>
                </summary>
                <div className="skill-body">
                  <span className="skill-sub">{t("ai.skillAsk")}</span>
                  <ul className="skill-abilities">
                    {s.abilities.map(([title, how]) => (
                      <li key={title}>
                        <strong>{title}</strong> <span className="muted">{plain(how)}</span>
                      </li>
                    ))}
                  </ul>
                  <span className="skill-sub">{t("ai.skillRules")}</span>
                  <ul className="skill-rules">
                    {s.rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={async () => {
                  const dir = (await backend.pickPaths("folder"))?.[0];
                  if (dir)
                    run(() => backend.assistantSaveSkill(dir), t("ai.skillSaved", { path: dir }));
                }}
              >
                <FolderDown size={14} aria-hidden="true" /> {t("ai.saveSkill")}
              </button>
            </div>
          </section>
          <div className="field">
            <button
              type="button"
              className="panel-head"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen(!toolsOpen)}
            >
              <ChevronRight size={14} aria-hidden="true" />
              {t("ai.tools", { n: report.tools.length })}
            </button>
            {toolsOpen && (
              <ul className="ai-tools" aria-label={t("ai.toolsList")}>
                {report.tools.map((tool) => (
                  <li key={tool.name}>
                    <code>{tool.name}</code>
                    <span className={`tool-kind${tool.readOnly ? "" : " writes"}`}>
                      {tool.readOnly ? t("ai.reads") : t("ai.writes")}
                    </span>
                    <span className="muted small">{firstSentence(tool.description)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span className="field-hint">
            {t("ai.command")} <code className="path">{report.command} mcp</code>
          </span>
        </>
      )}
    </>
  );
}
