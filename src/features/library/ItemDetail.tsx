import { type Item, type ItemInput, type ReadStatus, toInput } from "@paperlines/backend-port";
import { useEffect, useRef, useState } from "react";
import { backend } from "../../backend";
import { trashWithUndo } from "../../contributions/commands";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { TagInput } from "../tags/TagInput";
import { authorsToText, textToAuthors } from "./filter";

const TYPES = [
  "article",
  "conference-paper",
  "preprint",
  "book",
  "chapter",
  "thesis",
  "report",
  "dataset",
  "software",
  "webpage",
];
const BIBLIO = [
  "volume",
  "issue",
  "pages",
  "publisher",
  "place",
  "isbn",
  "issn",
  "edition",
  "language",
  "series",
  "number",
] as const;
type BiblioKey = (typeof BIBLIO)[number];
const STATUSES: ReadStatus[] = ["unread", "reading", "read"];

interface Draft {
  title: string;
  authors: string;
  year: string;
  pubDate: string;
  venue: string;
  itemType: string;
  doi: string;
  arxivId: string;
  url: string;
  abstract: string;
  citekey: string;
  editors: string;
  biblio: Record<BiblioKey, string>;
}

function toDraft(i: Item): Draft {
  return {
    title: i.title,
    authors: authorsToText(i.authors),
    year: i.year?.toString() ?? "",
    pubDate: i.pubDate ?? "",
    venue: i.venue ?? "",
    itemType: i.itemType,
    doi: i.doi ?? "",
    arxivId: i.arxivId ?? "",
    url: i.url ?? "",
    abstract: i.abstract ?? "",
    citekey: i.citekey,
    editors: authorsToText(i.editors),
    biblio: Object.fromEntries(BIBLIO.map((k) => [k, i[k] ?? ""])) as Record<BiblioKey, string>,
  };
}

const opt = (s: string) => (s.trim() ? s.trim() : null);

function fromDraft(base: Item, d: Draft): ItemInput {
  const year = Number.parseInt(d.year, 10);
  return {
    ...toInput(base),
    title: d.title.trim(),
    authors: textToAuthors(d.authors),
    year: Number.isFinite(year) ? year : null,
    pubDate: opt(d.pubDate),
    venue: opt(d.venue),
    itemType: d.itemType,
    doi: opt(d.doi),
    arxivId: opt(d.arxivId),
    url: opt(d.url),
    abstract: opt(d.abstract),
    citekey: opt(d.citekey),
    editors: textToAuthors(d.editors),
    ...(Object.fromEntries(BIBLIO.map((k) => [k, opt(d.biblio[k])])) as Record<
      BiblioKey,
      string | null
    >),
  };
}

