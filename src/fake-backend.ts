// In-memory backend for running the UI in a plain browser (vite dev, Playwright, screenshots).
import type {
  AgentChat,
  AgentConfig,
  AgentEvent,
  AssistantStatus,
  AutoExport,
  BackendEvents,
  BackendPort,
  Candidate,
  CitationLink,
  CitationSource,
  CitingReport,
  CitingRow,
  DiscoverHit,
  Highlight,
  Item,
  ItemInput,
  Note,
  NoteRef,
  ProjectInfo,
  Relation,
  RelationType,
  RelationView,
  SavedSearch,
  Settings,
  Suggestion,
  TagColor,
} from "@paperlines/backend-port";
import { toInput } from "@paperlines/backend-port";
import { inRange, parse, parseRange } from "@paperlines/search-query";
import { branding } from "./branding.generated";
import { samplePdf } from "./sample-pdf";

const LOREM = [
  "The dominant sequence transduction models are based on complex recurrent or",
  "convolutional neural networks that include an encoder and a decoder. The best",
  "performing models also connect the encoder and decoder through an attention",
  "mechanism. We propose a new simple network architecture, the Transformer,",
  "based solely on attention mechanisms, dispensing with recurrence entirely.",
  "Experiments on two machine translation tasks show these models to be superior",
  "in quality while being more parallelizable and requiring less time to train.",
];

type Listener = (payload: unknown) => void;

const blank: ItemInput = {
  itemType: "article",
  citekey: null,
  title: "",
  authors: [],
  year: null,
  pubDate: null,
  venue: null,
  doi: null,
  arxivId: null,
  url: null,
  abstract: null,
  readStatus: null,
  rating: null,
  volume: null,
  issue: null,
  pages: null,
  publisher: null,
  place: null,
  isbn: null,
  issn: null,
  edition: null,
  language: null,
  series: null,
  number: null,
  editors: [],
};

const seed: Array<Partial<ItemInput> & { title: string; hasPdf?: boolean; tags?: string[] }> = [
  {
    title: "Attention Is All You Need",
    authors: [
      { family: "Vaswani", given: "Ashish" },
      { family: "Shazeer", given: "Noam" },
      { family: "Parmar", given: "Niki" },
    ],
    year: 2017,
    venue: "NeurIPS",
    arxivId: "1706.03762",
    readStatus: "read",
    rating: 5,
    hasPdf: true,
    tags: ["ml/nlp", "transformers"],
    abstract:
      "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
  },
  {
    title: "Deep Residual Learning for Image Recognition",
    authors: [
      { family: "He", given: "Kaiming" },
      { family: "Zhang", given: "Xiangyu" },
    ],
    year: 2016,
    venue: "CVPR",
    doi: "10.1109/cvpr.2016.90",
    readStatus: "reading",
    hasPdf: true,
    tags: ["ml/vision"],
  },
  {
    title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    authors: [
      { family: "Devlin", given: "Jacob" },
      { family: "Chang", given: "Ming-Wei" },
    ],
    year: 2019,
    venue: "NAACL",
    doi: "10.18653/v1/n19-1423",
    tags: ["ml/nlp", "transformers"],
  },
  {
    title: "Deep learning",
    authors: [
      { family: "LeCun", given: "Yann" },
      { family: "Bengio", given: "Yoshua" },
      { family: "Hinton", given: "Geoffrey" },
    ],
    year: 2015,
    venue: "Nature",
    doi: "10.1038/nature14539",
    readStatus: "read",
    rating: 4,
    tags: ["survey"],
  },
  {
    title: "Language Models are Few-Shot Learners",
    authors: [{ family: "Brown", given: "Tom B." }],
    year: 2020,
    venue: "NeurIPS",
    arxivId: "2005.14165",
    hasPdf: true,
  },
];

