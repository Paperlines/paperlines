import {
  BookOpenText,
  ClipboardPaste,
  Cog,
  Columns2,
  Contrast,
  FilePlus2,
  FolderInput,
  FolderPlus,
  Import,
  LayoutList,
  MoonStar,
  PackageOpen,
  Plus,
  Quote,
  SquareSlash,
  SunMedium,
  Telescope,
  Waypoints,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SparkIcon } from "../../components/SparkIcon";
import { registry } from "../../contributions/commands";
import { t } from "../../i18n";
import { formatShortcut } from "../../platform";
import { useAgent } from "../../store/agent";
import { useDialogs } from "../../store/dialogs";
import { usePanes } from "../../store/panes";
import { usePlatform } from "../../store/platform";
import { type Layout, useUi } from "../../store/ui";

const LAYOUT_LABEL = { library: "tb.list", split: "tb.split", focus: "tb.reader" } as const;

const LAYOUTS: { id: Layout; icon: typeof LayoutList }[] = [
  { id: "library", icon: LayoutList },
  { id: "split", icon: Columns2 },
  { id: "focus", icon: BookOpenText },
];

/** Quick add: paste a DOI, arXiv or PubMed ID, or a title, and press Enter; the end button
 *  opens the other ways in (files, folders, BibTeX, Zotero, a library export, online search). */
function QuickAdd() {
  const show = useDialogs((s) => s.show);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const items: { id: string; label: string; icon: typeof Plus }[] = [
    { id: "files", label: t("add.files"), icon: FilePlus2 },
    { id: "folder", label: t("add.folder"), icon: FolderPlus },
    { id: "paste", label: t("add.paste"), icon: ClipboardPaste },
    { id: "search", label: t("add.search"), icon: Telescope },
    { id: "zotero", label: t("add.zotero"), icon: Import },
    { id: "dump", label: t("add.dump"), icon: PackageOpen },
  ];
  const submit = () => {
    const v = text.trim();
    show("import", v ? { text: v } : undefined);
    setText("");
  };
  return (
    <div className="quick-add" ref={ref}>
      <Plus size={15} className="quick-add-plus" aria-hidden="true" />
      <input
        type="text"
        value={text}
        spellCheck={false}
        aria-label={t("add.quick")}
        placeholder={t("add.quickPlaceholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        className="quick-add-more"
        aria-label={t("add.more")}
        title={t("add.more")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FolderInput size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (id === "search") useUi.getState().setView("discover");
                else show("import", { start: id });
              }}
            >
              <Icon size={14} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const platform = usePlatform((s) => s.platform);
  const { layout, setLayout, theme, setTheme, selectedIds } = useUi();
  const show = useDialogs((s) => s.show);
  const agentOpen = useAgent((s) => s.open);
  const toggleAgent = useAgent((s) => s.toggle);
  const hint = (id: string) => {
    const c = registry.listCommands().find((x) => x.id === id);
    return c?.shortcut && platform ? ` (${formatShortcut(platform, c.shortcut)})` : "";
  };
  const ThemeIcon = theme === "dark" ? MoonStar : theme === "light" ? SunMedium : Contrast;
  return (
    <header className={`topbar${platform?.os === "macos" ? " mac" : ""}`} data-tauri-drag-region>
      <div className="segmented icons" role="group" aria-label={t("layout.label")}>
        {LAYOUTS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={layout === id}
            className={layout === id ? "on" : ""}
            title={t(`layout.${id}`)}
            aria-label={t(`layout.${id}`)}
            onClick={() => setLayout(id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span className="tb-label">{t(LAYOUT_LABEL[id])}</span>
          </button>
        ))}
      </div>
      <div className="top-actions">
        <QuickAdd />
        <button
          type="button"
          className="icon-btn"
          title={t("cmd.copyCitation") + hint("cite.copy")}
          aria-label={t("cmd.copyCitation")}
          disabled={selectedIds.length === 0}
          onClick={() =>
            registry
              .listCommands()
              .find((c) => c.id === "cite.copy")
              ?.run()
          }
        >
          <Quote size={16} aria-hidden="true" />
          <span className="tb-label">{t("tb.cite")}</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("cmd.graph")}
          aria-label={t("cmd.graph")}
          onClick={() => usePanes.getState().openGraph()}
        >
          <Waypoints size={16} aria-hidden="true" />
          <span className="tb-label">{t("tb.graph")}</span>
        </button>
        <button
          type="button"
          className={`icon-btn agent-toggle${agentOpen ? " on" : ""}`}
          title={t("agent.title") + hint("assistant.toggle")}
          aria-label={t("agent.title")}
          aria-pressed={agentOpen}
          onClick={toggleAgent}
        >
          <SparkIcon size={16} aria-hidden="true" />
          <span className="tb-label">{t("tb.assistant")}</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("cmd.palette") + hint("palette")}
          aria-label={t("cmd.palette")}
          onClick={() => show("palette")}
        >
          <SquareSlash size={16} aria-hidden="true" />
          <span className="tb-label">{t("tb.commands")}</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("settings.theme")}
          aria-label={t("settings.theme")}
          onClick={() =>
            setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system")
          }
        >
          <ThemeIcon size={16} aria-hidden="true" />
          <span className="tb-label">{t("tb.theme")}</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("settings.title") + hint("settings")}
          aria-label={t("settings.title")}
          onClick={() => show("settings")}
        >
          <Cog size={16} aria-hidden="true" />
          <span className="tb-label">{t("tb.settings")}</span>
        </button>
      </div>
    </header>
  );
}
