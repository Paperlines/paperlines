import type { AgentChatSummary } from "@paperlines/backend-port";
import { linkFromClick, renderMarkdown } from "@paperlines/notes-editor";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Highlighter,
  History,
  Library,
  LoaderCircle,
  Lock,
  Network,
  NotebookPen,
  PencilLine,
  RefreshCw,
  Scale,
  Settings,
  Square,
  SquarePen,
  Telescope,
  Trash2,
  X,
} from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { backend } from "../../backend";
import { AgentIcon } from "../../components/AgentIcon";
import { paneSlack } from "../../components/paneRoom";
import { t } from "../../i18n";
import type { MessageKey } from "../../i18n/en";
import { type ChatAbout, type ChatMsg, type Part, useAgent } from "../../store/agent";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";
import { shortAuthors } from "../library/filter";
import { useFollowLink, useLinkHover, useLinkTargets } from "../notes/links";

interface Focus {
  kind: "paper" | "note";
  /** Shown in the composer, e.g. @vaswani2017attention. */
  label: string;
  title: string;
  sub: string;
  /** Sent in front of the message. */
  text: string;
  /** What a chat started here is about (for the history). */
  about: ChatAbout;
}

/** What the user has open, so "this paper" means something to the assistant. */
function useFocus(): Focus | null {
  const items = useLibrary((s) => s.items);
  const selectedId = useUi((s) => s.selectedId);
  const right = usePanes((s) => s.right);
  const { notes } = useLinkTargets();
  return useMemo(() => {
    const paper = (id: number, reading: boolean): Focus | null => {
      const i = items.find((x) => x.id === id);
      if (!i) return null;
      const who = `${shortAuthors(i.authors)}${i.year ? `, ${i.year}` : ""}`;
      return {
        kind: "paper",
        label: `@${i.citekey}`,
        title: i.title,
        sub: who,
        text: `${reading ? "Reading the PDF of" : "Selected paper:"} @${i.citekey}: "${i.title}" (${who})`,
        about: { itemId: i.id, noteId: null },
      };
    };
    if (right?.kind === "reader") return paper(right.itemId, true);
    if (right?.kind === "note") {
      const n = notes.find((x) => x.noteId === right.noteId);
      if (n)
        return {
          kind: "note",
          label: n.title,
          title: n.title,
          sub: t("agent.focusNote"),
          text: `Note open: "${n.title}"`,
          about: { itemId: null, noteId: n.noteId },
        };
    }
    return selectedId !== null ? paper(selectedId, false) : null;
  }, [items, selectedId, right, notes]);
}

const STEP: Record<string, MessageKey> = {
  search_library: "agent.tool.search_library",
  get_item: "agent.tool.get_item",
  get_paper_note: "agent.tool.get_paper_note",
  list_citations: "agent.tool.list_citations",
  find_citing_papers: "agent.tool.find_citing_papers",
  search_online: "agent.tool.search_online",
  list_relations: "agent.tool.list_relations",
  add_relation: "agent.tool.add_relation",
  add_bullet: "agent.tool.add_bullet",
  format_citation: "agent.tool.format_citation",
  export_bibliography: "agent.tool.export_bibliography",
  list_projects: "agent.tool.list_projects",
  get_project: "agent.tool.get_project",
  library_overview: "agent.tool.library_overview",
  suggest_papers: "agent.tool.suggest_papers",
  post_suggestions: "agent.tool.post_suggestions",
  read_pdf: "agent.tool.read_pdf",
  list_highlights: "agent.tool.list_highlights",
  add_highlights: "agent.tool.add_highlights",
  list_notes: "agent.tool.list_notes",
  get_note: "agent.tool.get_note",
  create_note: "agent.tool.create_note",
  append_to_note: "agent.tool.append_to_note",
};
const stepLabel = (name: string) => (STEP[name] ? t(STEP[name]) : name.replace(/_/g, " "));

