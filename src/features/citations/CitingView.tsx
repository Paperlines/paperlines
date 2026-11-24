import type { CitingReport, CitingRow } from "@paperlines/backend-port";
import { ChevronRight, ExternalLink, FileText, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { backend } from "../../backend";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";

type Sort = "cited" | "newest" | "connected";
const PAGE = 100;
const num = new Intl.NumberFormat("en");

/** What to look a citing paper up by when adding it: a DOI, else an arXiv ID. */
const identifier = (r: CitingRow) => r.doi ?? r.arxivId ?? null;
const rowKey = (r: CitingRow) => r.openalexId ?? r.doi ?? r.arxivId ?? `${r.title}|${r.year}`;
const webUrl = (r: CitingRow) =>
  r.doi
    ? `https://doi.org/${r.doi}`
    : r.arxivId
      ? `https://arxiv.org/abs/${r.arxivId}`
      : r.openalexId
        ? `https://openalex.org/${r.openalexId}`
        : null;

const who = (authors: string[]) =>
  authors.length === 0
    ? ""
    : authors.length <= 3
      ? authors.join(", ")
      : `${authors.slice(0, 3).join(", ")} ${t("citing.etAl")}`;

/** Papers anywhere that cite a library paper: sort, filter, and add the interesting ones. */
export function CitingView({ itemId }: { itemId: number }) {
  const items = useLibrary((s) => s.items);
  const item = items.find((i) => i.id === itemId);
  const offline = useSettings((s) => s.settings?.offlineMode ?? false);
  const [report, setReport] = useState<CitingReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("cited");
  const [since, setSince] = useState("");
  const [hideInLibrary, setHideInLibrary] = useState(false);
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  /** Rows whose abstract is open, and abstracts loaded so far (null: none available). */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [abstracts, setAbstracts] = useState<Map<string, string | null | Error>>(new Map());

  const toggleAbstract = async (r: CitingRow) => {
    const key = rowKey(r);
    const next = new Set(open);
    if (next.has(key)) {
      next.delete(key);
      setOpen(next);
      return;
    }
    next.add(key);
    setOpen(next);
    if (abstracts.has(key) && !(abstracts.get(key) instanceof Error)) return;
    let value: string | null | Error;
    try {
      value = await backend.citingAbstract(r);
    } catch (e) {
      value = e instanceof Error ? e : new Error(String(e));
    }
    setAbstracts((m) => new Map(m).set(key, value));
  };

  const lookUp = async (refresh: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await backend.findCiting(itemId, refresh));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // show the cached list at once; look it up when there is none or it is old (and online)
  useEffect(() => {
    let live = true;
    const off = backend.on("citing-progress", (p) => p.itemId === itemId && setProgress(p));
    backend.cachedCiting(itemId).then((r) => {
      if (!live) return;
      if (r) setReport(r);
      if (!r || (r.stale && !offline)) lookUp(false);
    });
    return () => {
      live = false;
      off();
    };
  }, [itemId]);

  // papers added or removed: match the list against the library again (offline, cheap)
  const libraryCount = items.length;
  useEffect(() => {
    if (!report) return;
    backend.cachedCiting(itemId).then((r) => r && setReport(r));
  }, [libraryCount, itemId]);

  const titleOf = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);

  const rows = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    const from = Number.parseInt(since, 10);
    const list = report.rows.filter(
      (r) =>
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.authors.some((a) => a.toLowerCase().includes(q)) ||
          (r.venue ?? "").toLowerCase().includes(q)) &&
        (!Number.isFinite(from) || (r.year ?? 0) >= from) &&
        (!hideInLibrary || r.inLibrary === null) &&
        (!openAccessOnly || !!r.openAccessUrl),
    );
    const cites = (r: CitingRow) => r.citedByCount ?? 0;
    const order: Record<Sort, (a: CitingRow, b: CitingRow) => number> = {
      cited: (a, b) => cites(b) - cites(a),
      newest: (a, b) => (b.year ?? 0) - (a.year ?? 0) || cites(b) - cites(a),
      connected: (a, b) => b.connected.length - a.connected.length || cites(b) - cites(a),
    };
    return [...list].sort(order[sort]);
  }, [report, query, since, hideInLibrary, openAccessOnly, sort]);

  const add = (list: CitingRow[]) => {
    const ids = list.map(identifier).filter((x): x is string => !!x);
    if (!ids.length) return;
    useDialogs.getState().show("import", { text: ids.join("\n") });
    setPicked(new Set());
  };
  const pickedRows = report?.rows.filter((r) => picked.has(rowKey(r))) ?? [];

  const fetchTheirReferences = async () => {
    if (!report) return;
    await backend.fetchReferences(report.unfetchedInLibrary, false);
    usePanes.getState().citationsChanged();
    const r = await backend.cachedCiting(itemId);
    if (r) setReport(r);
  };

  const sourceName = report?.source === "semantic_scholar" ? "Semantic Scholar" : "OpenAlex";
  const cap = Math.min(progress?.total ?? 0, 2000);

  return (
    <div className="citing-view">
      <div className="citing-head">
        <div className="citing-heading">
          <h2>{t("citing.title")}</h2>
          <InfoTip label={t("help.about", { what: t("citing.title") })} wide>
            {t("help.citing")}
          </InfoTip>
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            disabled={busy || offline}
            title={offline ? t("citing.offline") : undefined}
            onClick={() => lookUp(true)}
          >
            <RefreshCw size={14} aria-hidden="true" /> {t("citing.refresh")}
          </button>
        </div>
        <div className="citing-paper" title={item?.title}>
          {item?.title ?? ""}
        </div>
        {report && (
          <div className="muted small" role="status">
            {t("citing.summary", {
              total: num.format(report.total),
              shown: num.format(report.rows.length),
              source: sourceName,
              date: report.fetchedAt.slice(0, 10),
            })}
            {report.stale && ` · ${t("citing.stale")}`}
          </div>
        )}
        {busy && (
          <div className="citing-progress" role="status">
            <div className="progress">
              <div
                style={{
                  width: cap ? `${Math.min(100, ((progress?.done ?? 0) / cap) * 100)}%` : "8%",
                }}
              />
            </div>
            <span className="muted small">
              {progress
                ? t("citing.fetching", { done: num.format(progress.done), total: num.format(cap) })
                : t("citing.starting")}
            </span>
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            {!offline && (
              <button type="button" className="btn" onClick={() => lookUp(false)}>
                {t("citing.retry")}
              </button>
            )}
          </div>
        )}
        {report && report.unfetchedInLibrary.length > 0 && (
          <div className="alert alert-info citing-unfetched">
            <span>{t("citing.unfetched", { n: report.unfetchedInLibrary.length })}</span>
            <button type="button" className="btn" disabled={offline} onClick={fetchTheirReferences}>
              {t("citing.fetchTheirs")}
            </button>
          </div>
        )}
      </div>

      {report && (
        <div className="citing-controls">
          <input
            className="input"
            type="search"
            placeholder={t("citing.filter")}
            aria-label={t("citing.filter")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
          />
          <div className="segmented" role="group" aria-label={t("citing.sort")}>
            {(["cited", "newest", "connected"] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sort === s}
                className={sort === s ? "on" : ""}
                disabled={s === "connected" && !report.connectedAvailable}
                title={
                  s === "connected" && !report.connectedAvailable
                    ? t("citing.noConnected")
                    : undefined
                }
                onClick={() => setSort(s)}
              >
                {t(`citing.sort.${s}`)}
              </button>
            ))}
          </div>
          <label className="inline-field">
            {t("citing.since")}
            <input
              className="input input-year"
              inputMode="numeric"
              placeholder="2020"
              value={since}
              onChange={(e) => setSince(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={hideInLibrary}
              onChange={(e) => setHideInLibrary(e.target.checked)}
            />
            {t("citing.hideInLibrary")}
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={openAccessOnly}
              onChange={(e) => setOpenAccessOnly(e.target.checked)}
            />
            {t("citing.openAccessOnly")}
          </label>
        </div>
      )}

      {pickedRows.length > 0 && (
        <div className="citing-selection">
          <span>{t("citing.selected", { n: pickedRows.length })}</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => setPicked(new Set())}>
            {t("bulk.clear")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => add(pickedRows)}>
            {t("citing.addN", { n: pickedRows.length })}
          </button>
        </div>
      )}

      {report && rows.length === 0 && (
        <div className="empty muted">
          {report.rows.length ? t("citing.noMatch") : t("citing.none")}
        </div>
      )}

      <ul className="citing-list" aria-label={t("citing.title")}>
        {rows.slice(0, shown).map((r) => {
          const key = rowKey(r);
          const id = identifier(r);
          const url = webUrl(r);
          const inLib = r.inLibrary;
          return (
            <li key={key} className={`citing-row${inLib ? " in-library" : ""}`}>
              <input
                type="checkbox"
                aria-label={t("citing.pick", { title: r.title })}
                disabled={!id || inLib !== null}
                title={!id ? t("citing.noId") : undefined}
                checked={picked.has(key)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(key);
                  else next.delete(key);
                  setPicked(next);
                }}
              />
              <div className="citing-main">
                <div className="citing-title-row">
                  <button
                    type="button"
                    className={`citing-toggle${open.has(key) ? " open" : ""}`}
                    aria-expanded={open.has(key)}
                    aria-label={t(open.has(key) ? "citing.hideAbstract" : "citing.showAbstract", {
                      title: r.title,
                    })}
                    title={t(
                      open.has(key) ? "citing.hideAbstractShort" : "citing.showAbstractShort",
                    )}
                    onClick={() => toggleAbstract(r)}
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  {url ? (
                    <button
                      type="button"
                      className="citing-title"
                      title={t("citing.openWeb")}
                      onClick={() => backend.openExternal(url)}
                    >
                      {r.title}
                    </button>
                  ) : (
                    <span className="citing-title">{r.title}</span>
                  )}
                </div>
                <div className="muted small">
                  {[who(r.authors), r.venue, r.year].filter(Boolean).join(" · ")}
                </div>
                <div className="citing-badges">
                  {inLib !== null && (
                    <button
                      type="button"
                      className="badge badge-lib"
                      onClick={() => {
                        useUi.getState().setView("library");
                        useUi.getState().select(inLib);
                      }}
                    >
                      {t("citing.inLibrary")}
                    </button>
                  )}
                  {r.connected.length > 0 && (
                    <span
                      className="badge badge-connected"
                      title={r.connected.map((c) => titleOf.get(c) ?? "").join("\n")}
                    >
                      {t("citing.connected", { n: r.connected.length })}
                    </span>
                  )}
                  {r.openAccessUrl && (
                    <button
                      type="button"
                      className="badge badge-oa"
                      onClick={() => backend.openExternal(r.openAccessUrl as string)}
                    >
                      <FileText size={11} aria-hidden="true" /> {t("citing.openAccess")}
                    </button>
                  )}
                </div>
                {open.has(key) && (
                  <div className="citing-abstract">
                    {!abstracts.has(key) ? (
                      <span className="muted">{t("citing.loadingAbstract")}</span>
                    ) : abstracts.get(key) instanceof Error ? (
                      <span className="warn">{String((abstracts.get(key) as Error).message)}</span>
                    ) : abstracts.get(key) ? (
                      <p>{abstracts.get(key) as string}</p>
                    ) : (
                      <span className="muted">{t("citing.noAbstract")}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="citing-count" title={t("citing.citedByCount")}>
                {r.citedByCount !== null ? num.format(r.citedByCount) : ""}
              </div>
              <div className="citing-actions">
                {inLib === null && id && (
                  <button
                    type="button"
                    className="icon-btn citing-add"
                    aria-label={t("citing.addOne", { title: r.title })}
                    title={t("citing.addShort")}
                    onClick={() => add([r])}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                )}
                {url && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("citing.openWebFor", { title: r.title })}
                    onClick={() => backend.openExternal(url)}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > shown && (
        <button type="button" className="btn citing-more" onClick={() => setShown(shown + PAGE)}>
          {t("citing.showMore", { n: Math.min(PAGE, rows.length - shown) })}
        </button>
      )}
    </div>
  );
}
