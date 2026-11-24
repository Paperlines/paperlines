// The right-click menu on papers (library table rows).

import type { SpineStep } from "@paperlines/backend-port";
import {
  BookOpen,
  CircleDot,
  Copy,
  FileDown,
  FileSearch,
  FileText,
  FolderOpen,
  FolderPlus,
  Link2,
  Milestone,
  Network,
  NotebookPen,
  Paperclip,
  Quote,
  RefreshCw,
  ScanText,
  Tag,
  Trash2,
} from "lucide-react";
import { backend } from "../../backend";
import { registry } from "../../contributions/commands";
import { t } from "../../i18n";
import type { MenuEntry } from "../../store/contextMenu";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { usePlatform } from "../../store/platform";
import { useUi } from "../../store/ui";
import { SELECTION } from "../export/ExportDialog";
import { authorYear } from "../graph/model";
import { useSpineVersion } from "../spine/store";

const run = (id: string) =>
  registry
    .listCommands()
    .find((c) => c.id === id)
    ?.run();
const shortcut = (id: string) =>
  registry.listCommands().find((c) => c.id === id)?.shortcut ?? undefined;
const I = 14;

/** The project being browsed (its `project:` query is on), if any. */
function browsedProject(): number | null {
  const q = useUi.getState().query.trim();
  const p = useLibrary
    .getState()
    .projects.find((x) => q === `project:"${x.name}"` || q === `project:${x.name}`);
  return p?.id ?? null;
}

/**
 * "Add to spine": the steps of the obvious project right away (the one being browsed, the
 * paper's only project, or the only project there is), other projects one level down.
 */
function spineMenu(itemId: number, spines: Map<number, SpineStep[]>): MenuEntry[] {
  const { items, projects, mutate } = useLibrary.getState();
  const byId = new Map(items.map((i) => [i.id, i]));
  const act = (op: () => Promise<unknown>) => async () => {
    await mutate(op);
    useSpineVersion.getState().bump();
  };
  const stepsOf = (pid: number): MenuEntry[] => {
    const steps = spines.get(pid) ?? [];
    const on = steps.some((s) => s.items.includes(itemId));
    return [
      ...steps.map((s, n) => {
        const names = s.items
          .map((id) => byId.get(id))
          .filter((i) => i !== undefined)
          .map((i) => authorYear(i))
          .join(" + ");
        const name = s.label ?? t("spine.stepN", { n: n + 1 });
        return {
          label: names ? `${name} · ${names}` : name,
          checked: s.items.includes(itemId),
          run: act(() => backend.spineAdd(pid, itemId, s.id)),
        };
      }),
      ...(steps.length ? ["separator" as const] : []),
      { label: t("spine.newStep"), run: act(() => backend.spineAdd(pid, itemId, null)) },
      ...(on
        ? [{ label: t("spine.remove"), run: act(() => backend.spineRemove(pid, itemId)) }]
        : []),
    ];
  };
  const asSub = (pid: number, name: string): MenuEntry => ({
    label: name,
    checked: (spines.get(pid) ?? []).some((s) => s.items.includes(itemId)),
    items: stepsOf(pid),
  });
  const mine = byId.get(itemId)?.projectIds ?? [];
  const main =
    browsedProject() ??
    (projects.length === 1 ? projects[0].id : mine.length === 1 ? mine[0] : null);
  if (main === null) return projects.map((p) => asSub(p.id, p.name));
  const others = projects.filter((p) => p.id !== main);
  const mainName = projects.find((p) => p.id === main)?.name ?? "";
  return [
    { label: mainName, disabled: true },
    ...stepsOf(main),
    ...(others.length
      ? [
          "separator" as const,
          {
            label: t("spine.otherProjects"),
            items: others.map((p) => asSub(p.id, p.name)),
          },
        ]
      : []),
  ];
}