/** The one argument worth showing next to a step. */
function stepArg(input: Record<string, unknown>): string {
  for (const k of ["query", "key", "note", "title", "project", "from"]) {
    const v = input[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

/** Markdown with working @citekey, [[link]] and highlight links. */
function Markdown({ text }: { text: string }) {
  const { resolve } = useLinkTargets();
  const follow = useFollowLink(null);
  const hover = useLinkHover();
  const html = useMemo(() => renderMarkdown(text, { resolve }), [text, resolve]);
  const linkAt = (target: EventTarget) => {
    const a = (target as HTMLElement).closest("a");
    const link = a && linkFromClick(a);
    return link ? { a, link } : null;
  };
  return (
    <div
      className="as-md md-preview"
      // the renderer runs with html: false, so a reply can't inject markup
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const link = linkFromClick(e.target);
        if (!link) return;
        e.preventDefault();
        follow(link);
      }}
      onMouseOver={(e) => {
        const l = linkAt(e.target);
        if (l) hover(l.link, l.a.getBoundingClientRect());
      }}
      onMouseOut={(e) => {
        const l = linkAt(e.target);
        if (l) hover(l.link, null);
      }}
    />
  );
}

type Tool = Extract<Part, { kind: "tool" }>;

/** A run of tool calls as one quiet line ("3 steps"), open for the details; changes stay visible. */
function Steps({ steps, live }: { steps: Tool[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const current = live ? steps.find((s) => s.status === "running") : undefined;
  const failed = steps.filter((s) => s.status === "error").length;
  const changes = steps.filter((s) => s.changed);
  const head = current
    ? `${stepLabel(current.name)}…`
    : steps.length === 1
      ? stepLabel(steps[0].name)
      : t("agent.steps", { n: steps.length });
  return (
    <div className="as-steps">
      <button
        type="button"
        className="as-steps-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {current ? (
          <LoaderCircle size={13} className="spin" aria-hidden="true" />
        ) : (
          <ChevronRight size={13} className={open ? "turned" : ""} aria-hidden="true" />
        )}
        <span>{head}</span>
        {failed > 0 && !current ? (
          <span className="as-steps-bad">{t("agent.stepsFailed", { n: failed })}</span>
        ) : null}
      </button>
      {open && (
        <ol className="as-steps-list">
          {steps.map((s) => (
            <li key={s.id} className={s.status}>
              <span className="as-step-name">{stepLabel(s.name)}</span>
              {stepArg(s.input) ? <span className="as-step-arg">{stepArg(s.input)}</span> : null}
              {s.summary ? <div className="as-step-summary">{s.summary}</div> : null}
            </li>
          ))}
        </ol>
      )}
      {changes.map((c) => (
        <div key={c.id} className="as-change">
          <PencilLine size={13} aria-hidden="true" />
          <span>
            {stepLabel(c.name)}
            {stepArg(c.input) ? <b> {stepArg(c.input)}</b> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function Reply({ msg, live }: { msg: ChatMsg; live: boolean }) {
  // consecutive tool calls become one Steps line
  const blocks: ({ kind: "steps"; steps: Tool[] } | Exclude<Part, Tool>)[] = [];
  for (const p of msg.parts) {
    const last = blocks[blocks.length - 1];
    if (p.kind === "tool") {
      if (last?.kind === "steps") last.steps.push(p);
      else blocks.push({ kind: "steps", steps: [p] });
    } else blocks.push(p);
  }
  return (
    <div className="as-reply">
      {blocks.map((b, i) =>
        b.kind === "steps" ? (
          <Steps key={`s:${b.steps[0].id}`} steps={b.steps} live={live} />
        ) : b.kind === "text" ? (
          <Markdown key={`text:${i}`} text={b.text} />
        ) : (
          <div key={`err:${i}`} className="as-error" role="alert">
            {b.text}
          </div>
        ),
      )}
      {live && msg.parts.length === 0 ? (
        <div className="as-wait" role="status" aria-label={t("agent.thinking")}>
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}

/** First screen of a chat: what the assistant is looking at, and things to ask about it. */
function Start({ focus, onPick }: { focus: Focus | null; onPick(text: string): void }) {
  const ideas: { icon: typeof Library; key: MessageKey }[] =
    focus?.kind === "paper"
      ? [
          { icon: FileText, key: "agent.idea.summarize" },
          { icon: Highlighter, key: "agent.idea.arguments" },
          { icon: Telescope, key: "agent.idea.builds" },
          { icon: Network, key: "agent.idea.relates" },
        ]
      : focus?.kind === "note"
        ? [
            { icon: FileText, key: "agent.idea.tighten" },
            { icon: Telescope, key: "agent.idea.missing" },
            { icon: Scale, key: "agent.idea.counter" },
          ]
        : [
            { icon: Library, key: "agent.idea.overview" },
            { icon: Telescope, key: "agent.idea.next" },
            { icon: Scale, key: "agent.idea.disagree" },
            { icon: NotebookPen, key: "agent.idea.related" },
          ];
  return (
    <div className="as-start">
      <div className="as-focus">
        <span className="as-focus-kicker">{t("agent.lookingAt")}</span>
        <span className="as-focus-title">{focus ? focus.title : t("agent.wholeLibrary")}</span>
        <span className="as-focus-sub">{focus ? focus.sub : t("agent.wholeLibraryHint")}</span>
      </div>
      <ul className="as-ideas" aria-label={t("agent.ideas")}>
        {ideas.map(({ icon: Icon, key }) => (
          <li key={key}>
            <button type="button" onClick={() => onPick(t(key))}>
              <Icon size={15} aria-hidden="true" />
              <span>{t(key)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Composer({ focus }: { focus: Focus | null }) {
  const { send, stop, running, info, setAllowWrites } = useAgent();
  const canEdit = info?.config.cliAllowWrites ?? false;
  const [text, setText] = useState("");
  const [withFocus, setWithFocus] = useState(true);
  const ref = useRef<HTMLTextAreaElement>(null);
  const focusText = focus?.text;
  // opening another paper or note brings the context back
  useEffect(() => {
    if (focusText !== undefined) setWithFocus(true);
  }, [focusText]);
  useEffect(() => {
    const el = ref.current;
    if (!el || text === undefined) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || running) return;
    send(
      text.trim(),
      withFocus && focus ? focus.text : null,
      withFocus && focus ? focus.about : undefined,
    );
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="as-composer">
      <textarea
        ref={ref}
        rows={2}
        value={text}
        aria-label={t("agent.inputLabel")}
        placeholder={t("agent.placeholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="as-composer-bar">
        {focus && withFocus ? (
          <span className="as-ctx" title={focus.text}>
            {focus.kind === "paper" ? (
              <FileText size={12} aria-hidden="true" />
            ) : (
              <NotebookPen size={12} aria-hidden="true" />
            )}
            <span>{focus.label}</span>
            <button
              type="button"
              aria-label={t("agent.dropContext")}
              onClick={() => setWithFocus(false)}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <button
          type="button"
          className={`as-mode${canEdit ? " edit" : ""}`}
          aria-pressed={canEdit}
          title={canEdit ? t("agent.canEditHint") : t("agent.readOnlyHint")}
          onClick={() => setAllowWrites(!canEdit)}
        >
          {canEdit ? (
            <PencilLine size={12} aria-hidden="true" />
          ) : (
            <Lock size={12} aria-hidden="true" />
          )}
          {canEdit ? t("agent.canEdit") : t("agent.readOnly")}
        </button>
        {running ? (
          <button
            type="button"
            className="as-send stop"
            aria-label={t("agent.stop")}
            title={t("agent.stop")}
            onClick={stop}
          >
            <Square size={11} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="as-send"
            aria-label={t("agent.send")}
            title={t("agent.send")}
            disabled={!text.trim()}
            onClick={submit}
          >
            <ArrowUp size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

const AGENT_SITES = [
  { id: "claude", name: "Claude Code", url: "https://claude.com/claude-code" },
  { id: "codex", name: "Codex", url: "https://github.com/openai/codex" },
];

const openAssistantsSettings = () =>
  useDialogs.getState().show("settings", { section: "assistants" });

/** No agent connected yet: how to get one, step by step. */
function Install() {
  const loadInfo = useAgent((s) => s.loadInfo);
  const [copied, setCopied] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  return (
    <div className="as-install">
      <h3>{t("agent.installTitle")}</h3>
      <p>{t("agent.installText")}</p>
      <ol>
        <li>
          <span>{t("agent.installStep1")}</span>
          <span className="as-install-row">
            {AGENT_SITES.map((a) => (
              <button
                key={a.id}
                type="button"
                className="btn"
                onClick={() => backend.openExternal(a.url)}
              >
                {a.name}
              </button>
            ))}
          </span>
        </li>
        <li>
          <span>{t("agent.installStep2")}</span>
          <span className="as-install-row">
            {AGENT_SITES.map((a) => (
              <button
                key={a.id}
                type="button"
                className="btn as-code"
                aria-label={t("agent.installCopy", { command: a.id })}
                onClick={() => navigator.clipboard?.writeText(a.id).then(() => setCopied(a.id))}
              >
                <code>{a.id}</code>
                {copied === a.id ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
              </button>
            ))}
          </span>
        </li>
        <li>
          <span>{t("agent.installStep3")}</span>
          <span className="as-install-row">
            <button type="button" className="btn btn-primary" onClick={openAssistantsSettings}>
              {t("agent.openAssistants")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={checking}
              onClick={() => {
                setChecking(true);
                loadInfo().finally(() => setChecking(false));
              }}
            >
              <RefreshCw size={13} className={checking ? "spin" : ""} aria-hidden="true" />
              {t("agent.installCheck")}
            </button>
          </span>
        </li>
      </ol>
    </div>
  );
}

/** The agent in use, and the other connected ones to switch to. */
function AgentSwitch() {
  const info = useAgent((s) => s.info);
  const setAgent = useAgent((s) => s.setAgent);
  const running = useAgent((s) => s.running);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!info) return null;
  const current = info.agents.find((a) => a.id === info.active);
  return (
    <div className="as-switch" ref={ref}>
      <button
        type="button"
        className="as-switch-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("agent.switch", { name: current?.name ?? t("agent.none") })}
        disabled={running}
        onClick={() => setOpen(!open)}
      >
        <span className={`as-dot${current ? " on" : ""}`} aria-hidden="true" />
        {current && <AgentIcon agent={current.id} />}
        <span className="as-name">{current?.name ?? t("agent.none")}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu as-switch-menu" role="menu">
          {info.agents.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitemradio"
              aria-checked={a.id === info.active}
              onClick={() => {
                setOpen(false);
                setAgent(a.id);
              }}
            >
              <span className="as-switch-check">
                {a.id === info.active ? <Check size={13} aria-hidden="true" /> : null}
              </span>
              <AgentIcon agent={a.id} size={14} />
              <span className="as-switch-name">{a.name}</span>
              <span className="as-switch-state">{t("agent.connected")}</span>
            </button>
          ))}
          <div className="as-switch-hint">{t("agent.switchHint")}</div>
          <button
            type="button"
            role="menuitem"
            className="as-switch-more"
            onClick={() => {
              setOpen(false);
              openAssistantsSettings();
            }}
          >
            <Settings size={13} aria-hidden="true" />
            {t("agent.manageAgents")}
          </button>
        </div>
      )}
    </div>
  );
}

/** "2026-11-23 09:14:02" (UTC) or ISO → "Today 11:14", "Yesterday", "21 Nov". */
function when(at: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : `${at.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const days = Math.floor(
    (new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (days <= 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return t("agent.yesterday");
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Saved chats: the ones about what's open first, then all the others. */
function ChatHistory({ focus }: { focus: Focus | null }) {
  const { history, openChat, deleteChat, chatId, info } = useAgent();
  const items = useLibrary((s) => s.items);
  const about = (c: AgentChatSummary) =>
    !!focus &&
    ((focus.about.itemId !== null && c.itemId === focus.about.itemId) ||
      (focus.about.noteId !== null && c.noteId === focus.about.noteId));
  const here = history.filter(about);
  const rest = history.filter((c) => !about(c));
  const row = (c: AgentChatSummary) => {
    const paper = c.itemId !== null ? items.find((i) => i.id === c.itemId) : undefined;
    const agentName = info?.agents.find((a) => a.id === c.agent)?.name ?? c.agent;
    return (
      <li key={c.id} className={`as-hist-row${c.id === chatId ? " current" : ""}`}>
        <button type="button" className="as-hist-open" onClick={() => openChat(c.id)}>
          <span className="as-hist-title">{c.title}</span>
          <span className="as-hist-meta">
            {[paper ? `@${paper.citekey}` : null, agentName, when(c.updatedAt)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <button
          type="button"
          className="icon-btn as-hist-del"
          aria-label={t("agent.deleteChat", { title: c.title })}
          title={t("agent.deleteChatShort")}
          onClick={() => deleteChat(c.id)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </li>
    );
  };
  return (
    <div className="as-body as-history">
      {history.length === 0 && <div className="as-hist-empty">{t("agent.historyEmpty")}</div>}
      {here.length > 0 && (
        <section>
          <h4>{t("agent.historyHere", { what: focus?.label ?? "" })}</h4>
          <ul aria-label={t("agent.historyHere", { what: focus?.label ?? "" })}>{here.map(row)}</ul>
        </section>
      )}
      {rest.length > 0 && (
        <section>
          <h4>{here.length > 0 ? t("agent.historyOther") : t("agent.historyAll")}</h4>
          <ul aria-label={here.length > 0 ? t("agent.historyOther") : t("agent.historyAll")}>
            {rest.map(row)}
          </ul>
        </section>
      )}
    </div>
  );
}

export function AgentPanel() {
  const {
    info,
    loadInfo,
    messages,
    running,
    newChat,
    setOpen,
    width,
    setWidth,
    send,
    showHistory,
    setShowHistory,
    chatAgent,
  } = useAgent();
  const focus = useFocus();
  // after a restart the last chat comes back from the library (once)
  const reopened = useRef(false);
  useEffect(() => {
    if (reopened.current) return;
    reopened.current = true;
    const st = useAgent.getState();
    if (st.messages.length === 0) st.openChat(st.chatId);
  }, []);
  const box = useRef<HTMLDivElement>(null);
  // look again when Settings closes (an agent may have been connected there) or the window returns
  const dialogOpen = useDialogs((s) => s.open);
  useEffect(() => {
    if (!dialogOpen) loadInfo();
  }, [loadInfo, dialogOpen]);
  useEffect(() => {
    const on = () => loadInfo();
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, [loadInfo]);
  // follow the reply while it's written, unless the user scrolled up to read
  useEffect(() => {
    const el = box.current;
    if (el && messages.length && el.scrollHeight - el.scrollTop - el.clientHeight < 140)
      el.scrollTop = el.scrollHeight;
  }, [messages]);

  const side = useUi((s) => s.assistantSide);
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    // from the width as drawn; it can grow only as far as the other panes have room to give
    const panel = e.currentTarget.parentElement;
    const startW = panel?.getBoundingClientRect().width ?? width;
    const maxW = startW + paneSlack();
    // the grip is on the edge facing the content: dragging toward it widens the panel
    const dir = side === "left" ? -1 : 1;
    const move = (ev: globalThis.PointerEvent) =>
      setWidth(Math.min(maxW, startW + dir * (startX - ev.clientX)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ready = !!info?.active;
  return (
    <aside className="as-panel" style={{ width }} aria-label={t("agent.title")}>
      <div className="as-grip" onPointerDown={startDrag} />
      <header className="as-head">
        <div className="as-who">
          <AgentSwitch />
        </div>
        <button
          type="button"
          className={`icon-btn${showHistory ? " on" : ""}`}
          title={t("agent.history")}
          aria-label={t("agent.history")}
          aria-pressed={showHistory}
          disabled={!ready}
          onClick={() => setShowHistory(!showHistory)}
        >
          <History size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("agent.newChat")}
          aria-label={t("agent.newChat")}
          disabled={messages.length === 0 && !showHistory}
          onClick={newChat}
        >
          <SquarePen size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("common.close")}
          aria-label={t("common.close")}
          onClick={() => setOpen(false)}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      {!info ? null : !ready ? (
        <Install />
      ) : (
        <>
          {showHistory ? (
            <ChatHistory focus={focus} />
          ) : (
            <>
              {chatAgent && info.active && chatAgent !== info.active && messages.length > 0 && (
                <div className="as-switched" role="note">
                  {t("agent.otherAgent", {
                    was: info.agents.find((a) => a.id === chatAgent)?.name ?? chatAgent,
                    now: info.agents.find((a) => a.id === info.active)?.name ?? info.active,
                  })}
                </div>
              )}
              <div className="as-body" ref={box} aria-live="polite">
                {messages.length === 0 ? (
                  <Start
                    focus={focus}
                    onPick={(text) => send(text, focus?.text ?? null, focus?.about)}
                  />
                ) : (
                  messages.map((m, i) =>
                    m.role === "user" ? (
                      <div key={m.id} className="as-ask">
                        {m.text}
                      </div>
                    ) : (
                      <Reply key={m.id} msg={m} live={running && i === messages.length - 1} />
                    ),
                  )
                )}
              </div>
              <Composer focus={focus} />
            </>
          )}
        </>
      )}
    </aside>
  );
}
