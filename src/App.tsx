import type { PlatformInfo } from "@paperlines/backend-port";
import { useShallow } from "zustand/react/shallow";
import { AgentPanel } from "./features/agent/AgentPanel";
import { Tour } from "./features/tour/Tour";
import { useAgent } from "./store/agent";
import { useTour } from "./store/tour";
import { useTrashCount } from "./store/trash";
import "katex/dist/katex.min.css";
import { useEffect, useState } from "react";
import { backend, inTauri } from "./backend";
import { ContextMenu, suppressSystemMenu } from "./components/ContextMenu";
import { SplitPanes } from "./components/SplitPanes";
import { registerAppCommands, registry } from "./contributions/commands";
import { PaperCard } from "./features/card/PaperCard";
import { FetchProgress } from "./features/citations/FetchProgress";
import { type ConnectionArg, ConnectionDialog } from "./features/connections/ConnectionDialog";
import { ConnectionTypesDialog } from "./features/connections/ConnectionTypesDialog";
import { DiscoverView } from "./features/discover/DiscoverView";
import { ExportDialog, SELECTION } from "./features/export/ExportDialog";
import { ImportDialog, type ImportStart } from "./features/import/ImportDialog";
import { BulkPanel } from "./features/library/BulkPanel";
import { DetailPane } from "./features/library/DetailPane";
import { LibraryTable } from "./features/library/LibraryTable";
import { SaveSearchDialog } from "./features/library/SaveSearchDialog";
import { UpdateDetailsDialog } from "./features/library/UpdateDetailsDialog";
import { CommandPalette } from "./features/palette/CommandPalette";
import { ProjectDialog } from "./features/projects/ProjectDialog";
import { ProjectPickerDialog } from "./features/projects/ProjectPickerDialog";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { Sidebar } from "./features/shell/Sidebar";
import { Toast } from "./features/shell/Toast";
import { TopBar } from "./features/shell/TopBar";
import { RightTabs } from "./features/tabs/RightTabs";
import { ManageTagsDialog } from "./features/tags/ManageTagsDialog";
import { TagPickerDialog } from "./features/tags/TagPickerDialog";
import { DuplicatesView } from "./features/views/DuplicatesView";
import { TrashView } from "./features/views/TrashView";
import { t } from "./i18n";
import { isTyping, matchesShortcut, platformFor } from "./platform";
import { useDialogs } from "./store/dialogs";
import { useHighlights } from "./store/highlights";
import { useLibrary } from "./store/library";
import { usePanes } from "./store/panes";
import { usePlatform } from "./store/platform";
import { useSettings } from "./store/settings";
import { useToast } from "./store/toast";
import { useUi } from "./store/ui";

/** The project row under a point (files dragged from Finder), if any. */
function projectAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-project]");
  return el ? Number(el.dataset.dropProject) : null;
}

function markDropTarget(projectId: number | null) {
  for (const el of document.querySelectorAll(".drop-over")) el.classList.remove("drop-over");
  if (projectId !== null)
    document.querySelector(`[data-drop-project="${projectId}"]`)?.classList.add("drop-over");
}