/** `spines`: every project's spine (see `loadSpines`), for the "Add to spine" submenu. */
export function itemMenu(spines?: Map<number, SpineStep[]>): MenuEntry[] {
  const { items, projects } = useLibrary.getState();
  const ids = useUi.getState().selectedIds;
  const chosen = items.filter((i) => ids.includes(i.id));
  if (!chosen.length) return [];
  const one = chosen.length === 1 ? chosen[0] : null;
  const status = new Set(chosen.map((i) => i.readStatus));
  const needPdf = chosen.some((i) => !i.hasPdf && (i.doi || i.arxivId));
  return [
    ...(one?.hasPdf
      ? [{ label: t("menu.openPdf"), icon: <FileText size={I} />, run: () => run("reader.open") }]
      : []),
    ...(one?.hasEpub
      ? [{ label: t("reader.openEpub"), icon: <BookOpen size={I} />, run: () => run("epub.open") }]
      : []),
    ...(one?.hasPdf
      ? [
          {
            label: t("menu.updateDetails"),
            icon: <ScanText size={I} />,
            run: () => useDialogs.getState().show("updateDetails", one.id),
          },
        ]
      : []),
    ...(one && !one.hasPdf
      ? [
          {
            label: t("menu.attachPdf"),
            icon: <Paperclip size={I} />,
            run: async () => {
              const paths = await backend.pickPaths("files");
              if (paths?.[0])
                await useLibrary.getState().mutate(() => backend.attachPdf(one.id, paths[0]));
            },
          },
        ]
      : []),
    ...(one && (one.hasPdf || one.hasEpub)
      ? [
          {
            label:
              usePlatform.getState().platform?.os === "macos"
                ? t("menu.reveal")
                : t("menu.revealOther"),
            icon: <FolderOpen size={I} />,
            run: () => backend.revealAttachment(one.id, one.hasPdf ? "pdf" : "epub"),
          },
        ]
      : []),
    ...(one
      ? [
          {
            label: t("menu.paperNote"),
            icon: <NotebookPen size={I} />,
            run: () => run("notes.paper"),
          },
        ]
      : []),
    "separator" as const,
    {
      label: t("cmd.copyCitation"),
      icon: <Quote size={I} />,
      shortcut: shortcut("cite.copy"),
      run: () => run("cite.copy"),
    },
    {
      label: t("cmd.copyBibliography"),
      icon: <Copy size={I} />,
      shortcut: shortcut("cite.copyBib"),
      run: () => run("cite.copyBib"),
    },
    "separator" as const,
    {
      label: t("menu.markAs"),
      icon: <CircleDot size={I} />,
      items: (["unread", "reading", "read"] as const).map((s, n) => ({
        label: t(`status.${s}`),
        shortcut: `${n + 1}`,
        checked: status.size === 1 && status.has(s),
        run: () => run(`items.status.${s}`),
      })),
    },
    { label: t("menu.addTag"), icon: <Tag size={I} />, shortcut: "t", run: () => run("items.tag") },
    {
      label: t("menu.addToProject"),
      icon: <FolderPlus size={I} />,
      shortcut: "p",
      run: () => run("items.project"),
    },
    ...(one && spines && projects.length
      ? [
          {
            label: t("spine.addTo"),
            icon: <Milestone size={I} />,
            items: spineMenu(one.id, spines),
          },
        ]
      : []),
    "separator" as const,
    ...(needPdf
      ? [{ label: t("cmd.findPdf"), icon: <FileSearch size={I} />, run: () => run("pdf.find") }]
      : []),
    {
      label: t("menu.fetchRefs"),
      icon: <RefreshCw size={I} />,
      run: () => run("refs.fetchSelected"),
    },
    ...(one
      ? [
          {
            label: t("menu.showInGraph"),
            icon: <Network size={I} />,
            run: () => run("graph.focus"),
          },
        ]
      : []),
    ...(one
      ? [
          {
            label: t("conn.connectTo"),
            icon: <Link2 size={I} />,
            run: () => useDialogs.getState().show("connection", { from: one.id }),
          },
        ]
      : []),
    ...(one && (one.doi || one.arxivId)
      ? [
          {
            label: t("citing.open"),
            icon: <Quote size={I} />,
            run: () => usePanes.getState().openCiting(one.id),
          },
        ]
      : []),
    {
      label: t("menu.export", { n: chosen.length }),
      icon: <FileDown size={I} />,
      run: () => useDialogs.getState().show("export", SELECTION),
    },
    "separator" as const,
    {
      label: t("menu.trash", { n: chosen.length }),
      icon: <Trash2 size={I} />,
      // in the list, plain Delete / ⌫ does it
      shortcut: "backspace",
      danger: true,
      run: () => run("items.delete"),
    },
  ];
}