export function ItemDetail({ item }: { item: Item }) {
  const { save, mutate, tags, projects } = useLibrary();
  const [draft, setDraft] = useState(() => toDraft(item));
  const form = useRef<HTMLDivElement>(null);
  // changed elsewhere (Update details, a merge, the CLI): show it, unless a field is being edited
  useEffect(() => {
    if (!form.current?.contains(document.activeElement)) setDraft(toDraft(item));
  }, [item.dateModified]);
  const [status, setStatus] = useState<{
    kind: "idle" | "saving" | "saved" | "error";
    msg?: string;
  }>({ kind: "idle" });

  const persist = async (input: ItemInput) => {
    if (JSON.stringify(input) === JSON.stringify(toInput(item))) return;
    setStatus({ kind: "saving" });
    try {
      const updated = await save(item.id, input);
      setDraft(toDraft(updated));
      setStatus({ kind: "saved" });
    } catch (e) {
      setStatus({ kind: "error", msg: String(e) });
    }
  };
  const commit = () => persist(fromDraft(item, draft));

  const field = (
    key: Exclude<keyof Draft, "biblio">,
    label: string,
    opts: { multiline?: boolean; mono?: boolean; hint?: string } = {},
  ) => {
    const props = {
      id: `f-${key}`,
      className: `input${opts.mono ? " mono" : ""}`,
      value: draft[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft({ ...draft, [key]: e.target.value }),
      onBlur: commit,
    };
    return (
      <label className="field" htmlFor={props.id}>
        <span className="field-label">{label}</span>
        {opts.multiline ? (
          <textarea rows={key === "abstract" ? 6 : 3} {...props} />
        ) : (
          <input {...props} />
        )}
        {opts.hint && <span className="field-hint">{opts.hint}</span>}
      </label>
    );
  };

  const onDelete = () => trashWithUndo([item.id]);

  return (
    <div className="detail" ref={form}>
      <div className="toolbar">
        <span className={`badge${item.hasPdf ? "" : " badge-muted"}`}>
          {item.hasPdf ? t("detail.pdf") : t("detail.noPdf")}
        </span>
        <span className="muted small">
          {t("detail.added", { date: item.dateAdded.slice(0, 10) })}
        </span>
        <span className="spacer" />
        <span className={`small save-${status.kind}`} role="status">
          {status.kind === "saving"
            ? t("detail.saving")
            : status.kind === "saved"
              ? t("detail.saved")
              : ""}
        </span>
      </div>
      <div className="detail-body">
        {status.kind === "error" && <div className="alert">{status.msg}</div>}
        <textarea
          className="title-input"
          aria-label={t("detail.title")}
          rows={2}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={commit}
        />
        <div className="field">
          <span className="field-label">{t("detail.status")}</span>
          <div className="row status-row">
            <div className="segmented" role="group" aria-label={t("detail.status")}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={item.readStatus === s}
                  className={item.readStatus === s ? "on" : ""}
                  onClick={() => persist({ ...fromDraft(item, draft), readStatus: s })}
                >
                  {t(`status.${s}`)}
                </button>
              ))}
            </div>
            <div className="stars" role="group" aria-label={t("detail.rating")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={item.rating === n}
                  aria-label={`${n}`}
                  className={(item.rating ?? 0) >= n ? "on" : ""}
                  onClick={() =>
                    persist({ ...fromDraft(item, draft), rating: item.rating === n ? null : n })
                  }
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t("detail.tags")}</span>
          <TagInput
            value={item.tags}
            allTags={tags}
            onAdd={(p) => mutate(() => backend.tagItems([item.id], [p]))}
            onRemove={(p) => mutate(() => backend.untagItems([item.id], [p]))}
          />
        </div>
        <div className="field">
          <span className="field-label">{t("detail.projects")}</span>
          <div className="row">
            {projects
              .filter((p) => item.projectIds.includes(p.id))
              .map((p) => (
                <span key={p.id} className="chip">
                  <span className="chip-label">{p.name}</span>
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={t("projects.removeFrom", { name: p.name })}
                    onClick={() => mutate(() => backend.removeFromProject(p.id, [item.id]))}
                  >
                    ×
                  </button>
                </span>
              ))}
            <select
              className="select select-quiet"
              aria-label={t("projects.addTo")}
              value=""
              onChange={(e) => {
                const pid = Number(e.target.value);
                if (pid) mutate(() => backend.addToProject(pid, [item.id]));
              }}
            >
              <option value="">{t("projects.addTo")}</option>
              {projects
                .filter((p) => !item.projectIds.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        {field("authors", t("detail.authors"), { multiline: true, hint: t("detail.authorsHint") })}
        <div className="grid2">
          {field("year", t("detail.year"))}
          {field("pubDate", t("detail.pubDate"))}
        </div>
        {field("venue", t("detail.venue"))}
        <details className="biblio" open={BIBLIO.some((k) => draft.biblio[k])}>
          <summary className="field-label">{t("detail.publication")}</summary>
          <div className="grid3">
            {BIBLIO.map((k) => (
              <label key={k} className="field" htmlFor={`b-${k}`}>
                <span className="field-label">{t(`detail.b.${k}`)}</span>
                <input
                  id={`b-${k}`}
                  className="input"
                  value={draft.biblio[k]}
                  onChange={(e) =>
                    setDraft({ ...draft, biblio: { ...draft.biblio, [k]: e.target.value } })
                  }
                  onBlur={commit}
                />
              </label>
            ))}
          </div>
          {field("editors", t("detail.editors"), {
            multiline: true,
            hint: t("detail.authorsHint"),
          })}
        </details>
        <div className="grid2">
          <label className="field" htmlFor="f-type">
            <span className="field-label">{t("detail.type")}</span>
            <select
              id="f-type"
              className="select"
              value={draft.itemType}
              onChange={(e) => {
                const d = { ...draft, itemType: e.target.value };
                setDraft(d);
                persist(fromDraft(item, d));
              }}
            >
              {[...new Set([...TYPES, draft.itemType])].map((ty) => (
                <option key={ty} value={ty}>
                  {ty}
                </option>
              ))}
            </select>
          </label>
          {field("citekey", t("detail.citekey"), { mono: true })}
        </div>
        <div className="grid2">
          {field("doi", t("detail.doi"), { mono: true })}
          {field("arxivId", t("detail.arxiv"), { mono: true })}
        </div>
        {field("url", t("detail.url"))}
        {field("abstract", t("detail.abstract"), { multiline: true })}
        <div className="danger-zone">
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            {t("detail.trash")}
          </button>
        </div>
      </div>
    </div>
  );
}
