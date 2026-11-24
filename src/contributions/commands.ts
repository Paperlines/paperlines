import type { ReadStatus } from "@paperlines/backend-port";
import { Registry } from "@paperlines/registry";
import { backend } from "../backend";
import { saveAllProjectBibs } from "../features/export/projectBib";
import { t } from "../i18n";
import { useAgent } from "../store/agent";
import { useDialogs } from "../store/dialogs";
import { useLibrary } from "../store/library";
import { usePanes } from "../store/panes";
import { useToast } from "../store/toast";
import { useTour } from "../store/tour";
import { type Theme, useUi } from "../store/ui";

export const registry = new Registry();

const sel = () => useUi.getState().selectedIds;
const hasSel = () => sel().length > 0;
const show = (n: Parameters<ReturnType<typeof useDialogs.getState>["show"]>[0]) =>
  useDialogs.getState().show(n);

export function focusSearch() {
  const el = document.getElementById("library-search") as HTMLInputElement | null;
  el?.focus();
  el?.select();
}

/** Moves papers to the Trash with an Undo toast (no confirmation needed: it is reversible). */
export async function trashWithUndo(ids: number[]) {
  if (!ids.length) return;
  await useLibrary.getState().mutate(() => backend.trashItems(ids));
  useUi.getState().select(null);
  useToast.getState().show({
    text: t("trash.moved", { n: ids.length }),
    action: {
      label: t("trash.undo"),
      run: () => useLibrary.getState().mutate(() => backend.restoreItems(ids)),
    },
  });
}

async function deleteSelected() {
  await trashWithUndo(sel());
}

async function copy(mode: "citation" | "bibliography") {
  const ids = sel();
  if (!ids.length) return;
  try {
    const f = await backend.copyCitation(ids, null, mode);
    useToast.getState().show(
      {
        text: t("cite.copied", { text: f.text.length > 80 ? `${f.text.slice(0, 80)}…` : f.text }),
      },
      4000,
    );
  } catch (e) {
    useToast.getState().show({ text: String(e) });
  }
}

function setStatus(s: ReadStatus) {
  const ids = sel();
  useLibrary.getState().mutate(() => backend.setReadStatus(ids, s));
}

