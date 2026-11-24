// Dragging papers from the list onto a project or tag in the sidebar. Pointer events rather than
// HTML drag and drop: the app's own file-drop handling owns native drags on some platforms.
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useCard } from "../../store/card";
import { useLibrary } from "../../store/library";
import { useToast } from "../../store/toast";

const THRESHOLD = 6;

function targetAt(x: number, y: number): HTMLElement | null {
  return (
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-project], [data-drop-tag]") ??
    null
  );
}

/** Starts watching a press on a row; it becomes a drag once the pointer moves a few pixels. */
export function startPaperDrag(
  down: { clientX: number; clientY: number },
  ids: number[],
  label: string,
  /** Released without dragging (e.g. a click inside a multi-selection selects just that row). */
  onClick?: () => void,
) {
  if (!ids.length) return;
  let ghost: HTMLDivElement | null = null;
  let over: HTMLElement | null = null;

  const mark = (el: HTMLElement | null) => {
    if (el === over) return;
    over?.classList.remove("drop-over");
    el?.classList.add("drop-over");
    over = el;
  };
  const move = (e: MouseEvent) => {
    if (!ghost) {
      if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < THRESHOLD) return;
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = label;
      ghost.setAttribute("aria-hidden", "true");
      document.body.append(ghost);
      document.body.classList.add("dragging-papers");
      useCard.getState().close();
    }
    ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
    mark(targetAt(e.clientX, e.clientY));
  };
  const finish = async (e: MouseEvent) => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", finish);
    window.removeEventListener("keydown", cancel, true);
    const dragged = !!ghost;
    ghost?.remove();
    document.body.classList.remove("dragging-papers");
    mark(null);
    if (!dragged) {
      if (e.type === "mouseup") onClick?.();
      return;
    }
    if (e.type !== "mouseup") return;
    const target = targetAt(e.clientX, e.clientY);
    if (!target) return;
    const lib = useLibrary.getState();
    if (target.dataset.dropProject) {
      const pid = Number(target.dataset.dropProject);
      const name = lib.projects.find((p) => p.id === pid)?.name ?? "";
      if (await lib.mutate(() => backend.addToProject(pid, ids)))
        useToast.getState().show({ text: t("drag.toProject", { n: ids.length, name }) });
    } else if (target.dataset.dropTag) {
      const tag = target.dataset.dropTag;
      if (await lib.mutate(() => backend.tagItems(ids, [tag])))
        useToast.getState().show({ text: t("drag.toTag", { n: ids.length, name: tag }) });
    }
  };
  // Escape cancels the drag
  const cancel = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !ghost) return;
    e.stopPropagation();
    finish(new MouseEvent("cancel"));
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", finish);
  window.addEventListener("keydown", cancel, true);
}