export function App() {
  const { items, load, error } = useLibrary();
  const {
    selectedId,
    selectedIds,
    paneWidths,
    setPaneWidths,
    theme,
    sidebarOpen,
    view,
    layout,
    setLayout,
  } = useUi();
  const { open, arg, show, close } = useDialogs();
  const platform = usePlatform((s) => s.platform);
  const { settings, load: loadSettings, update: updateSettings } = useSettings();
  const tabs = usePanes((s) => s.tabs);
  const [info, setInfo] = useState<PlatformInfo | null>(null);

  useEffect(() => {
    load();
    backend.platformInfo().then((i) => {
      setInfo(i);
      usePlatform.setState({ platform: platformFor(i.os) });
    });
    loadSettings();
    // files the OS asked us to open before the window was ready
    backend.takePendingOpens().then((paths) => paths.length && show("import", { paths }));
    window.addEventListener("contextmenu", suppressSystemMenu);
    const offs = [
      () => window.removeEventListener("contextmenu", suppressSystemMenu),
      registerAppCommands(),
      backend.on("open-settings", () => show("settings")),
      // old papers left the Trash for good while the app was open
      backend.on("trash-purged", () => {
        useLibrary.getState().refresh();
        useTrashCount.getState().refresh();
      }),
      backend.on("pdfs-searching", (n) =>
        useToast.getState().show({ text: t("pdfs.searching", { n }) }),
      ),
      backend.on("pdfs-found", (r) => {
        useLibrary.getState().refresh();
        const text =
          r.found.length && r.notFound.length
            ? t("pdfs.foundSome", { n: r.found.length, m: r.notFound.length })
            : r.found.length
              ? t("pdfs.found", { n: r.found.length })
              : t("pdfs.none", { n: r.notFound.length });
        useToast.getState().show({ text }, 8000);
      }),
      backend.on("files-dropped", ({ paths, x, y }) => {
        markDropTarget(null);
        const target = projectAt(x, y);
        show("import", target ? { paths, projectId: target } : { paths });
      }),
      backend.on("files-dragging", (p) => markDropTarget(p ? projectAt(p.x, p.y) : null)),
      backend.on("files-opened", async () => {
        const paths = await backend.takePendingOpens();
        if (paths.length) show("import", { paths });
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [load, show, loadSettings]);

  // Linux desktops (COSMIC, GNOME, KDE) publish light/dark through the XDG portal, which
  // WebKitGTK's prefers-color-scheme doesn't follow; elsewhere this stays null
  const [desktopTheme, setDesktopTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => {
    backend.systemColorScheme().then(setDesktopTheme);
    return backend.on("system-theme", setDesktopTheme);
  }, []);

  const appearance = useUi(
    useShallow((s) => ({
      accent: s.accent,
      iconWeight: s.iconWeight,
      topbarLabels: s.topbarLabels,
      sidebarSide: s.sidebarSide,
      assistantSide: s.assistantSide,
    })),
  );
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = appearance.accent;
    root.dataset.icons = appearance.iconWeight;
    if (appearance.topbarLabels) root.dataset.labels = "";
    else delete root.dataset.labels;
  }, [appearance.accent, appearance.iconWeight, appearance.topbarLabels]);

  useEffect(() => {
    const root = document.documentElement;
    const effective = theme === "system" ? desktopTheme : theme;
    if (effective) root.dataset.theme = effective;
    else delete root.dataset.theme;
  }, [theme, desktopTheme]);

  // the library is shared with the command line and AI assistants (the MCP server): when the
  // window comes back to the front, show what they changed meanwhile (notes keep unsaved typing)
  useEffect(() => {
    const on = () => {
      useLibrary.getState().refresh();
      usePanes.getState().notesChanged();
      useHighlights.getState().reloadAll();
    };
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, []);

  // opening a PDF, note or the graph while only the list is shown brings up the right pane
  const tabCount = tabs.length;
  useEffect(() => {
    if (tabCount > 0 && useUi.getState().layout === "library") setLayout("split");
  }, [tabCount, setLayout]);

  useEffect(() => {
    if (!platform) return;
    const onKey = (e: KeyboardEvent) => {
      const current = useDialogs.getState().open;
      if (current && current !== "palette") return;
      for (const c of registry.listCommands()) {
        if (!c.shortcut || !matchesShortcut(platform, c.shortcut, e)) continue;
        const plainKey = !c.shortcut.includes("+");
        if (plainKey && (isTyping(e.target) || current)) continue;
        e.preventDefault();
        if (c.id === "palette" && current === "palette") close();
        else c.run();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [platform, close]);

  const agentOpen = useAgent((s) => s.open);
  // the first time the app opens (once the library has loaded), the tour starts by itself
  const loaded = useLibrary((s) => s.loaded);
  useEffect(() => {
    if (!loaded || useTour.getState().done) return;
    const asked =
      typeof location !== "undefined" && new URLSearchParams(location.search).has("tour");
    if (inTauri || asked) useTour.getState().start();
  }, [loaded]);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const middle =
    view === "trash" ? (
      <TrashView />
    ) : view === "discover" ? (
      <DiscoverView />
    ) : view === "duplicates" ? (
      <DuplicatesView />
    ) : (
      <LibraryTable />
    );
  const detail =
    selectedIds.length > 1 ? (
      <BulkPanel />
    ) : selected ? (
      <DetailPane item={selected} />
    ) : (
      <div className="empty muted">{t("detail.none")}</div>
    );

  return (
    <div className="app">
      <TopBar />
      {error && (
        <div className="alert app-alert" role="alert">
          {error}
          <button
            type="button"
            className="icon-btn"
            aria-label={t("common.close")}
            onClick={() => useLibrary.setState({ error: null })}
          >
            ×
          </button>
        </div>
      )}
      <div
        className="main"
        data-sidebar={appearance.sidebarSide}
        data-assistant={appearance.assistantSide}
      >
        {sidebarOpen && appearance.sidebarSide === "left" && <Sidebar />}
        {agentOpen && appearance.assistantSide === "left" && <AgentPanel />}
        {layout === "focus" ? (
          <section className="pane pane-fill">
            <RightTabs />
          </section>
        ) : (
          <SplitPanes widths={paneWidths} onResize={setPaneWidths}>
            {middle}
            {detail}
            {layout === "split" ? <RightTabs /> : null}
          </SplitPanes>
        )}
        {agentOpen && appearance.assistantSide === "right" && <AgentPanel />}
        {sidebarOpen && appearance.sidebarSide === "right" && <Sidebar />}
      </div>
      {open === "import" && (
        <ImportDialog
          start={(arg as ImportStart | null) ?? null}
          offline={settings?.offlineMode ?? false}
          onClose={close}
        />
      )}
      {open === "settings" && settings && info && (
        <SettingsDialog settings={settings} info={info} onChange={updateSettings} onClose={close} />
      )}
      <FetchProgress />
      <Toast />
      <PaperCard />
      <ContextMenu />
      <Tour />
      {open === "palette" && <CommandPalette onClose={close} />}
      {open === "tagPicker" && <TagPickerDialog onClose={close} />}
      {open === "projectPicker" && <ProjectPickerDialog onClose={close} />}
      {open === "manageTags" && <ManageTagsDialog onClose={close} />}
      {open === "project" && (
        <ProjectDialog projectId={(arg as number | null) ?? null} onClose={close} />
      )}
      {open === "saveSearch" && <SaveSearchDialog onClose={close} />}
      {open === "connection" && arg !== null && (
        <ConnectionDialog arg={arg as ConnectionArg} onClose={close} />
      )}
      {open === "connectionTypes" && (
        <ConnectionTypesDialog back={arg as ConnectionArg | null} onClose={close} />
      )}
      {open === "updateDetails" && typeof arg === "number" && (
        <UpdateDetailsDialog itemId={arg} onClose={close} />
      )}
      {open === "export" && (
        <ExportDialog
          project={typeof arg === "string" ? arg : null}
          selection={arg === SELECTION}
          onClose={close}
        />
      )}
    </div>
  );
}
