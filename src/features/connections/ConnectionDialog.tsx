import type { Highlight, RelationType, RelationView } from "@paperlines/backend-port";
import { fuzzyScore } from "@paperlines/registry";
import { useEffect, useMemo, useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { shortAuthors } from "../library/filter";

export interface ConnectionArg {
  /** The paper the dialog speaks from ("This paper … that paper"). */
  from: number;
  /** The other paper, when already known (e.g. dragged onto in the graph). */
  to?: number;
  /** Editing an existing connection. */
  relationId?: number;
}

/** One choice per wording: "Extends" (this → that) and "Extended by" (that → this). */
interface Wording {
  value: string;
  typeId: number;
  outgoing: boolean;
  label: string;
  color: string;
}

function wordings(types: RelationType[]): Wording[] {
  return types.flatMap((ty) => [
    { value: `${ty.id}:out`, typeId: ty.id, outgoing: true, label: ty.label, color: ty.color },
    ...(ty.inverseLabel
      ? [
          {
            value: `${ty.id}:in`,
            typeId: ty.id,
            outgoing: false,
            label: ty.inverseLabel,
            color: ty.color,
          },
        ]
      : []),
  ]);
}

const quote = (h: Highlight) => {
  const text = (h.text ?? "").replace(/\s+/g, " ").trim();
  return `p. ${h.page}: “${text.length > 70 ? `${text.slice(0, 70)}…` : text || h.kind}”`;
};

/** Add or edit a typed connection between this paper and another. */
export function ConnectionDialog({ arg, onClose }: { arg: ConnectionArg; onClose(): void }) {
  const items = useLibrary((s) => s.items);
  const anchor = items.find((i) => i.id === arg.from);
  const [types, setTypes] = useState<RelationType[]>([]);
  const [existing, setExisting] = useState<RelationView | null>(null);
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState<number | null>(arg.to ?? null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backend.relationTypes().then((ts) => {
      setTypes(ts);
      setChoice((c) => c || (ts[0] ? `${ts[0].id}:out` : ""));
    });
    if (arg.relationId)
      backend.itemRelations(arg.from).then((list) => {
        const r = list.find((x) => x.id === arg.relationId);
        if (!r) return;
        setExisting(r);
        setOther(r.otherItemId);
        setChoice(`${r.typeId}:${r.outgoing ? "out" : "in"}`);
        setNote(r.note ?? "");
        setEvidence(r.evidenceHighlightId);
      });
  }, [arg.from, arg.relationId]);

  // evidence: highlights in either paper
  useEffect(() => {
    const ids = [arg.from, ...(other !== null ? [other] : [])];
    Promise.all(ids.map((id) => backend.listHighlights(id))).then((hs) => setHighlights(hs.flat()));
  }, [arg.from, other]);

  const options = wordings(types);
  const picked = options.find((o) => o.value === choice);
  const otherItem = items.find((i) => i.id === other);
  const matches = useMemo(
    () =>
      items
        .filter((i) => i.id !== arg.from)
        .map((i) => ({
          i,
          s: fuzzyScore(q, `${i.title} ${i.citekey} ${i.authors.map((a) => a.family).join(" ")}`),
        }))
        .filter((x) => x.s !== null)
        .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
        .slice(0, 7)
        .map((x) => x.i),
    [items, q, arg.from],
  );

  const save = async () => {
    if (!picked || other === null) return;
    setError(null);
    const [from, to] = picked.outgoing ? [arg.from, other] : [other, arg.from];
    try {
      if (existing) {
        const swap = existing.fromItemId !== from;
        await backend.updateRelation(existing.id, picked.typeId, swap, note || null, evidence);
      } else {
        await backend.addRelation(from, to, picked.typeId, note || null, evidence);
      }
      usePanes.getState().citationsChanged();
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async () => {
    if (!existing) return;
    await backend.removeRelation(existing.id);
    usePanes.getState().citationsChanged();
    onClose();
  };

  if (!anchor) return null;
  return (
    <Dialog
      title={existing ? t("conn.editTitle") : t("conn.addTitle")}
      subtitle={t("conn.subtitle")}
      onClose={onClose}
      wide
      footer={
        <>
          {existing && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              {t("conn.remove")}
            </button>
          )}
          <button
            type="button"
            className="nav-link"
            onClick={() => useDialogs.getState().show("connectionTypes", arg)}
          >
            {t("conn.manageTypes")}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t("import.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!picked || other === null}
            onClick={save}
          >
            {existing ? t("common.save") : t("conn.add")}
          </button>
        </>
      }
    >
      <div className="conn-sentence">
        <span className="conn-paper" title={anchor.title}>
          {anchor.title}
        </span>
        <select
          className="select conn-type"
          aria-label={t("conn.type")}
          value={choice}
          style={picked ? { borderColor: `var(--tag-${picked.color})` } : undefined}
          onChange={(e) => setChoice(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {otherItem ? (
          <span className="conn-paper conn-other">
            <span title={otherItem.title}>{otherItem.title}</span>
            {!existing && (
              <button type="button" className="nav-link" onClick={() => setOther(null)}>
                {t("conn.change")}
              </button>
            )}
          </span>
        ) : (
          <div className="conn-picker">
            <input
              className="input"
              autoFocus
              placeholder={t("citations.pickerFilter")}
              aria-label={t("conn.otherPaper")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <ul className="pick-list" aria-label={t("conn.otherPaper")}>
              {matches.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => setOther(i.id)}>
                    <span className="cite-title">{i.title}</span>
                    <span className="muted small">
                      {[shortAuthors(i.authors), i.year].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <label className="field">
        <span className="field-label">{t("conn.note")}</span>
        <textarea
          className="input"
          rows={2}
          placeholder={t("conn.notePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">
          {t("conn.evidence")}
          <InfoTip label={t("help.about", { what: t("conn.evidence") })}>
            {t("help.evidence")}
          </InfoTip>
        </span>
        <select
          className="select"
          value={evidence ?? ""}
          disabled={highlights.length === 0}
          onChange={(e) => setEvidence(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">
            {highlights.length ? t("conn.noEvidence") : t("conn.noHighlights")}
          </option>
          {highlights.map((h) => (
            <option key={h.id} value={h.id}>
              {`${items.find((i) => i.id === h.itemId)?.citekey ?? ""} ${quote(h)}`}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="alert">{error}</div>}
    </Dialog>
  );
}
