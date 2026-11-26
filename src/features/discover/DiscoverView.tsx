import type { DiscoverHit, DiscoverReport, SearchSource } from "@paperlines/backend-port";
import { ChevronRight, ExternalLink, FileText, Network, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { create } from "zustand";
import { backend } from "../../backend";
import { InfoTip } from "../../components/InfoTip";
import { numberFormat, t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";

const SOURCES: SearchSource[] = [
  "openalex",
  "semantic_scholar",
  "arxiv",
  "pubmed",
  "crossref",
  "europe_pmc",
  "datacite",
  "doaj",
];
export const SOURCE_NAME: Record<SearchSource, string> = {
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  arxiv: "arXiv",
  pubmed: "PubMed",
  crossref: "Crossref",
  europe_pmc: "Europe PMC",
  datacite: "DataCite",
  doaj: "DOAJ",
};
type Sort = "relevance" | "cited" | "newest";
const num = numberFormat;

/** The last search survives switching views. */
const useDiscover = create<{
  query: string;
  sources: SearchSource[];
  report: DiscoverReport | null;
  searched: string;
  set(
    p: Partial<{
      query: string;
      sources: SearchSource[];
      report: DiscoverReport | null;
      searched: string;
    }>,
  ): void;
}>((set) => ({ query: "", sources: SOURCES, report: null, searched: "", set }));

/** What to look a hit up by when adding it: DOI, arXiv ID, or PubMed ID. */
export const hitId = (h: DiscoverHit) =>
  h.doi ?? (h.arxivId ? h.arxivId : h.pmid ? `PMID:${h.pmid}` : null);
const hitKey = (h: DiscoverHit) => h.doi ?? h.arxivId ?? h.pmid ?? `${h.title}|${h.year}`;
const hitUrl = (h: DiscoverHit) =>
  h.doi
    ? `https://doi.org/${h.doi}`
    : h.arxivId
      ? `https://arxiv.org/abs/${h.arxivId}`
      : h.pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${h.pmid}/`
        : null;
const who = (a: string[]) =>
  a.length <= 3 ? a.join(", ") : `${a.slice(0, 3).join(", ")} ${t("citing.etAl")}`;

/** Search OpenAlex, Semantic Scholar, arXiv, PubMed and Crossref; add or map what you find. */
export function DiscoverView() {
  const { query, sources, report, searched, set } = useDiscover();
  const items = useLibrary((s) => s.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("relevance");
  const [since, setSince] = useState("");
  const [hideInLibrary, setHideInLibrary] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [abstracts, setAbstracts] = useState<Map<string, string | null>>(new Map());

  const run = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setPicked(new Set());
    try {
      set({ report: await backend.searchOnline(q, sources), searched: q });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // papers added since the search show as in the library
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const inLib = (h: DiscoverHit) =>
    h.inLibrary ??
    items.find(
      (i) =>
        (h.doi && i.doi?.toLowerCase() === h.doi.toLowerCase()) ||
        (h.arxivId && i.arxivId === h.arxivId) ||
        // PubMed-only papers are kept with their PubMed link
        (h.pmid && i.url?.includes(`pubmed.ncbi.nlm.nih.gov/${h.pmid}`)) ||
        (i.year === h.year && norm(i.title) === norm(h.title)),
    )?.id ??
    null;

  const rows = useMemo(() => {
    if (!report) return [];
    const from = Number.parseInt(since, 10);
    const list = report.hits.filter(
      (h) =>
        (!Number.isFinite(from) || (h.year ?? 0) >= from) && (!hideInLibrary || inLib(h) === null),
    );
    const c = (h: DiscoverHit) => h.citedByCount ?? 0;
    if (sort === "cited") return [...list].sort((a, b) => c(b) - c(a));
    if (sort === "newest")
      return [...list].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || c(b) - c(a));
    return list;
  }, [report, since, hideInLibrary, sort, items]);

  const pickedHits = report?.hits.filter((h) => picked.has(hitKey(h))) ?? [];
  const ids = (list: DiscoverHit[]) => list.map(hitId).filter((x): x is string => !!x);

  const add = (list: DiscoverHit[]) => {
    if (!ids(list).length) return;
    useDialogs.getState().show("import", { text: ids(list).join("\n") });
    setPicked(new Set());
  };

  // a new project named after the search, filled with the chosen papers, shown as a graph
  const map = async (list: DiscoverHit[]) => {
    const base = (searched || query).trim().slice(0, 60) || t("discover.mapName");
    const taken = new Set(useLibrary.getState().projects.map((p) => p.name.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    const projectId = await backend.createProject(name, t("discover.mapDescription", { q: base }));
    // papers already in the library join the project directly
    const have = list.map(inLib).filter((x): x is number => x !== null);
    if (have.length) await backend.addToProject(projectId, have);
    await useLibrary.getState().refresh();
    const fresh = list.filter((h) => inLib(h) === null);
    setPicked(new Set());
    if (ids(fresh).length)
      useDialogs
        .getState()
        .show("import", { text: ids(fresh).join("\n"), projectId, openGraph: true });
    else openProjectGraph(projectId);
  };

  const toggleAbstract = async (h: DiscoverHit) => {
    const k = hitKey(h);
    const next = new Set(open);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setOpen(next);
    if (h.abstractText || abstracts.has(k) || !next.has(k)) return;
    const a = await backend
      .citingAbstract({ openalexId: h.openalexId, doi: h.doi, arxivId: h.arxivId })
      .catch(() => null);
    setAbstracts((m) => new Map(m).set(k, a));
  };

  return (
    <div className="view-pane discover">
      <div className="view-head">
        <h2>{t("discover.title")}</h2>
        <InfoTip label={t("help.about", { what: t("discover.title") })} wide>
          {t("help.discover")}
        </InfoTip>
      </div>
      <form
        className="discover-form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="discover-input">
          <Search size={15} aria-hidden="true" />
          <input
            className="input"
            type="search"
            autoFocus
            placeholder={t("discover.placeholder")}
            aria-label={t("discover.placeholder")}
            value={query}
            onChange={(e) => set({ query: e.target.value })}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !query.trim()}>
            {busy ? t("discover.searching") : t("discover.search")}
          </button>
        </div>
        <div className="panel-types" role="group" aria-label={t("discover.sources")}>
          {SOURCES.map((s) => {
            const on = sources.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                className={`type-chip${on ? " on" : ""}`}
                style={{ "--chip": "var(--accent)" } as React.CSSProperties}
                onClick={() =>
                  set({
                    sources: on
                      ? sources.length > 1
                        ? sources.filter((x) => x !== s)
                        : sources
                      : [...sources, s],
                  })
                }
              >
                {SOURCE_NAME[s]}
              </button>
            );
          })}
        </div>
      </form>

      {error && <div className="alert">{error}</div>}
      {report && report.errors.length > 0 && (
        <div className="alert alert-info discover-errors">
          {t("discover.someFailed", {
            names: report.errors.map((e) => SOURCE_NAME[e.source] ?? e.source).join(", "),
          })}
          {!report.hasOpenalexKey && ` ${t("discover.keyHint")}`}{" "}
          <button type="button" className="nav-link" disabled={busy} onClick={run}>
            {busy ? t("discover.searching") : t("discover.retry")}
          </button>
        </div>
      )}

      {report && (
        <div className="citing-controls">
          <span className="muted small" role="status">
            {t("discover.count", { n: report.hits.length, q: searched })}
          </span>
          <div className="segmented" role="group" aria-label={t("citing.sort")}>
            {(["relevance", "cited", "newest"] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sort === s}
                className={sort === s ? "on" : ""}
                onClick={() => setSort(s)}
              >
                {t(`discover.sort.${s}`)}
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
        </div>
      )}

      {pickedHits.length > 0 && (
        <div className="citing-selection">
          <span>{t("citing.selected", { n: pickedHits.length })}</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => setPicked(new Set())}>
            {t("bulk.clear")}
          </button>
          <button type="button" className="btn" onClick={() => map(pickedHits)}>
            <Network size={14} aria-hidden="true" /> {t("discover.mapN", { n: pickedHits.length })}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => add(pickedHits)}>
            {t("citing.addN", { n: pickedHits.length })}
          </button>
        </div>
      )}

      {report && rows.length === 0 && <div className="empty muted">{t("discover.none")}</div>}
      {!report && !busy && <div className="empty muted discover-empty">{t("discover.start")}</div>}

      <ul className="citing-list discover-list" aria-label={t("discover.results")}>
        {rows.map((h) => {
          const k = hitKey(h);
          const id = hitId(h);
          const url = hitUrl(h);
          const lib = inLib(h);
          const abs = h.abstractText ?? abstracts.get(k);
          return (
            <li key={k} className={`citing-row${lib ? " in-library" : ""}`}>
              <input
                type="checkbox"
                aria-label={t("citing.pick", { title: h.title })}
                disabled={!id}
                title={!id ? t("citing.noId") : undefined}
                checked={picked.has(k)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(k);
                  else next.delete(k);
                  setPicked(next);
                }}
              />
              <div className="citing-main">
                <div className="citing-title-row">
                  <button
                    type="button"
                    className={`citing-toggle${open.has(k) ? " open" : ""}`}
                    aria-expanded={open.has(k)}
                    aria-label={t(open.has(k) ? "citing.hideAbstract" : "citing.showAbstract", {
                      title: h.title,
                    })}
                    onClick={() => toggleAbstract(h)}
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
                      {h.title}
                    </button>
                  ) : (
                    <span className="citing-title">{h.title}</span>
                  )}
                </div>
                <div className="muted small">
                  {[who(h.authors), h.venue, h.year].filter(Boolean).join(" · ")}
                </div>
                <div className="citing-badges">
                  {lib !== null && (
                    <button
                      type="button"
                      className="badge badge-lib"
                      onClick={() => {
                        useUi.getState().setView("library");
                        useUi.getState().select(lib);
                      }}
                    >
                      {t("citing.inLibrary")}
                    </button>
                  )}
                  {h.openAccessUrl && (
                    <button
                      type="button"
                      className="badge badge-oa"
                      onClick={() => backend.openExternal(h.openAccessUrl as string)}
                    >
                      <FileText size={11} aria-hidden="true" /> {t("citing.openAccess")}
                    </button>
                  )}
                  {h.sources.map((s) => (
                    <span key={s} className="badge badge-source">
                      {SOURCE_NAME[s] ?? s}
                    </span>
                  ))}
                </div>
                {open.has(k) && (
                  <div className="citing-abstract">
                    {abs ? (
                      <p>{abs}</p>
                    ) : abstracts.has(k) || h.abstractText ? (
                      <span className="muted">{t("citing.noAbstract")}</span>
                    ) : (
                      <span className="muted">{t("citing.loadingAbstract")}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="citing-count" title={t("citing.citedByCount")}>
                {h.citedByCount !== null ? num.format(h.citedByCount) : ""}
              </div>
              <div className="citing-actions">
                {lib === null && id && (
                  <button
                    type="button"
                    className="icon-btn citing-add"
                    aria-label={t("citing.addOne", { title: h.title })}
                    title={t("citing.addShort")}
                    onClick={() => add([h])}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                )}
                {url && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("citing.openWebFor", { title: h.title })}
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
    </div>
  );
}

/** The graph, showing one project's papers. */
export function openProjectGraph(projectId: number) {
  usePanes.getState().setGraph({ projectId, focus: false, search: "" });
  usePanes.getState().openGraph();
}