/** Registers the app's commands. Returns a function that unregisters them. */
export function registerAppCommands(): () => void {
  const offs = [
    registry.registerCommand({
      id: "palette",
      title: t("cmd.palette"),
      shortcut: "mod+k",
      group: "general",
      run: () => show("palette"),
    }),
    registry.registerCommand({
      id: "library.add",
      title: t("cmd.add"),
      shortcut: "mod+o",
      group: "general",
      keywords: ["import", "pdf", "doi", "bibtex"],
      run: () => show("import"),
    }),
    registry.registerCommand({
      id: "settings",
      title: t("settings.title"),
      shortcut: "mod+,",
      group: "general",
      keywords: ["preferences"],
      run: () => show("settings"),
    }),
    registry.registerCommand({
      id: "search.focus",
      title: t("cmd.focusSearch"),
      shortcut: "mod+f",
      group: "navigate",
      run: focusSearch,
    }),
    registry.registerCommand({
      id: "search.clear",
      title: t("cmd.showAll"),
      group: "navigate",
      run: () => useUi.getState().setQuery(""),
    }),
    registry.registerCommand({
      id: "search.save",
      title: t("cmd.saveSearch"),
      group: "navigate",
      when: () => useUi.getState().query.trim() !== "",
      run: () => show("saveSearch"),
    }),
    registry.registerCommand({
      id: "sidebar.toggle",
      title: t("cmd.toggleSidebar"),
      shortcut: "mod+\\",
      group: "view",
      run: () => useUi.getState().toggleSidebar(),
    }),
    registry.registerCommand({
      id: "tour",
      title: t("cmd.tour"),
      group: "general",
      run: () => useTour.getState().start(),
    }),
    registry.registerCommand({
      id: "assistant.toggle",
      title: t("cmd.assistant"),
      shortcut: "mod+j",
      group: "view",
      run: () => useAgent.getState().toggle(),
    }),
    registry.registerCommand({
      id: "items.tag",
      title: t("cmd.tag"),
      shortcut: "t",
      group: "items",
      when: hasSel,
      run: () => show("tagPicker"),
    }),
    registry.registerCommand({
      id: "items.project",
      title: t("cmd.project"),
      shortcut: "p",
      group: "items",
      when: hasSel,
      run: () => show("projectPicker"),
    }),
    ...(["unread", "reading", "read"] as const).map((s, n) =>
      registry.registerCommand({
        id: `items.status.${s}`,
        title: t("cmd.markAs", { status: t(`status.${s}`) }),
        shortcut: `${n + 1}`,
        group: "items",
        when: hasSel,
        run: () => setStatus(s),
      }),
    ),
    registry.registerCommand({
      id: "items.delete",
      title: t("cmd.trash"),
      shortcut: "mod+backspace",
      group: "items",
      when: hasSel,
      run: deleteSelected,
    }),
    registry.registerCommand({
      id: "reader.open",
      title: t("reader.open"),
      group: "items",
      when: () => {
        const id = useUi.getState().selectedId;
        return id !== null && !!useLibrary.getState().items.find((i) => i.id === id)?.hasPdf;
      },
      run: () => {
        const id = useUi.getState().selectedId;
        if (id !== null) usePanes.getState().openPdf(id);
      },
    }),
    registry.registerCommand({
      id: "notes.new",
      title: t("cmd.newNote"),
      shortcut: "mod+shift+n",
      group: "notes",
      run: async () => {
        const ui = useUi.getState();
        const itemId = ui.selectedIds.length === 1 ? ui.selectedId : null;
        const n = await backend.createNote({ kind: "free", itemId, title: t("notes.untitled") });
        usePanes.getState().notesChanged();
        usePanes.getState().openNote(n.id);
      },
    }),
    registry.registerCommand({
      id: "notes.paper",
      title: t("cmd.paperNote"),
      group: "notes",
      when: () => useUi.getState().selectedId !== null,
      run: () => usePanes.getState().setDetailTab("note"),
    }),
    registry.registerCommand({
      id: "pane.close",
      title: t("cmd.closePane"),
      group: "view",
      when: () => usePanes.getState().right !== null,
      run: () => usePanes.getState().closeRight(),
    }),
    registry.registerCommand({
      id: "export",
      title: t("cmd.export"),
      group: "general",
      keywords: ["bibtex", "csl", "ris", "markdown", "json", "backup", "notes"],
      run: () => show("export"),
    }),
    registry.registerCommand({
      id: "doctor",
      title: t("cmd.doctor"),
      group: "general",
      keywords: ["check", "integrity", "backup", "restore"],
      run: () => show("settings"),
    }),
    registry.registerCommand({
      id: "cite.copy",
      title: t("cmd.copyCitation"),
      shortcut: "mod+shift+c",
      group: "cite",
      keywords: ["cite", "apa", "reference"],
      when: hasSel,
      run: () => copy("citation"),
    }),
    registry.registerCommand({
      id: "cite.copyBib",
      title: t("cmd.copyBibliography"),
      shortcut: "mod+shift+b",
      group: "cite",
      keywords: ["bibliography", "references", "apa"],
      when: hasSel,
      run: () => copy("bibliography"),
    }),
    registry.registerCommand({
      id: "pdf.find",
      title: t("cmd.findPdf"),
      group: "items",
      keywords: ["open access", "download", "unpaywall"],
      when: hasSel,
      run: async () => {
        const r = await backend.findPdfs(sel());
        await useLibrary.getState().refresh();
        useToast
          .getState()
          .show({ text: t("pdf.result", { found: r.found.length, missing: r.notFound.length }) });
      },
    }),
    registry.registerCommand({
      id: "view.trash",
      title: t("cmd.showTrash"),
      group: "navigate",
      run: () => useUi.getState().setView("trash"),
    }),
    registry.registerCommand({
      id: "view.duplicates",
      title: t("cmd.showDuplicates"),
      group: "navigate",
      keywords: ["merge"],
      run: () => useUi.getState().setView("duplicates"),
    }),
    registry.registerCommand({
      id: "view.library",
      title: t("cmd.showLibrary"),
      group: "navigate",
      run: () => useUi.getState().setView("library"),
    }),
    registry.registerCommand({
      id: "import.zotero",
      title: t("cmd.importZotero"),
      group: "general",
      run: () => useDialogs.getState().show("import", { start: "zotero" }),
    }),
    registry.registerCommand({
      id: "epub.open",
      title: t("cmd.openEpub"),
      group: "items",
      when: () => {
        const id = useUi.getState().selectedId;
        return id !== null && !!useLibrary.getState().items.find((i) => i.id === id)?.hasEpub;
      },
      run: () => {
        const id = useUi.getState().selectedId;
        if (id !== null) backend.openAttachment(id, "epub");
      },
    }),
    registry.registerCommand({
      id: "graph.open",
      title: t("cmd.graph"),
      group: "citations",
      keywords: ["citation", "network", "map"],
      run: () => usePanes.getState().openGraph(),
    }),
    registry.registerCommand({
      id: "graph.focus",
      title: t("cmd.graphFocus"),
      group: "citations",
      when: () => useUi.getState().selectedId !== null,
      run: () => {
        usePanes.getState().setGraph({ focus: true });
        usePanes.getState().openGraph();
      },
    }),
    registry.registerCommand({
      id: "refs.fetchSelected",
      title: t("cmd.fetchSelected"),
      group: "citations",
      keywords: ["references", "citations", "openalex"],
      when: hasSel,
      run: () => backend.fetchReferences(sel(), true),
    }),
    registry.registerCommand({
      id: "refs.fetchMissing",
      title: t("cmd.fetchMissing"),
      group: "citations",
      keywords: ["references", "citations", "openalex"],
      run: () =>
        backend.fetchReferences(
          useLibrary.getState().items.map((i) => i.id),
          false,
        ),
    }),
    registry.registerCommand({
      id: "detail.citations",
      title: t("cmd.showCitations"),
      group: "citations",
      when: () => useUi.getState().selectedId !== null,
      run: () => usePanes.getState().setDetailTab("citations"),
    }),
    registry.registerCommand({
      id: "project.new",
      title: t("projects.new"),
      group: "organize",
      run: () => show("project"),
    }),
    registry.registerCommand({
      id: "tags.manage",
      title: t("tags.manage"),
      group: "organize",
      keywords: ["rename", "merge", "color"],
      run: () => show("manageTags"),
    }),
    registry.registerCommand({
      id: "discover.open",
      title: t("cmd.searchOnline"),
      group: "navigate",
      keywords: [
        "openalex",
        "semantic scholar",
        "arxiv",
        "pubmed",
        "crossref",
        "find papers",
        "discover",
      ],
      run: () => useUi.getState().setView("discover"),
    }),
    registry.registerCommand({
      id: "connections.add",
      title: t("cmd.connect"),
      group: "items",
      keywords: ["relation", "extends", "contradicts", "replicates", "link"],
      when: () => sel().length === 1,
      run: () => useDialogs.getState().show("connection", { from: sel()[0] }),
    }),
    registry.registerCommand({
      id: "connections.types",
      title: t("cmd.connectionTypes"),
      group: "organize",
      keywords: ["relation", "types"],
      run: () => show("connectionTypes"),
    }),
    registry.registerCommand({
      id: "citing.open",
      title: t("citing.open"),
      group: "items",
      keywords: ["cited by", "citations", "who cites", "forward", "connected papers"],
      when: () => {
        const ids = sel();
        const it =
          ids.length === 1 ? useLibrary.getState().items.find((i) => i.id === ids[0]) : null;
        return !!(it && (it.doi || it.arxivId));
      },
      run: () => usePanes.getState().openCiting(sel()[0]),
    }),
    registry.registerCommand({
      id: "projects.saveAllBibs",
      title: t("cmd.saveAllBibs"),
      group: "organize",
      keywords: ["bibtex", "bib", "export", "projects"],
      run: () => saveAllProjectBibs(false),
    }),
    registry.registerCommand({
      id: "projects.keepAllBibs",
      title: t("cmd.keepAllBibs"),
      group: "organize",
      keywords: ["bibtex", "bib", "auto", "export", "projects"],
      run: () => saveAllProjectBibs(true),
    }),
    ...(["system", "light", "dark"] as Theme[]).map((th) =>
      registry.registerCommand({
        id: `theme.${th}`,
        title: t("cmd.theme", { theme: t(`settings.theme.${th}`) }),
        group: "view",
        run: () => useUi.getState().setTheme(th),
      }),
    ),
  ];
  return () => {
    for (const off of offs) off();
  };
}
