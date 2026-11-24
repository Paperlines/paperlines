import type { Suggestion } from "@paperlines/backend-port";
import { Check, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { backend } from "../../backend";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";

/** Waiting suggestions per project (0: the library's inbox), for the sidebar badges. */
export const useSuggestionCounts = create<{
  counts: Map<number, number>;
  version: number;
  refresh(): Promise<void>;
}>((set, get) => ({
  counts: new Map(),
  version: 0,
  async refresh() {
    try {
      const list = await backend.suggestionsCounts();
      set({
        counts: new Map(list.map((c) => [c.projectId ?? 0, c.count])),
        version: get().version + 1,
      });
    } catch {
      // the inbox is a convenience: a failed count just shows no badge
    }
  },
}));

/**
 * Keeps the badges current: suggestions arrive from an assistant in another app, so they're
 * counted again when this window comes back to the front, and when the library changes.
 */
export function useSuggestionRefresh() {
  const items = useLibrary((s) => s.items);
  useEffect(() => {
    useSuggestionCounts.getState().refresh();
  }, [items]);
  useEffect(() => {
    const on = () => useSuggestionCounts.getState().refresh();
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, []);
}

/** "Suggested papers" in the project dialog: what an assistant proposed, to add or dismiss. */
export function SuggestionsInbox({ projectId, onClose }: { projectId: number; onClose(): void }) {
  const [list, setList] = useState<Suggestion[] | null>(null);
  const version = useSuggestionCounts((s) => s.version);
  const load = useCallback(
    () =>
      backend
        .suggestionsList(projectId)
        .then(setList)
        .catch(() => setList([])),
    [projectId],
  );
  useEffect(() => {
    load();
  }, [load, version]);

  const dismiss = async (s: Suggestion) => {
    await backend.suggestionSetStatus(s.id, "dismissed");
    await load();
    useSuggestionCounts.getState().refresh();
  };
  const add = (s: Suggestion) => {
    const id = s.doi ?? (s.arxivId ? `arXiv:${s.arxivId}` : s.title);
    // the normal import review, into this project; once imported it leaves the inbox by itself
    onClose();
    useDialogs.getState().show("import", { text: id, projectId });
  };

  return (
    <section className="field sugg-inbox" aria-label={t("sugg.title")}>
      <span className="field-label">
        <Sparkles size={13} aria-hidden="true" /> {t("sugg.title")}
        <InfoTip label={t("help.about", { what: t("sugg.title") })}>
          {t("help.suggestions")}
        </InfoTip>
      </span>
      {list && list.length === 0 && <span className="field-hint">{t("sugg.empty")}</span>}
      {list && list.length > 0 && (
        <ul className="sugg-list">
          {list.map((s) => (
            <li key={s.id} className="sugg" aria-label={s.title}>
              <div className="sugg-text">
                <span className="sugg-title">{s.title}</span>
                <span className="sugg-meta">
                  {[s.authors && shortAuthors(s.authors), s.year, s.venue]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {s.reason && <span className="sugg-reason">{s.reason}</span>}
              </div>
              <div className="sugg-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  aria-label={t("sugg.addOne", { title: s.title })}
                  onClick={() => add(s)}
                >
                  <Check size={14} aria-hidden="true" /> {t("sugg.add")}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("sugg.dismissOne", { title: s.title })}
                  title={t("sugg.dismiss")}
                  onClick={() => dismiss(s)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function shortAuthors(a: string): string {
  const names = a.split(/,\s*/).filter(Boolean);
  return names.length > 2 ? `${names[0]} et al.` : names.join(" & ");
}