function citekeyFor(i: ItemInput): string {
  const fam = (i.authors[0]?.family ?? "anon").toLowerCase().replace(/[^a-z0-9]/g, "");
  const word = (i.title.split(/\s+/).find((w) => w.length > 3) ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${fam}${i.year ?? "nd"}${word}`;
}

const DEFAULT_HL = [
  { color: "yellow", label: "Key idea" },
  { color: "red", label: "Disagree" },
  { color: "green", label: "Method" },
  { color: "blue", label: "Definition" },
  { color: "purple", label: "Question" },
];

export function createFakeBackend(opts: { seed?: boolean } = {}): BackendPort {
  let nextId = 1;
  // --- the assistant panel: ?noclaude pretends no agent is installed ---
  const noClaude =
    typeof location !== "undefined" && new URLSearchParams(location.search).has("noclaude");
  let agentConfig: AgentConfig = { cliAllowWrites: false, agent: null };
  const agentRuns = new Map<string, { stopped: boolean }>();
  const agentChats = new Map<string, AgentChat>();
  let agentClock = 0;
  let items: Item[] = [];
  let settings: Settings = {
    offlineMode: false,
    paperNoteTemplate: "- Key idea: \n- Method: \n- Why it matters: ",
    highlightColors: [
      { color: "yellow", label: "Key idea" },
      { color: "red", label: "Disagree" },
      { color: "green", label: "Method" },
      { color: "blue", label: "Definition" },
      { color: "purple", label: "Question" },
    ],
    vimMode: false,
    autoFetchReferences: true,
    autoFindPdfs: true,
    grobidUrl: null,
    citationStyle: "apa",
    trashDays: 30,
    checkForUpdates: true,
  };
  // --- citations: cached reference lists per citekey; edges are derived like the real backend ---
  type Ref = { doi?: string; arxivId?: string; title?: string; year?: number };
  const outside = (n: number): Ref[] =>
    Array.from({ length: n }, (_, i) => ({
      title: `Unrelated work number ${i}`,
      year: 2000 + (i % 20),
    }));
  const REFS: Record<string, Ref[]> = {
    devlin2019bert: [
      { arxivId: "1706.03762" },
      { title: "Deep residual learning for image recognition", year: 2016 },
      ...outside(12),
    ],
    brown2020language: [
      { doi: "10.18653/v1/n19-1423" },
      { title: "Attention is all you need", year: 2017 },
      { title: "An Old Paper Not Yet Imported", year: 2019 },
      ...outside(30),
    ],
    vaswani2017attention: [
      { title: "Deep Residual Learning for Image Recognition", year: 2016 },
      ...outside(20),
    ],
    lecun2015deep: outside(40),
  };
  const cache = new Map<string, { refs: Ref[]; source: CitationSource; fetchedAt: string }>();
  const manual = new Map<string, boolean>(); // "citing>cited" -> visible?
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const matchRef = (r: Ref) =>
    items.find(
      (i) =>
        (r.doi && i.doi === r.doi) ||
        (r.arxivId && i.arxivId === r.arxivId) ||
        (r.title &&
          norm(i.title) === norm(r.title) &&
          (!r.year || !i.year || Math.abs(r.year - i.year) <= 1)),
    );
  const edges = (): Array<{
    citing: number;
    cited: number;
    source: CitationSource;
    isManual: boolean;
  }> => {
    const out = new Map<
      string,
      { citing: number; cited: number; source: CitationSource; isManual: boolean }
    >();
    for (const [key, c] of cache) {
      const citing = items.find((i) => i.citekey === key);
      if (!citing) continue;
      for (const r of c.refs) {
        const m = matchRef(r);
        if (m && m.id !== citing.id)
          out.set(`${citing.id}>${m.id}`, {
            citing: citing.id,
            cited: m.id,
            source: c.source,
            isManual: false,
          });
      }
    }
    for (const [k, visible] of manual) {
      const [citing, cited] = k.split(">").map(Number);
      if (visible) out.set(k, { citing, cited, source: "manual", isManual: true });
      else out.delete(k);
    }
    for (const e of demoEdges) out.set(`${e.citing}>${e.cited}`, e);
    return [...out.values()].filter(
      (e) => items.some((i) => i.id === e.citing) && items.some((i) => i.id === e.cited),
    );
  };
  const secrets = new Map<string, string>();
  const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
  let notes: Note[] = [];
  let highlights: Highlight[] = [];
  // ?pending: a highlight an assistant made from the PDF's text, not yet placed on the page
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("pending"))
    highlights.push({
      id: 6001,
      itemId: 1,
      attachmentId: 1,
      page: 2,
      kind: "highlight",
      rects: [],
      text: "based solely on attention mechanisms, dispensing with recurrence entirely",
      color: "yellow",
      comment: "Key idea: attention alone, no recurrence",
      createdAt: "2026-11-22 10:00:00",
    });
  const links = (body: string) =>
    [...body.matchAll(/\[\[([^\]|#\n]+)[^\]]*\]\]|(?:^|[^\w@])@([A-Za-z](?:[\w:.-]*\w)?)/g)].map(
      (m) => (m[1] ?? m[2]).trim().toLowerCase(),
    );
  const noteRef = (n: Note, snippetFor?: string): NoteRef => {
    const item = items.find((i) => i.id === n.itemId);
    const line = snippetFor
      ? n.body.split("\n").find((l) => l.toLowerCase().includes(snippetFor.toLowerCase()))
      : n.body.split("\n").find((l) => l.trim());
    return {
      noteId: n.id,
      kind: n.kind,
      title: n.kind === "paper_note" ? (item?.title ?? "") : (n.title ?? "Untitled note"),
      itemId: n.itemId,
      projectId: n.projectId,
      updatedAt: n.updatedAt,
      snippet: (line ?? "").trim().slice(0, 160),
    };
  };
  const paperNote = (itemId: number): Note => {
    let n = notes.find((x) => x.kind === "paper_note" && x.itemId === itemId);
    if (!n) {
      n = {
        id: nextOther++,
        kind: "paper_note",
        itemId,
        projectId: null,
        highlightId: null,
        title: null,
        body: "",
        updatedAt: now(),
      };
      notes.push(n);
    }
    return n;
  };
  const listeners = new Map<string, Set<Listener>>();
  const citingCache = new Map<number, CitingReport>();
  // typed connections, as the real backend seeds them
  let relTypes: RelationType[] = [
    {
      id: 901,
      key: "extends",
      label: "Extends",
      inverseLabel: "Extended by",
      color: "blue",
      builtin: true,
      count: 0,
    },
    {
      id: 902,
      key: "contradicts",
      label: "Contradicts",
      inverseLabel: "Contradicted by",
      color: "red",
      builtin: true,
      count: 0,
    },
    {
      id: 903,
      key: "replicates",
      label: "Replicates",
      inverseLabel: "Replicated by",
      color: "green",
      builtin: true,
      count: 0,
    },
    {
      id: 904,
      key: "applies_method",
      label: "Applies method of",
      inverseLabel: "Method applied by",
      color: "purple",
      builtin: true,
      count: 0,
    },
  ];
  let relations: Relation[] = [];
  // two papers an assistant suggested for "Thesis chapter 2"
  let suggestions: Suggestion[] = [
    {
      id: 7001,
      projectId: 1,
      doi: "10.48550/arxiv.1409.0473",
      arxivId: "1409.0473",
      title: "Neural Machine Translation by Jointly Learning to Align and Translate",
      authors: "Dzmitry Bahdanau, Kyunghyun Cho, Yoshua Bengio",
      year: 2014,
      venue: "ICLR",
      reason: "Cited by 2 of your project papers",
      status: "new",
      createdAt: "2026-11-22 10:00:00",
    },
    {
      id: 7002,
      projectId: 1,
      doi: "10.1162/neco.1997.9.8.1735",
      arxivId: null,
      title: "Long Short-Term Memory",
      authors: "Sepp Hochreiter, Jürgen Schmidhuber",
      year: 1997,
      venue: "Neural Computation",
      reason: "Cited by 3 of your project papers",
      status: "new",
      createdAt: "2026-11-22 10:00:00",
    },
  ];
  const imported = (s: Suggestion) =>
    items.some(
      (i) => (s.doi && i.doi?.toLowerCase() === s.doi) || (s.arxivId && i.arxivId === s.arxivId),
    );
  const assistants: Omit<AssistantStatus, "manual">[] = [
    {
      id: "claude-code",
      name: "Claude Code",
      installed: true,
      connected: false,
      stale: false,
      configPath: "~/.claude.json",
      skill: false,
      skillPath: "~/.claude/skills/paperlines/SKILL.md",
    },
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      installed: true,
      connected: true,
      stale: true,
      configPath: "~/Library/Application Support/Claude/claude_desktop_config.json",
      skill: null,
      skillPath: null,
    },
    {
      id: "grok",
      name: "Grok",
      installed: true,
      connected: false,
      stale: false,
      configPath: "~/.grok/config.toml",
      skill: false,
      skillPath: "~/.grok/skills",
    },
    {
      id: "codex",
      name: "Codex",
      installed: false,
      connected: false,
      stale: false,
      configPath: "~/.codex/config.toml",
      skill: false,
      skillPath: "~/.agents/skills/paperlines/SKILL.md",
    },
    {
      id: "antigravity",
      name: "Antigravity",
      installed: false,
      connected: false,
      stale: false,
      configPath: "~/.gemini/config/mcp_config.json",
      skill: false,
      skillPath: "~/.gemini/config/skills",
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      installed: false,
      connected: false,
      stale: false,
      configPath: "~/.gemini/settings.json",
      skill: false,
      skillPath: "~/.gemini/skills",
    },
    {
      id: "cursor",
      name: "Cursor",
      installed: false,
      connected: false,
      stale: false,
      configPath: "~/.cursor/mcp.json",
      skill: null,
      skillPath: null,
    },
  ];
  let spine: {
    id: number;
    projectId: number;
    position: number;
    label: string | null;
    items: number[];
  }[] = [];
  const spineStep = (id: number) => {
    const s = spine.find((x) => x.id === id);
    if (!s) throw new Error("Step not found");
    return s;
  };
  /** Papers leave this spine; a step they leave empty goes unless named (or it is `keep`). */
  const spineForget = (projectId: number, ids: number[], keep?: number) => {
    const left = new Set<number>();
    for (const s of spine)
      if (s.projectId === projectId && s.items.some((i) => ids.includes(i))) {
        s.items = s.items.filter((i) => !ids.includes(i));
        left.add(s.id);
      }
    spine = spine.filter(
      (s) => !left.has(s.id) || s.id === keep || s.items.length > 0 || !!s.label,
    );
  };
  /** Connections between papers not in the Trash. */
  const alive = (r: Relation) =>
    items.some((i) => i.id === r.fromItemId) && items.some((i) => i.id === r.toItemId);
  // test hook: files dropped from the OS at a point in the window
  if (typeof window !== "undefined")
    (window as unknown as { __dropFiles?: unknown }).__dropFiles = (
      paths: string[],
      x: number,
      y: number,
    ) => {
      for (const cb of listeners.get("files-dropped") ?? []) cb({ paths, x, y });
    };
  /** Like the real backend: in-library citing papers whose references were never fetched. */
  const withUnfetched = (report: CitingReport): CitingReport => {
    const r = structuredClone(report);
    // re-match against the library as it is now (papers may have been added since)
    for (const x of r.rows)
      x.inLibrary ??=
        items.find((i) => (x.doi && i.doi === x.doi) || (x.arxivId && i.arxivId === x.arxivId))
          ?.id ?? null;
    return withUnfetchedIds(r);
  };
  const withUnfetchedIds = (r: CitingReport): CitingReport => ({
    ...r,
    unfetchedInLibrary: r.rows
      .map((x) => x.inLibrary)
      .filter((x): x is number => {
        const key = items.find((i) => i.id === x)?.citekey;
        return x !== null && !!key && !cache.has(key);
      }),
  });

  let tags = new Map<string, TagColor | null>([
    ["ml/nlp", "blue"],
    ["ml/vision", "green"],
    ["transformers", "purple"],
    ["survey", null],
  ]);
  let projects: ProjectInfo[] = [
    { id: 1, name: "Thesis chapter 2", description: "Related work", count: 0, color: "blue" },
  ];
  let saved: SavedSearch[] = [{ id: 1, name: "Unread NLP", query: "tag:ml/nlp is:unread" }];
  let nextOther = 10;
  const tagKey = (p: string) =>
    p
      .trim()
      .replace(/\s*\/\s*/g, "/")
      .toLowerCase();
  const findTag = (p: string) => [...tags.keys()].find((k) => k.toLowerCase() === tagKey(p));
  const countProjects = () => {
    for (const p of projects) p.count = items.filter((i) => i.projectIds.includes(p.id)).length;
  };

  const make = (input: ItemInput, hasPdf = false, daysAgo = 0): Item => {
    const date = new Date(Date.now() - daysAgo * 86400000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    return {
      ...input,
      id: nextId++,
      citekey: input.citekey || citekeyFor(input),
      readStatus: input.readStatus ?? "unread",
      dateAdded: date,
      dateModified: date,
      hasPdf,
      hasEpub: false,
      tags: [],
      projectIds: [],
      deletedAt: null,
    };
  };
  let trashed: Item[] = [];
  let autoExports: AutoExport[] = [];

  if (opts.seed !== false) {
    items = seed.map(({ hasPdf, tags: t, ...s }, n) => ({
      ...make({ ...blank, ...s }, hasPdf ?? false, n * 3),
      tags: t ?? [],
      projectIds: n === 2 ? [1] : [],
    }));
  }

  const demoEdges: Array<{
    citing: number;
    cited: number;
    source: CitationSource;
    isManual: boolean;
  }> = [];
  const demo =
    typeof location !== "undefined"
      ? Number(new URLSearchParams(location.search).get("demo") ?? 0)
      : 0;
  if (demo > 0) {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const words = [
      "graph",
      "neural",
      "attention",
      "causal",
      "sparse",
      "bayesian",
      "robust",
      "efficient",
      "learning",
      "models",
    ];
    const start = items.length;
    for (let n = 0; n < demo; n++) {
      const year = 1990 + Math.floor((n / demo) * 35);
      const it = make(
        {
          ...blank,
          title: `${words[n % 10]} ${words[(n * 7) % 10]} study ${n}`,
          year,
          authors: [{ family: `Author${n % 300}`, given: "A" }],
        },
        n % 3 === 0,
        0,
      );
      it.readStatus = (["unread", "reading", "read"] as const)[n % 3];
      items.push(it);
      for (let k = 0; k < 3 && n > 0; k++) {
        const cited = items[start + Math.floor(rnd() * n)];
        demoEdges.push({ citing: it.id, cited: cited.id, source: "openalex", isManual: false });
      }
    }
  }
  // ?dups: a second copy of a paper, as a careless import would leave
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("dups")) {
    const src = items.find((i) => i.citekey === "vaswani2017attention");
    if (src) items.push(make({ ...toInput(src), doi: null, arxivId: null, citekey: null }));
  }
  notes.push({
    id: nextOther++,
    kind: "paper_note",
    itemId: 1,
    projectId: null,
    highlightId: null,
    title: null,
    body: "- Key idea: self-attention replaces recurrence entirely\n- Method: multi-head attention, $O(n^2)$ in sequence length\n- Why it matters: basis of [[devlin2019bert]]\n",
    updatedAt: "2026-11-01 10:00:00",
  });
  for (const key of ["devlin2019bert", "brown2020language", "vaswani2017attention"]) {
    cache.set(key, {
      refs: REFS[key],
      source: key === "brown2020language" ? "semantic_scholar" : "openalex",
      fetchedAt: "2026-11-01 10:00:00",
    });
  }

  const candidate = (input: ItemInput, source: Candidate["source"]): Candidate => {
    const dup = items.find(
      (i) =>
        (input.doi && i.doi === input.doi) || i.title.toLowerCase() === input.title.toLowerCase(),
    );
    return {
      input,
      source,
      pdfPath: null,
      pageCount: null,
      duplicateOf: dup?.id ?? null,
      duplicateTitle: dup?.title ?? null,
      warnings: [],
    };
  };

  return {
    async platformInfo() {
      return {
        // ?windows: the Windows layout (window buttons in the top bar)
        os:
          typeof location !== "undefined" && new URLSearchParams(location.search).has("windows")
            ? "windows"
            : navigator.platform.toLowerCase().includes("mac")
              ? "macos"
              : "linux",
        dirs: { data: "/demo/data", config: "/demo/config", cache: "/demo/cache" },
        library: "/demo/data",
        credentialStore: "macOS Keychain",
      };
    },
    async listItems() {
      return structuredClone(items);
    },
    async updateItem(id, input) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) throw "Item not found";
      if (!input.title.trim()) throw "Title is required";
      const citekey = input.citekey?.trim() || items[i].citekey;
      if (items.some((x) => x.id !== id && x.citekey === citekey))
        throw "Another item already uses this citekey";
      items[i] = {
        ...items[i],
        ...input,
        citekey,
        readStatus: input.readStatus ?? "unread",
        dateModified: new Date().toISOString(),
      };
      return structuredClone(items[i]);
    },
    async deleteItem(id) {
      await this.trashItems([id]);
    },
    async deleteItems(ids) {
      await this.trashItems(ids);
    },
    async trashItems(ids) {
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      trashed = [
        ...items.filter((x) => ids.includes(x.id)).map((x) => ({ ...x, deletedAt: now })),
        ...trashed,
      ];
      items = items.filter((x) => !ids.includes(x.id));
    },
    async restoreItems(ids) {
      items = [
        ...trashed.filter((x) => ids.includes(x.id)).map((x) => ({ ...x, deletedAt: null })),
        ...items,
      ];
      trashed = trashed.filter((x) => !ids.includes(x.id));
    },
    async listTrash() {
      return structuredClone(trashed);
    },
    async emptyTrash(ids) {
      const n = ids.length ? trashed.filter((x) => ids.includes(x.id)).length : trashed.length;
      trashed = ids.length ? trashed.filter((x) => !ids.includes(x.id)) : [];
      return n;
    },
    async duplicateGroups() {
      const norm = (t: string) =>
        t
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const groups = new Map<string, Item[]>();
      for (const i of items)
        groups.set(`${norm(i.title)}|${i.year}`, [
          ...(groups.get(`${norm(i.title)}|${i.year}`) ?? []),
          i,
        ]);
      return [...groups.values()]
        .filter((g) => g.length > 1)
        .map((g) => ({
          ids: g.map((i) => i.id),
          reason: "same title" as const,
          papers: g.map((i) => ({
            id: i.id,
            citekey: i.citekey,
            title: i.title,
            authors: i.authors[0]?.family ?? "",
            year: i.year,
            readStatus: i.readStatus,
            tags: i.tags,
            hasPdf: i.hasPdf,
          })),
        }));
    },
    async mergeDuplicates(master, others) {
      const m = items.find((i) => i.id === master);
      for (const o of items.filter((i) => others.includes(i.id))) {
        if (m) m.tags = [...new Set([...m.tags, ...o.tags])];
      }
      // the kept paper takes the others' places on every spine
      for (const st of spine)
        st.items = [...new Set(st.items.map((i) => (others.includes(i) ? master : i)))];
      await this.trashItems(others);
    },
    async dismissDuplicates() {},
    async findPdfs(ids) {
      const found = items.filter((i) => ids.includes(i.id) && !i.hasPdf && (i.doi || i.arxivId));
      for (const i of found) i.hasPdf = true;
      return {
        found: found.map((i) => i.citekey),
        notFound: [],
        skipped: ids.length - found.length,
      };
    },
    async zoteroDefaultDir() {
      return "/Users/demo/Zotero";
    },
    async importZotero() {
      const it = make({
        ...blank,
        title: "Imported from Zotero",
        year: 2021,
        authors: [{ family: "Zotero", given: "Z" }],
      });
      items.unshift(it);
      return {
        added: 1,
        duplicates: 4,
        files: 1,
        highlights: 3,
        notes: 1,
        projects: 1,
        warnings: [],
      };
    },
    async importDump() {
      return {
        added: 0,
        duplicates: items.length,
        files: 0,
        highlights: 0,
        notes: 0,
        projects: 0,
        warnings: [],
      };
    },
    async citationStyles() {
      return [
        { id: "apa", name: "American Psychological Association 7th edition" },
        { id: "chicago-author-date", name: "Chicago Manual of Style 17th edition (author-date)" },
        { id: "ieee", name: "IEEE" },
        { id: "nature", name: "Nature" },
      ];
    },
    async formatCitation(ids, style, mode) {
      const sel = ids.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i);
      const who = (i: Item) =>
        i.authors.length > 2
          ? `${i.authors[0].family} et al.`
          : i.authors.map((a) => a.family).join(" & ");
      if ((style ?? settings.citationStyle) === "ieee") {
        return mode === "citation"
          ? { text: sel.map((_, n) => `[${n + 1}]`).join(", "), html: "" }
          : { text: sel.map((i, n) => `[${n + 1}] ${i.title}`).join("\n"), html: "" };
      }
      if (mode === "citation") {
        const text = `(${sel.map((i) => `${who(i)}, ${i.year ?? "n.d."}`).join("; ")})`;
        return { text, html: text };
      }
      const text = sel
        .map(
          (i) =>
            `${i.authors.map((a) => `${a.family}, ${a.given[0] ?? ""}.`).join(", ")} (${i.year}). ${i.title}. ${i.venue ?? ""}.`,
        )
        .join("\n");
      return { text, html: text };
    },
    async copyCitation(ids, style, mode) {
      const f = await this.formatCitation(ids, style, mode);
      (window as unknown as { __lastCopied?: string }).__lastCopied = f.text;
      return f;
    },
    async exportFormatted(_scope, _style, dest) {
      return dest;
    },
    async listAutoExports() {
      return structuredClone(autoExports);
    },
    async addAutoExport(format, scopeKind, scopeValue, path) {
      const a = {
        id: nextOther++,
        format,
        scopeKind,
        scopeValue,
        path,
        lastWritten: now(),
        lastError: null,
      };
      autoExports = [...autoExports.filter((x) => x.path !== path), a];
      return structuredClone(a);
    },
    async removeAutoExport(id) {
      autoExports = autoExports.filter((a) => a.id !== id);
    },
    async systemColorScheme() {
      return null;
    },
    async citingAbstract(r) {
      await new Promise((ok) => setTimeout(ok, 30));
      if (settings.offlineMode) throw new Error("Offline mode is on");
      return r.doi || r.arxivId
        ? "We present a demonstration abstract: a short summary of what this citing paper does, how it builds on the paper it cites, and what it finds."
        : null;
    },
    async cachedCiting(itemId) {
      const r = citingCache.get(itemId);
      return r ? withUnfetched(r) : null;
    },
    async findCiting(itemId, refresh) {
      const it = items.find((i) => i.id === itemId);
      if (!it) throw new Error("Paper not found");
      if (citingCache.has(itemId) && !refresh) return citingCache.get(itemId) as CitingReport;
      if (!it.doi && !it.arxivId)
        throw new Error(
          "This paper has no DOI or arXiv ID, so its citing papers can't be looked up. Add one in Info.",
        );
      const emit = (p: unknown) => {
        for (const cb of listeners.get("citing-progress") ?? []) cb(p);
      };
      const byTitle = (t: string) => items.find((i) => i.title.startsWith(t))?.id ?? null;
      const w = (
        title: string,
        year: number,
        cites: number,
        extra: Partial<CitingRow> = {},
      ): CitingRow => ({
        openalexId: null,
        doi: `10.5555/${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 24)}`,
        arxivId: null,
        title,
        authors: ["A. Author", "B. Author", "C. Author", "D. Author"],
        year,
        venue: "Demo Conference",
        citedByCount: cites,
        openAccessUrl: null,
        inLibrary: null,
        connected: [],
        ...extra,
      });
      const rows: CitingRow[] =
        itemId === 1
          ? [
              w(
                "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
                2019,
                99553,
                {
                  inLibrary: byTitle("BERT"),
                },
              ),
              w(
                "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
                2020,
                68095,
                {
                  connected: [byTitle("BERT"), byTitle("Deep Residual")].filter(
                    (x): x is number => x !== null,
                  ),
                  openAccessUrl: "https://arxiv.org/pdf/2010.11929",
                },
              ),
              w("Language Models are Few-Shot Learners", 2020, 62121, {
                inLibrary: byTitle("Language Models"),
              }),
              w(
                "Learning Transferable Visual Models From Natural Language Supervision",
                2021,
                61452,
                {
                  connected: [byTitle("BERT")].filter((x): x is number => x !== null),
                },
              ),
              w(
                "Swin Transformer: Hierarchical Vision Transformer using Shifted Windows",
                2021,
                48593,
              ),
              w("A Survey of Efficient Transformers", 2024, 210, {
                arxivId: "2409.00001",
                doi: null,
              }),
              w("An Untitled Workshop Note", 2023, 2, { doi: null }),
            ]
          : [w("A Paper That Cites This One", 2022, 12)];
      for (let n = 1; n <= 3; n++) {
        await new Promise((r) => setTimeout(r, 40));
        emit({ itemId, done: Math.round((rows.length * n) / 3), total: 1234 });
      }
      const report: CitingReport = {
        itemId,
        source: "openalex",
        total: itemId === 1 ? 148749 : rows.length,
        fetchedAt: "2026-11-19 09:00:00",
        stale: false,
        connectedAvailable: true,
        rows,
        unfetchedInLibrary: [],
      };
      citingCache.set(itemId, report);
      return withUnfetched(report);
    },
    async openAttachment() {},
    async searchOnline(query, sources) {
      if (settings.offlineMode) throw new Error("Offline mode is on, so online search is off.");
      await new Promise((ok) => setTimeout(ok, 60));
      const hit = (h: Partial<DiscoverHit> & { title: string }): DiscoverHit => ({
        authors: ["A. Author", "B. Author"],
        year: 2021,
        venue: "Demo Journal",
        doi: null,
        arxivId: null,
        pmid: null,
        openalexId: null,
        citedByCount: 10,
        openAccessUrl: null,
        abstractText: null,
        sources: ["openalex"],
        score: 0.05,
        inLibrary: null,
        ...h,
      });
      const all = [
        hit({
          title: `${query} — a review of methods and applications`,
          doi: "10.5555/review",
          sources: ["openalex", "semantic_scholar", "crossref"],
          citedByCount: 4200,
          year: 2020,
          abstractText: "We survey the field and its applications.",
        }),
        hit({
          title: "Attention Is All You Need",
          arxivId: "1706.03762",
          sources: ["arxiv", "openalex"],
          citedByCount: 150000,
          year: 2017,
          inLibrary: 1,
          openAccessUrl: "https://arxiv.org/pdf/1706.03762",
        }),
        hit({
          title: `A clinical study of ${query}`,
          pmid: "31234567",
          sources: ["pubmed"],
          venue: "The Lancet",
          citedByCount: 40,
          year: 2024,
        }),
        hit({
          title: `${query} at scale`,
          arxivId: "2410.00001",
          sources: ["arxiv"],
          venue: "arXiv",
          citedByCount: null,
          year: 2025,
          openAccessUrl: "https://arxiv.org/pdf/2410.00001",
        }),
        hit({
          title: "An unidentifiable workshop abstract",
          sources: ["crossref"],
          citedByCount: 0,
          year: 2019,
        }),
      ].filter((h) => !sources.length || h.sources.some((s) => sources.includes(s)));
      // a paper added since the search is marked
      for (const h of all)
        h.inLibrary ??=
          items.find((i) => (h.doi && i.doi === h.doi) || (h.arxivId && i.arxivId === h.arxivId))
            ?.id ?? null;
      return {
        hits: all,
        errors:
          !sources.length || sources.includes("semantic_scholar")
            ? [
                {
                  source: "semantic_scholar" as const,
                  message: "Rate limited by the service; try again later",
                },
              ]
            : [],
        hasOpenalexKey: false,
      };
    },
    async relationTypes() {
      return relTypes.map((t) => ({
        ...t,
        count: relations.filter((r) => r.typeId === t.id && alive(r)).length,
      }));
    },
    async createRelationType(label, inverseLabel, color) {
      if (!label.trim()) throw new Error("The type needs a name");
      const id = nextOther++;
      const key = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");
      relTypes.push({
        id,
        key,
        label: label.trim(),
        inverseLabel: inverseLabel?.trim() || null,
        color,
        builtin: false,
        count: 0,
      });
      return id;
    },
    async updateRelationType(id, label, inverseLabel, color) {
      relTypes = relTypes.map((t) =>
        t.id === id
          ? { ...t, label: label.trim(), inverseLabel: inverseLabel?.trim() || null, color }
          : t,
      );
    },
    async deleteRelationType(id) {
      if (relTypes.find((t) => t.id === id)?.builtin)
        throw new Error("Built-in types can be renamed but not deleted");
      relTypes = relTypes.filter((t) => t.id !== id);
      relations = relations.filter((r) => r.typeId !== id);
    },
    async itemRelations(itemId) {
      const hl = await this.listHighlights(itemId);
      const views: RelationView[] = [];
      for (const r of relations.filter(
        (x) => alive(x) && (x.fromItemId === itemId || x.toItemId === itemId),
      )) {
        const t = relTypes.find((x) => x.id === r.typeId);
        if (!t) continue;
        const outgoing = r.fromItemId === itemId;
        const other = outgoing ? r.toItemId : r.fromItemId;
        const ev =
          r.evidenceHighlightId === null
            ? undefined
            : [...hl, ...(await this.listHighlights(other))].find(
                (h) => h.id === r.evidenceHighlightId,
              );
        views.push({
          ...r,
          outgoing,
          otherItemId: other,
          label: outgoing ? t.label : (t.inverseLabel ?? t.label),
          color: t.color,
          evidenceText: ev?.text ?? null,
          evidencePage: ev?.page ?? null,
          evidenceItemId: ev?.itemId ?? null,
        });
      }
      return views;
    },
    async allRelations() {
      return structuredClone(relations.filter(alive));
    },
    async addRelation(from, to, typeId, note, evidence) {
      if (from === to) throw new Error("A paper can't be connected to itself");
      const same = relations.find(
        (r) => r.fromItemId === from && r.toItemId === to && r.typeId === typeId,
      );
      if (same) {
        same.note = note?.trim() || null;
        same.evidenceHighlightId = evidence;
        return structuredClone(same);
      }
      const r: Relation = {
        id: nextOther++,
        fromItemId: from,
        toItemId: to,
        typeId,
        note: note?.trim() || null,
        evidenceHighlightId: evidence,
        createdAt: now(),
      };
      relations.push(r);
      return structuredClone(r);
    },
    async updateRelation(id, typeId, swap, note, evidence) {
      const r = relations.find((x) => x.id === id);
      if (!r) throw new Error("Connection not found");
      if (swap) [r.fromItemId, r.toItemId] = [r.toItemId, r.fromItemId];
      r.typeId = typeId;
      r.note = note?.trim() || null;
      r.evidenceHighlightId = evidence;
      return structuredClone(r);
    },
    async removeRelation(id) {
      relations = relations.filter((r) => r.id !== id);
    },
    async agentInfo() {
      // what Settings ▸ AI Assistants has connected (?noclaude: nothing)
      const agents = noClaude
        ? []
        : [
            { id: "claude", name: "Claude Code", path: "/Users/me/.local/bin/claude" },
            { id: "codex", name: "Codex", path: "/opt/homebrew/bin/codex" },
          ];
      const active = agents.find((a) => a.id === agentConfig.agent)?.id ?? agents[0]?.id ?? null;
      return { config: { ...agentConfig }, agents, active };
    },
    async agentSaveConfig(config) {
      agentConfig = { ...config };
    },
    async agentChats() {
      return [...agentChats.values()]
        .map(({ session: _s, messages: _m, ...summary }) => summary)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async agentChatGet(id) {
      const c = agentChats.get(id);
      if (!c) throw new Error("Chat not found");
      return { ...c };
    },
    async agentChatSave(id, messages) {
      const c = agentChats.get(id);
      if (!c) throw new Error("Chat not found");
      c.messages = messages;
      c.updatedAt = new Date(Date.now() + agentClock++).toISOString();
    },
    async agentChatDelete(id) {
      agentChats.delete(id);
    },
    async agentSend(chat, text, _context, about, onEvent) {
      if (!agentChats.has(chat)) {
        const now = new Date(Date.now() + agentClock++).toISOString();
        agentChats.set(chat, {
          id: chat,
          agent: agentConfig.agent ?? "claude",
          title: text.split("\n")[0].slice(0, 80),
          itemId: about.itemId,
          noteId: about.noteId,
          createdAt: now,
          updatedAt: now,
          session: null,
          messages: "[]",
        });
      }
      if (noClaude) throw new Error("No agent is connected.");
      const by = agentConfig.agent === "codex" ? "Codex" : "Claude Code";
      const stop = { stopped: false };
      agentRuns.set(chat, stop);
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const emit = async (e: AgentEvent, ms = 15) => {
        if (stop.stopped) return;
        onEvent(e);
        await wait(ms);
      };
      const say = async (s: string) => {
        for (const word of s.split(/(?<= )/)) await emit({ type: "text", delta: word });
      };
      const live = items.filter((i) => !i.deletedAt);
      const first = live[0];
      await emit({ type: "session", id: "fake-session" });
      await emit(
        { type: "tool", id: "t1", name: "search_library", input: { query: text.slice(0, 40) } },
        200,
      );
      await emit({
        type: "toolDone",
        id: "t1",
        ok: true,
        summary: `${Math.min(3, live.length)} of ${live.length} results`,
        changed: false,
      });
      if (first) {
        await emit(
          { type: "tool", id: "t2", name: "get_item", input: { key: first.citekey } },
          150,
        );
        await emit({ type: "toolDone", id: "t2", ok: true, summary: first.title, changed: false });
      }
      if (/note/i.test(text)) {
        if (!agentConfig.cliAllowWrites) {
          await say(
            "I can only read your library in this chat. Here is the note; turn on **Can edit** and ask again to save it:\n\n## Key idea\n- One point",
          );
        } else {
          const input = { title: "Reading summary", body: "## Key idea\n- One point" };
          await emit({ type: "tool", id: "t3", name: "create_note", input }, 150);
          const note = await this.createNote({ kind: "free", title: input.title });
          await emit({
            type: "toolDone",
            id: "t3",
            ok: true,
            summary: `Created note ${note.id}`,
            changed: true,
          });
          await say("I created the note **Reading summary**.");
        }
      } else {
        await say(
          first
            ? `${by} here. The closest match is @${first.citekey}: *${first.title}*. Its main claim fits $E = mc^2$-style scaling.`
            : "Your library is empty.",
        );
      }
      agentRuns.delete(chat);
      onEvent({ type: "done", stop: stop.stopped ? "cancelled" : "done" });
    },
    async agentStop(chat) {
      const r = agentRuns.get(chat);
      if (r) r.stopped = true;
    },
    async agentForget(chat) {
      agentRuns.delete(chat);
    },
    async assistantsStatus() {
      const cmd = "/Applications/Paperlines.app/Contents/MacOS/paperlines";
      return {
        command: cmd,
        assistants: assistants.map((a) => ({
          ...a,
          manual:
            a.id === "grok"
              ? `grok mcp add paperlines -- "${cmd}" mcp`
              : a.id === "codex"
                ? `[mcp_servers.paperlines]\ncommand = "${cmd}"\nargs = ["mcp"]`
                : `claude mcp add --scope user paperlines -- "${cmd}" mcp`,
        })),
        tools: [
          {
            name: "search_library",
            description: "Search the user's reference library.",
            readOnly: true,
          },
          {
            name: "get_paper_note",
            description: "The user's paper note as Markdown.",
            readOnly: true,
          },
          { name: "add_bullet", description: "Append a bullet to a paper note.", readOnly: false },
        ],
        skills: [
          {
            name: "paperlines",
            description:
              "Work with the user's own research library in Paperlines. Use when the user asks about papers they have or read.",
            rules: ["The library is the source of truth for “my papers”", "Ask before writing"],
            abilities: [
              ["What do I have on X?", "Run search_library with the topic, then read the notes."],
              ["Related-work paragraph", "Find the papers and write prose citing them by citekey."],
            ],
          },
          {
            name: "paperlines-notes",
            description: "Write notes in the user's Paperlines library.",
            rules: ["Show first, then write", "Never overwrite"],
            abilities: [
              ["Write a note on this paper", "Draft Key idea / Method / Why it matters."],
            ],
          },
          {
            name: "paperlines-scout",
            description: "Find papers the user should read next.",
            rules: ["Never import"],
            abilities: [
              ["What should I read next for <project>?", "suggest_papers, then post_suggestions."],
            ],
          },
        ],
      };
    },
    async assistantConnect(id, on) {
      const a = assistants.find((x) => x.id === id);
      if (!a) throw new Error(`Unknown assistant: ${id}`);
      a.connected = on;
      a.stale = false;
    },
    async assistantSkill(id, on) {
      const a = assistants.find((x) => x.id === id);
      if (!a || a.skill === null) throw new Error("This assistant has no skills folder");
      a.skill = on;
    },
    async suggestionsList(projectId) {
      for (const s of suggestions) if (s.status === "new" && imported(s)) s.status = "added";
      return structuredClone(
        suggestions.filter((s) => s.projectId === projectId && s.status === "new"),
      );
    },
    async suggestionSetStatus(id, status) {
      const s = suggestions.find((x) => x.id === id);
      if (!s) throw new Error("Suggestion not found");
      s.status = status;
    },
    async suggestionsCounts() {
      const by = new Map<number | null, number>();
      for (const s of suggestions)
        if (s.status === "new" && !imported(s)) by.set(s.projectId, (by.get(s.projectId) ?? 0) + 1);
      return [...by].map(([projectId, count]) => ({ projectId, count }));
    },
    async exportLibrary(parent) {
      return {
        path: `${parent}/Paperlines library 2026-11-19`,
        papers: items.length,
        files: items.filter((i) => i.hasPdf).length,
        missing: [],
      };
    },
    async assistantSaveSkill(dir) {
      return `${dir}/paperlines/SKILL.md`;
    },
    async spineGet(projectId) {
      return spine
        .filter((s) => s.projectId === projectId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          position: s.position,
          label: s.label,
          items: s.items.filter((i) => items.some((x) => x.id === i)),
        }));
    },
    async spineAddStep(projectId, label) {
      const id = nextOther++;
      const last = Math.max(
        0,
        ...spine.filter((s) => s.projectId === projectId).map((s) => s.position),
      );
      spine.push({ id, projectId, position: last + 1, label: label?.trim() || null, items: [] });
      return id;
    },
    async spineAdd(projectId, itemId, stepId) {
      if (!items.some((i) => i.id === itemId)) throw new Error("Paper not found");
      if (stepId !== null && spineStep(stepId).projectId !== projectId)
        throw new Error("That step belongs to another project");
      const step = stepId ?? (await this.spineAddStep(projectId, null));
      await this.addToProject(projectId, [itemId]);
      spineForget(projectId, [itemId], step);
      spineStep(step).items.push(itemId);
      return step;
    },
    async spineRemove(projectId, itemId) {
      spineForget(projectId, [itemId]);
    },
    async spineRenameStep(stepId, label) {
      spineStep(stepId).label = label?.trim() || null;
    },
    async spineMoveStep(stepId, delta) {
      const s = spineStep(stepId);
      const mine = spine
        .filter((x) => x.projectId === s.projectId)
        .sort((a, b) => a.position - b.position);
      const at = mine.indexOf(s);
      const other = mine[at + Math.sign(delta)];
      if (!other) return;
      [s.position, other.position] = [other.position, s.position];
    },
    async spineReorder(stepId, itemIds) {
      const s = spineStep(stepId);
      const order = itemIds.filter((id, i) => s.items.includes(id) && itemIds.indexOf(id) === i);
      s.items = [...order, ...s.items.filter((id) => !order.includes(id))];
    },
    async spineDeleteStep(stepId) {
      spineStep(stepId);
      spine = spine.filter((s) => s.id !== stepId);
    },
    async reidentifyPdf(itemId) {
      const it = items.find((i) => i.id === itemId);
      if (!it?.hasPdf) throw new Error("This paper has no PDF to read details from");
      await new Promise((ok) => setTimeout(ok, 30));
      return {
        input: {
          ...toInput(it),
          title:
            "Three-dimensional multi-photon direct laser writing with variable repetition rate",
          authors: [
            { family: "Fischer", given: "Joachim" },
            { family: "Wegener", given: "Martin" },
          ],
          year: 2013,
          venue: "Optics Express",
          doi: "10.1364/oe.21.026244",
          volume: "21",
          issue: "22",
          pages: "26244",
          citekey: null,
        },
        warnings: [
          "The identifier found in the PDF leads to “Ultrafast laser nanostructuring of photopolymers: A decade of advances”, which doesn't match this PDF, so it was ignored.",
        ],
        citekey: "fischer2013threedimensional",
      };
    },
    async revealAttachment(itemId) {
      (window as unknown as { __revealed?: number }).__revealed = itemId;
    },
    async libraryLocation() {
      return { current: "/demo/data", isDefault: true, default: "/demo/data" };
    },
    async setLibraryLocation() {},
    async pickFile() {
      return "/demo/library-dump.json";
    },
    async setReadStatus(ids, status) {
      for (const i of items) if (ids.includes(i.id)) i.readStatus = status;
    },
    async search(query) {
      const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      const warnings: string[] = [];
      const ok = items.filter((i) =>
        parse(query).every((term) => {
          const v = fold(term.value);
          let hit: boolean;
          switch (term.key) {
            case null:
              hit = fold(
                [
                  i.title,
                  i.citekey,
                  i.venue,
                  i.abstract,
                  ...i.authors.map((a) => `${a.given} ${a.family}`),
                ].join(" "),
              ).includes(v);
              break;
            case "tag":
              hit = i.tags.some(
                (t) => t.toLowerCase() === v || t.toLowerCase().startsWith(`${v}/`),
              );
              break;
            case "project":
              hit = projects.some((p) => p.name.toLowerCase() === v && i.projectIds.includes(p.id));
              break;
            case "author":
              hit = i.authors.some((a) => fold(`${a.given} ${a.family}`).includes(v));
              break;
            case "year": {
              const r = parseRange(term.value);
              if (!r) warnings.push(`year:${term.value} is not a year or range`);
              hit = r ? inRange(r, i.year) : true;
              break;
            }
            case "cites":
            case "cited-by": {
              const other = items.find((x) => x.citekey.toLowerCase() === v);
              hit =
                !!other &&
                edges().some((e) =>
                  term.key === "cites"
                    ? e.citing === i.id && e.cited === other.id
                    : e.cited === i.id && e.citing === other.id,
                );
              break;
            }
            case "is":
            case "has":
              hit =
                v === "pdf"
                  ? i.hasPdf
                  : v === "untagged"
                    ? i.tags.length === 0
                    : i.readStatus === v;
              break;
            default:
              hit = true;
          }
          return term.neg ? !hit : hit;
        }),
      );
      return { ids: ok.map((i) => i.id), warnings };
    },
    async listTags() {
      return [...tags.entries()]
        .map(([path, color], n) => ({
          id: n + 1,
          path,
          color,
          count: items.filter((i) => i.tags.includes(path)).length,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
    },
    async tagItems(ids, paths) {
      for (const p of paths) {
        const path = findTag(p) ?? p.trim();
        if (!tags.has(path)) tags.set(path, null);
        for (const i of items)
          if (ids.includes(i.id) && !i.tags.includes(path)) i.tags = [...i.tags, path].sort();
      }
    },
    async untagItems(ids, paths) {
      const drop = paths.map((p) => findTag(p)).filter(Boolean);
      for (const i of items)
        if (ids.includes(i.id)) i.tags = i.tags.filter((t) => !drop.includes(t));
    },
    async renameTag(from, to) {
      const f = findTag(from);
      if (!f) throw "Tag not found";
      const next = new Map<string, TagColor | null>();
      for (const [k, c] of tags) {
        const moved = k === f || k.startsWith(`${f}/`) ? to.trim() + k.slice(f.length) : k;
        next.set(moved, next.get(moved) ?? c);
      }
      tags = next;
      for (const i of items) {
        i.tags = [
          ...new Set(
            i.tags.map((t) =>
              t === f || t.startsWith(`${f}/`) ? to.trim() + t.slice(f.length) : t,
            ),
          ),
        ].sort();
      }
    },
    async deleteTag(path) {
      const f = findTag(path);
      if (!f) return;
      for (const k of [...tags.keys()]) if (k === f || k.startsWith(`${f}/`)) tags.delete(k);
      for (const i of items) i.tags = i.tags.filter((t) => tags.has(t));
    },
    async setTagColor(path, color) {
      const f = findTag(path);
      if (f) tags.set(f, color);
    },
    async listProjects() {
      countProjects();
      return structuredClone(projects);
    },
    async createProject(name, description) {
      if (projects.some((p) => p.name.toLowerCase() === name.trim().toLowerCase()))
        throw "A project with this name already exists";
      const id = nextOther++;
      // the least used color, like the real backend
      const order: TagColor[] = ["blue", "orange", "teal", "purple", "red", "green", "yellow"];
      const color = [...order].sort(
        (a, b) =>
          projects.filter((p) => p.color === a).length -
            projects.filter((p) => p.color === b).length || order.indexOf(a) - order.indexOf(b),
      )[0];
      projects = [...projects, { id, name: name.trim(), description, count: 0, color }];
      return id;
    },
    async updateProject(id, name, description) {
      const old = projects.find((p) => p.id === id)?.name;
      for (const a of autoExports)
        if (a.scopeKind === "project" && a.scopeValue === old) a.scopeValue = name.trim();
      projects = projects.map((p) => (p.id === id ? { ...p, name: name.trim(), description } : p));
    },
    async setProjectColor(id, color) {
      projects = projects.map((p) => (p.id === id ? { ...p, color } : p));
    },
    async deleteProject(id) {
      projects = projects.filter((p) => p.id !== id);
      spine = spine.filter((s) => s.projectId !== id);
      for (const i of items) i.projectIds = i.projectIds.filter((p) => p !== id);
    },
    async addToProject(projectId, ids) {
      for (const i of items)
        if (ids.includes(i.id) && !i.projectIds.includes(projectId))
          i.projectIds = [...i.projectIds, projectId];
    },
    async removeFromProject(projectId, ids) {
      for (const i of items)
        if (ids.includes(i.id)) i.projectIds = i.projectIds.filter((p) => p !== projectId);
      spineForget(projectId, ids);
    },
    async listSavedSearches() {
      return structuredClone(saved);
    },
    async createSavedSearch(name, query) {
      const id = nextOther++;
      saved = [...saved, { id, name, query }];
      return id;
    },
    async deleteSavedSearch(id) {
      saved = saved.filter((s) => s.id !== id);
    },
    async readPdf(itemId) {
      const item = items.find((i) => i.id === itemId);
      if (!item?.hasPdf) throw "This item has no PDF";
      return samplePdf(item.title, [LOREM, LOREM.slice().reverse(), LOREM]);
    },
    async attachPdf(itemId) {
      const item = items.find((i) => i.id === itemId);
      if (!item) throw "Item not found";
      item.hasPdf = true;
      return structuredClone(item);
    },
    async listHighlights(itemId) {
      return structuredClone(highlights.filter((h) => h.itemId === itemId)).sort(
        (a, b) => a.page - b.page || (a.rects[0]?.y ?? 2) - (b.rects[0]?.y ?? 2),
      );
    },
    async createHighlight(h) {
      const created: Highlight = {
        ...h,
        id: nextOther++,
        attachmentId: h.itemId,
        createdAt: now(),
      };
      highlights.push(created);
      return structuredClone(created);
    },
    async placeHighlight(id, page, rects) {
      const h = highlights.find((x) => x.id === id);
      if (!h) throw "Highlight not found";
      h.page = page;
      h.rects = rects;
      return structuredClone(h);
    },
    async updateHighlight(id, patch) {
      const h = highlights.find((x) => x.id === id);
      if (!h) throw "Highlight not found";
      if (patch.color) h.color = patch.color;
      if (patch.comment !== undefined) h.comment = patch.comment.trim() || null;
      return structuredClone(h);
    },
    async deleteHighlight(id) {
      highlights = highlights.filter((h) => h.id !== id);
    },
    async exportAnnotatedPdf(itemId) {
      return highlights.filter((h) => h.itemId === itemId).length;
    },
    async getPaperNote(itemId) {
      return structuredClone(paperNote(itemId));
    },
    async getNote(id) {
      const n = notes.find((x) => x.id === id);
      if (!n) throw "Note not found";
      return structuredClone(n);
    },
    async saveNote(id, body) {
      const n = notes.find((x) => x.id === id);
      if (!n) throw "Note not found";
      n.body = body;
      n.updatedAt = now();
      return structuredClone(n);
    },
    async createNote(nn) {
      const n: Note = {
        id: nextOther++,
        kind: nn.kind,
        itemId: nn.itemId ?? null,
        projectId: nn.projectId ?? null,
        highlightId: nn.highlightId ?? null,
        title: nn.title?.trim() || "Untitled note",
        body: nn.body ?? "",
        updatedAt: now(),
      };
      notes.push(n);
      return structuredClone(n);
    },
    async renameNote(id, title) {
      const n = notes.find((x) => x.id === id);
      if (!n) throw "Note not found";
      n.title = title.trim();
      return structuredClone(n);
    },
    async deleteNote(id) {
      notes = notes.filter((n) => n.id !== id);
    },
    async listNotes(itemId) {
      return notes
        .filter((n) => n.kind !== "paper_note" && (itemId === undefined || n.itemId === itemId))
        .map((n) => noteRef(n));
    },
    async itemBacklinks(itemId) {
      const item = items.find((i) => i.id === itemId);
      if (!item) return [];
      const key = item.citekey.toLowerCase();
      return notes
        .filter(
          (n) => !(n.kind === "paper_note" && n.itemId === itemId) && links(n.body).includes(key),
        )
        .map((n) => noteRef(n, item.citekey));
    },
    async noteBacklinks(noteId) {
      const title = notes.find((n) => n.id === noteId)?.title?.toLowerCase();
      if (!title) return [];
      return notes
        .filter((n) => n.id !== noteId && links(n.body).includes(title))
        .map((n) => noteRef(n, title));
    },
    async appendToPaperNote(itemId, bullet) {
      const n = paperNote(itemId);
      n.body = `${n.body.trimEnd()}${n.body.trim() ? "\n" : ""}- ${bullet.trim()}\n`;
      n.updatedAt = now();
      return structuredClone(n);
    },
    async graphEdges() {
      return edges().map((e) => [e.citing, e.cited] as [number, number]);
    },
    async getCitations(itemId) {
      const all = edges();
      const link = (
        id: number,
        e: { source: CitationSource; isManual: boolean },
      ): CitationLink => ({ itemId: id, source: e.source, isManual: e.isManual });
      const item = items.find((i) => i.id === itemId);
      const c = item ? cache.get(item.citekey) : undefined;
      return {
        cites: all.filter((e) => e.citing === itemId).map((e) => link(e.cited, e)),
        citedBy: all.filter((e) => e.cited === itemId).map((e) => link(e.citing, e)),
        hidden: [...manual]
          .filter(([k, v]) => !v && k.split(">").map(Number).includes(itemId))
          .map(([k]) => {
            const [citingItemId, citedItemId] = k.split(">").map(Number);
            return { citingItemId, citedItemId };
          }),
        status: c
          ? {
              source: c.source,
              fetchedAt: c.fetchedAt,
              total: c.refs.length,
              outside: c.refs.filter((r) => {
                const m = matchRef(r);
                return !m || m.id === itemId;
              }).length,
            }
          : null,
      };
    },
    async fetchReferences(itemIds, force) {
      const sum = { fetched: 0, skipped: 0, failed: [] as string[], linked: 0 };
      const emit = (ev: string, p: unknown) => {
        for (const cb of listeners.get(ev) ?? []) cb(p);
      };
      for (const [n, id] of itemIds.entries()) {
        const item = items.find((i) => i.id === id);
        if (!item || (cache.has(item.citekey) && !force) || (!item.doi && !item.arxivId))
          sum.skipped++;
        else if (settings.offlineMode)
          sum.failed.push(`${item.title}: Offline mode is on and no GROBID server is set`);
        else {
          cache.set(item.citekey, {
            refs: REFS[item.citekey] ?? outside(8),
            source: "openalex",
            fetchedAt: now(),
          });
          sum.fetched++;
        }
        emit("references-progress", { done: n + 1, total: itemIds.length });
      }
      emit("references-updated", sum);
      return sum;
    },
    async addCitation(citing, cited) {
      if (citing === cited) throw "A paper cannot cite itself";
      manual.set(`${citing}>${cited}`, true);
    },
    async removeCitation(citing, cited) {
      manual.set(`${citing}>${cited}`, false);
    },
    async resetCitation(citing, cited) {
      manual.delete(`${citing}>${cited}`);
    },
    async secretStatus() {
      return (["semantic_scholar", "openalex"] as const).map((name) => ({
        name,
        location: secrets.has(name) ? ("os" as const) : null,
      }));
    },
    async setSecret(name, value) {
      secrets.set(name, value);
      return "os";
    },
    async deleteSecret(name) {
      secrets.delete(name);
    },
    async exportItems(_format, _scope, dest) {
      return dest;
    },
    async exportNotes() {
      return items.length + notes.filter((n) => n.kind !== "paper_note").length;
    },
    async listBackups() {
      return [
        {
          name: "library-2026-11-18.sqlite",
          path: "/demo/data/backups/library-2026-11-18.sqlite",
          size: 245760,
          kind: "daily" as const,
        },
        {
          name: "library-2026-11-17.sqlite",
          path: "/demo/data/backups/library-2026-11-17.sqlite",
          size: 241664,
          kind: "daily" as const,
        },
        {
          name: "pre-migration-v2-1795010183.sqlite",
          path: "/demo/data/backups/pre-migration-v2-1795010183.sqlite",
          size: 200704,
          kind: "pre-migration" as const,
        },
      ];
    },
    async backupNow() {
      return "/demo/data/backups/manual-2026-11-18-120000.sqlite";
    },
    async restoreBackup() {
      return "/demo/data/backups/pre-restore-2026-11-18-120000.sqlite";
    },
    async runDoctor(fix) {
      return {
        items: items.length,
        pdfs: items.filter((i) => i.hasPdf).length,
        edges: edges().length,
        issues: [],
        fixed: fix ? [] : [],
      };
    },
    async installCli() {
      return {
        path: "/Users/demo/.local/bin/paperlines",
        method: "symlink" as const,
        inPath: true,
      };
    },
    async takePendingOpens() {
      return [];
    },
    async pickSavePath(name) {
      return `/demo/${name}`;
    },
    async checkForUpdate() {
      if (settings.offlineMode) throw new Error("Offline mode is on, so updates aren't checked.");
      // ?update pretends a newer version is out
      if (typeof location === "undefined" || !new URLSearchParams(location.search).has("update"))
        return null;
      return {
        version: branding.version.replace(
          /^(\d+)\.(\d+)\..*$/,
          (_, a, b) => `${a}.${Number(b) + 1}.0`,
        ),
        currentVersion: branding.version,
        date: "2026-12-01T10:00:00Z",
        notes:
          "### Library\n- **Faster search** across big libraries.\n- Drag papers between projects.\n\n### Fixes\n- The graph keeps its zoom after a filter changes.",
        contributors: [
          { login: "ada-l", name: "Ada Lovelace" },
          { login: null, name: "Grace Hopper" },
        ],
        canInstall: true,
      };
    },
    async installUpdate() {
      const emit = (p: { done: number; total: number | null }) => {
        for (const cb of listeners.get("update-progress") ?? []) cb(p);
      };
      for (let done = 0; done <= 4; done++) {
        emit({ done: done * 1_000_000, total: 4_000_000 });
        await new Promise((r) => setTimeout(r, 150));
      }
      // the real app restarts here
    },
    async windowControl(action) {
      // the browser has no window to move: record the click for the tests
      (window as unknown as { __windowControl?: string }).__windowControl = action;
    },
    async openExternal(url) {
      window.open(url, "_blank", "noopener");
    },
    async getSettings() {
      return { ...settings };
    },
    async updateSettings(patch) {
      settings = { ...settings, ...patch };
      if (patch.highlightColors) {
        // like the real backend: the five standard colours first, then added ones once each
        const base = ["yellow", "red", "green", "blue", "purple"];
        const given = patch.highlightColors;
        const first = base.map(
          (c) =>
            given.find((g) => g.color === c) ??
            DEFAULT_HL.find((d) => d.color === c) ?? { color: c, label: c },
        );
        const extra = given.filter(
          (g, i) => !base.includes(g.color) && given.findIndex((x) => x.color === g.color) === i,
        );
        settings.highlightColors = [...first, ...extra] as typeof settings.highlightColors;
      }
      return { ...settings };
    },
    async importPreviewPaths(paths) {
      return {
        candidates: paths.map((p) => ({
          ...candidate(
            {
              ...blank,
              title:
                p
                  .split(/[\\/]/)
                  .pop()
                  ?.replace(/\.(pdf|epub)$/i, "") ?? p,
            },
            "pdf",
          ),
          pdfPath: p,
          fileKind: /\.epub$/i.test(p) ? "epub" : "pdf",
        })),
        errors: [],
      };
    },
    async importPreviewText(text) {
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      return {
        candidates: lines.map((l) =>
          /^pmid:/i.test(l)
            ? candidate(
                {
                  ...blank,
                  title: `Looked up ${l}`,
                  url: `https://pubmed.ncbi.nlm.nih.gov/${l.slice(5)}/`,
                },
                "doi",
              )
            : /^\d{4}\.\d{4,5}(v\d+)?$/.test(l)
              ? candidate({ ...blank, title: `Looked up ${l}`, arxivId: l }, "arxiv")
              : candidate({ ...blank, title: `Looked up ${l}`, doi: l }, "doi"),
        ),
        errors: [],
      };
    },
    async importCommit(decisions) {
      const r = {
        added: [] as number[],
        merged: [] as number[],
        skipped: 0,
        errors: [] as string[],
      };
      for (const d of decisions) {
        if (d.action === "skip") r.skipped++;
        else if (d.action === "merge" && d.candidate.duplicateOf) {
          // like the real backend: the file goes to the existing paper
          const target = items.find((i) => i.id === d.candidate.duplicateOf);
          if (target && d.candidate.pdfPath) {
            if (d.candidate.fileKind === "epub") target.hasEpub = true;
            else target.hasPdf = true;
          }
          r.merged.push(d.candidate.duplicateOf);
        } else {
          const it = make(d.candidate.input, d.candidate.pdfPath !== null);
          items.unshift(it);
          r.added.push(it.id);
        }
      }
      const needs = r.added
        .map((id) => items.find((i) => i.id === id))
        .filter((i): i is Item => !!i && !i.hasPdf && !!(i.doi || i.arxivId));
      if (settings.autoFindPdfs && !settings.offlineMode && needs.length) {
        const emit = (ev: string, p: unknown) => {
          for (const cb of listeners.get(ev) ?? []) cb(p);
        };
        emit("pdfs-searching", needs.length);
        setTimeout(() => {
          // demo: identifiers mentioning "nofree" have no open-access copy
          const found = needs.filter((i) => !`${i.doi}${i.arxivId}`.includes("nofree"));
          for (const i of found) i.hasPdf = true;
          emit("pdfs-found", {
            found: found.map((i) => i.citekey),
            notFound: needs.filter((i) => !found.includes(i)).map((i) => i.citekey),
            skipped: 0,
          });
        }, 120);
      }
      return r;
    },
    async pickPaths(kind) {
      // tests set window.__pickFolder / __pickFiles to simulate the file dialog
      const w = window as unknown as { __pickFolder?: string; __pickFiles?: string[] };
      if (kind === "folder") return w.__pickFolder ? [w.__pickFolder] : null;
      return w.__pickFiles?.length ? w.__pickFiles : null;
    },
    async confirm(message) {
      return window.confirm(message);
    },
    on<K extends keyof BackendEvents>(event: K, cb: (p: BackendEvents[K]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(cb as Listener);
      listeners.set(event, set);
      return () => set.delete(cb as Listener);
    },
  };
}
