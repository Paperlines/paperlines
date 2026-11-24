import type { SpineStep } from "@paperlines/backend-port";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { backend } from "../../backend";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { authorYear } from "../graph/model";
import { useSpineVersion } from "./store";

/**
 * A project's key papers ("spine"), step by step: each step holds one or more papers (e.g. two
 * papers that made the same move at the same time). The graph draws them gold, joined by a path.
 */
export function SpineEditor({ projectId }: { projectId: number }) {
  const items = useLibrary((s) => s.items);
  const version = useSpineVersion((s) => s.version);
  const [steps, setSteps] = useState<SpineStep[]>([]);
  const load = useCallback(() => backend.spineGet(projectId).then(setSteps), [projectId]);
  useEffect(() => {
    load();
  }, [load, version]);

  // dragging a paper within its step: the order shown while the pointer is down
  const [drag, setDrag] = useState<{
    stepId: number;
    id: number;
    order: number[];
    moved: boolean;
  } | null>(null);
  const reorder = (stepId: number, order: number[]) =>
    run(() => backend.spineReorder(stepId, order));
  const moveBy = (s: SpineStep, id: number, delta: number) => {
    const at = s.items.indexOf(id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= s.items.length) return;
    const order = s.items.filter((x) => x !== id);
    order.splice(to, 0, id);
    reorder(s.id, order);
  };

  const run = async (op: () => Promise<unknown>) => {
    await useLibrary.getState().mutate(op);
    await load();
    useSpineVersion.getState().bump();
  };

  const byId = new Map(items.map((i) => [i.id, i]));
  // a paper on another step can be moved here; papers already in this step aren't offered
  const stepOf = new Map(steps.flatMap((s, n) => s.items.map((id) => [id, n + 1] as const)));
  const projectPapers = items
    .filter((i) => i.projectIds.includes(projectId))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));

  return (
    <div className="field spine-editor">
      <span className="field-label">
        {t("spine.title")}
        <InfoTip label={t("help.about", { what: t("spine.title") })}>{t("help.spine")}</InfoTip>
      </span>
      {steps.length === 0 && <span className="field-hint">{t("spine.empty")}</span>}
      <ol className="spine-steps" aria-label={t("spine.title")}>
        {steps.map((s, n) => (
          <li key={s.id} className="spine-step">
            <div className="row">
              <span className="spine-num" aria-hidden="true">
                {n + 1}
              </span>
              <input
                className="input spine-label"
                aria-label={t("spine.stepLabel", { n: n + 1 })}
                placeholder={t("spine.stepPlaceholder", { n: n + 1 })}
                defaultValue={s.label ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (s.label ?? "")) run(() => backend.spineRenameStep(s.id, v || null));
                }}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={t("spine.up", { n: n + 1 })}
                disabled={n === 0}
                onClick={() => run(() => backend.spineMoveStep(s.id, -1))}
              >
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("spine.down", { n: n + 1 })}
                disabled={n === steps.length - 1}
                onClick={() => run(() => backend.spineMoveStep(s.id, 1))}
              >
                <ArrowDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("spine.deleteStep", { n: n + 1 })}
                onClick={() => run(() => backend.spineDeleteStep(s.id))}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="spine-papers">
              {(drag?.stepId === s.id ? drag.order : s.items).map((id) => {
                const it = byId.get(id);
                if (!it) return null;
                return (
                  <span
                    key={id}
                    className={`spine-chip${drag?.id === id && drag.moved ? " dragging" : ""}`}
                    title={s.items.length > 1 ? t("spine.dragHint", { title: it.title }) : it.title}
                    data-spine-step={s.id}
                    data-spine-item={id}
                    tabIndex={s.items.length > 1 ? 0 : undefined}
                    aria-label={authorYear(it)}
                    onKeyDown={(e) => {
                      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
                      e.preventDefault();
                      moveBy(s, id, e.key === "ArrowLeft" ? -1 : 1);
                    }}
                    onPointerDown={(e) => {
                      if (s.items.length < 2 || e.button !== 0) return;
                      if ((e.target as HTMLElement).closest("button")) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDrag({ stepId: s.id, id, order: s.items, moved: false });
                    }}
                    onPointerMove={(e) => {
                      if (!drag || drag.id !== id) return;
                      const over = document
                        .elementsFromPoint(e.clientX, e.clientY)
                        .map((el) => (el as HTMLElement).closest<HTMLElement>("[data-spine-item]"))
                        .find(
                          (el) =>
                            el &&
                            Number(el.dataset.spineStep) === s.id &&
                            Number(el.dataset.spineItem) !== id,
                        );
                      if (!over) return drag.moved ? undefined : setDrag({ ...drag, moved: true });
                      const target = Number(over.dataset.spineItem);
                      const order = drag.order.filter((x) => x !== id);
                      const at = order.indexOf(target);
                      const box = over.getBoundingClientRect();
                      order.splice(e.clientX > box.left + box.width / 2 ? at + 1 : at, 0, id);
                      if (order.join() !== drag.order.join())
                        setDrag({ ...drag, order, moved: true });
                    }}
                    onPointerUp={() => {
                      if (!drag || drag.id !== id) return;
                      const changed = drag.order.join() !== s.items.join();
                      setDrag(null);
                      if (changed) reorder(s.id, drag.order);
                    }}
                    onPointerCancel={() => setDrag(null)}
                  >
                    {s.items.length > 1 && (
                      <GripVertical size={12} className="spine-grip" aria-hidden="true" />
                    )}
                    {authorYear(it)}
                    <button
                      type="button"
                      aria-label={t("spine.removePaper", { name: authorYear(it) })}
                      onClick={() => run(() => backend.spineRemove(projectId, id))}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
              {projectPapers.some((i) => stepOf.get(i.id) !== n + 1) && (
                <select
                  className="select spine-add"
                  aria-label={t("spine.addPaperTo", { n: n + 1 })}
                  value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) run(() => backend.spineAdd(projectId, id, s.id));
                  }}
                >
                  <option value="">{t("spine.addPaper")}</option>
                  {projectPapers
                    .filter((i) => stepOf.get(i.id) !== n + 1)
                    .map((i) => {
                      const from = stepOf.get(i.id);
                      const title = i.title.length > 56 ? `${i.title.slice(0, 55)}…` : i.title;
                      return (
                        <option key={i.id} value={i.id}>
                          {authorYear(i)} — {title}
                          {from ? ` (${t("spine.fromStep", { n: from })})` : ""}
                        </option>
                      );
                    })}
                </select>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => run(() => backend.spineAddStep(projectId, null))}
        >
          <Plus size={14} aria-hidden="true" /> {t("spine.addStep")}
        </button>
      </div>
    </div>
  );
}
