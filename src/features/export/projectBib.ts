// One BibTeX file per project: "Save as…" once, keep it updated, or write every project at once.
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { useToast } from "../../store/toast";

/** A file name for a project (no path separators or characters Finder and Windows reject). */
export const bibFileName = (project: string) =>
  `${project.replace(/[\\/:*?"<>|]/g, "-").trim() || "project"}.bib`;

/** Asks where to save the project's .bib; with `keep`, the file is rewritten when the library changes. */
export async function saveProjectBib(project: string, keep = false): Promise<string | null> {
  const dest = await backend.pickSavePath(bibFileName(project), "bib");
  if (!dest) return null;
  try {
    if (keep) {
      await backend.addAutoExport("bibtex", "project", project, dest);
      useToast.getState().show({ text: t("projects.bibKept", { path: dest }) });
    } else {
      await backend.exportItems("bibtex", { kind: "project", value: project }, dest);
      useToast.getState().show({ text: t("export.done", { path: dest }) });
    }
    return dest;
  } catch (e) {
    useToast.getState().show({ text: String(e) });
    return null;
  }
}

/** Writes <folder>/<project>.bib for every project. */
export async function saveAllProjectBibs(keep = false): Promise<void> {
  const projects = useLibrary.getState().projects;
  if (!projects.length) {
    useToast.getState().show({ text: t("projects.noneYet") });
    return;
  }
  const dir = (await backend.pickPaths("folder"))?.[0];
  if (!dir) return;
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  try {
    for (const p of projects) {
      const dest = `${dir.replace(/[\\/]+$/, "")}${sep}${bibFileName(p.name)}`;
      if (keep) await backend.addAutoExport("bibtex", "project", p.name, dest);
      else await backend.exportItems("bibtex", { kind: "project", value: p.name }, dest);
    }
    useToast
      .getState()
      .show({ text: t("projects.allBibsDone", { n: projects.length, path: dir }) });
  } catch (e) {
    useToast.getState().show({ text: String(e) });
  }
}
