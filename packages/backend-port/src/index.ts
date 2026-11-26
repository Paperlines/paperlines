// Typed contract between the UI and any backend. Mirrors the Rust serde types (camelCase).
export type Os = "macos" | "linux" | "windows";
export type ReadStatus = "unread" | "reading" | "read";

export interface AppDirs {
  data: string;
  config: string;
  cache: string;
}

export interface PlatformInfo {
  os: Os;
  dirs: AppDirs;
  library: string;
  /** e.g. "macOS Keychain" or "Secret Service". */
  credentialStore: string;
  /** Installed by a package manager (Nix, deb, rpm), which updates it: no automatic update checks. */
  packaged: boolean;
}

export interface Author {
  family: string;
  given: string;
}

/** Bibliographic details used by citation styles and exports. */
export interface Biblio {
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  place: string | null;
  isbn: string | null;
  issn: string | null;
  edition: string | null;
  language: string | null;
  series: string | null;
  number: string | null;
  editors: Author[];
}

export interface ItemInput extends Biblio {
  itemType: string;
  citekey: string | null;
  title: string;
  authors: Author[];
  year: number | null;
  pubDate: string | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  url: string | null;
  abstract: string | null;
  readStatus: ReadStatus | null;
  rating: number | null;
}

export interface Item extends Omit<ItemInput, "citekey" | "readStatus"> {
  id: number;
  citekey: string;
  readStatus: ReadStatus;
  dateAdded: string;
  dateModified: string;
  hasPdf: boolean;
  hasEpub: boolean;
  tags: string[];
  projectIds: number[];
  /** Set while the paper is in the Trash. */
  deletedAt: string | null;
}

export type TagColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "gray";
export const TAG_COLORS: TagColor[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "gray",
];

export interface TagInfo {
  id: number;
  path: string;
  color: TagColor | null;
  count: number;
}

export interface ProjectInfo {
  id: number;
  name: string;
  description: string | null;
  count: number;
  /** Fills the project's papers in the graph; shown in the sidebar. */
  color: TagColor;
}

export interface SavedSearch {
  id: number;
  name: string;
  query: string;
}

export interface SearchResult {
  ids: number[];
  warnings: string[];
}

export interface Candidate {
  input: ItemInput;
  source: "pdf" | "doi" | "arxiv" | "bibtex" | "csl";
  pdfPath: string | null;
  /** "pdf" or "epub" when the candidate comes with a file. */
  fileKind?: string | null;
  pageCount: number | null;
  duplicateOf: number | null;
  duplicateTitle: string | null;
  warnings: string[];
}

export interface Preview {
  candidates: Candidate[];
  errors: string[];
}

export type ImportAction = "add" | "merge" | "skip";

export interface Decision {
  candidate: Candidate;
  action: ImportAction;
}

export interface CommitResult {
  added: number[];
  merged: number[];
  skipped: number;
  errors: string[];
}

/** The five standard colours, then the ones a user can add in Settings ▸ Notes. */
export type HighlightColor =
  | "yellow"
  | "red"
  | "green"
  | "blue"
  | "purple"
  | "orange"
  | "pink"
  | "teal"
  | "lime"
  | "brown"
  | "gray";
export type HighlightKind = "highlight" | "underline" | "rect";

export interface HighlightColorLabel {
  color: HighlightColor;
  label: string;
}

export interface Settings {
  offlineMode: boolean;
  paperNoteTemplate: string;
  highlightColors: HighlightColorLabel[];
  vimMode: boolean;
  autoFetchReferences: boolean;
  /** Download a legal open-access PDF for papers added without a file. */
  autoFindPdfs: boolean;
  grobidUrl: string | null;
  /** CSL style id, e.g. "apa". */
  citationStyle: string;
  /** Papers stay this many days in the Trash (0 = until emptied). */
  trashDays: number;
  /** Look for a new version when the app opens (never in offline mode). */
  checkForUpdates: boolean;
}

/** A Chrome-family browser and whether the Paperlines extension can reach the app through it. */
export interface BrowserStatus {
  name: string;
  installed: boolean;
  connected: boolean;
}

export interface Contributor {
  /** GitHub login, when the commits are linked to an account. */
  login: string | null;
  name: string;
}

/** A newer version published on GitHub Releases. */
export interface AppUpdate {
  version: string;
  currentVersion: string;
  /** RFC 3339 release date. */
  date: string | null;
  /** Markdown: this version's part of the changelog. */
  notes: string;
  contributors: Contributor[];
  /** False for deb/rpm/Nix installs and dev builds: offer the download page instead. */
  canInstall: boolean;
}

export interface CitationStyle {
  id: string;
  name: string;
}

export interface Formatted {
  text: string;
  html: string;
}

export interface ImportReport {
  added: number;
  duplicates: number;
  files: number;
  highlights: number;
  notes: number;
  projects: number;
  warnings: string[];
}

export interface FindPdfReport {
  found: string[];
  notFound: string[];
  skipped: number;
}

export interface PaperSummary {
  id: number;
  citekey: string;
  title: string;
  authors: string;
  year: number | null;
  readStatus: ReadStatus;
  tags: string[];
  hasPdf: boolean;
}

export interface DuplicateGroup {
  ids: number[];
  reason: "same PDF" | "same title";
  papers: PaperSummary[];
}

export interface AutoExport {
  id: number;
  format: string;
  scopeKind: "all" | "project" | "query";
  scopeValue: string | null;
  path: string;
  lastWritten: string | null;
  lastError: string | null;
}

export interface LibraryLocation {
  current: string;
  isDefault: boolean;
  default: string;
}

export type CitationSource = "openalex" | "semantic_scholar" | "grobid" | "manual";

export interface CitationLink {
  itemId: number;
  source: CitationSource;
  isManual: boolean;
}

export interface RefStatus {
  source: CitationSource;
  fetchedAt: string;
  total: number;
  /** References that match nothing in the library. */
  outside: number;
}

/** Library-only citation neighborhood of one item. */
export interface Citations {
  cites: CitationLink[];
  citedBy: CitationLink[];
  /** Edges removed by hand; recomputation never brings them back. */
  hidden: { citingItemId: number; citedItemId: number }[];
  /** null until the reference list has been fetched. */
  status: RefStatus | null;
}

export interface FetchSummary {
  fetched: number;
  skipped: number;
  failed: string[];
  linked: number;
}

export type ExportFormat = "bibtex" | "csl-json" | "ris" | "markdown" | "json";

export type ExportScope =
  | { kind: "all" }
  | { kind: "project"; value: string }
  | { kind: "query"; value: string }
  | { kind: "ids"; value: number[] };

export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  kind: "daily" | "pre-migration" | "pre-restore" | "manual";
}

export interface DoctorIssue {
  kind: string;
  detail: string;
  fixable: boolean;
}

export interface DoctorReport {
  items: number;
  pdfs: number;
  edges: number;
  issues: DoctorIssue[];
  fixed: string[];
}

/** An AI assistant that can use the library through the MCP server. */
export interface AssistantStatus {
  id: string;
  name: string;
  /** It seems to be installed on this computer. */
  installed: boolean;
  /** Our server is in its configuration. */
  connected: boolean;
  /** Connected, but to another copy of the program (e.g. an old install). */
  stale: boolean;
  configPath: string;
  /** null: this assistant has no skills folder. */
  skill: boolean | null;
  skillPath: string | null;
  /** What to add by hand instead. */
  manual: string;
}

export interface McpTool {
  name: string;
  description: string;
  readOnly: boolean;
}

/** A skill Paperlines installs, as its SKILL.md describes it. */
export interface SkillInfo {
  name: string;
  /** When an assistant uses it. */
  description: string;
  /** The rules it gives the assistant. */
  rules: string[];
  /** What you can ask for, and what the assistant then does. */
  abilities: [string, string][];
}

export interface AssistantsReport {
  /** The program assistants start, with the argument `mcp`. */
  command: string;
  assistants: AssistantStatus[];
  tools: McpTool[];
  skills: SkillInfo[];
}

/** A paper an assistant suggested for a project; it waits until added or dismissed. */
export interface Suggestion {
  id: number;
  projectId: number | null;
  doi: string | null;
  arxivId: string | null;
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  /** Why it fits, e.g. "Cited by 3 of your project papers". */
  reason: string | null;
  status: "new" | "added" | "dismissed";
  createdAt: string;
}

export interface AgentConfig {
  /** The agent may change the library too (off: it can only read). */
  cliAllowWrites: boolean;
  /** The chosen agent ("claude", "codex"); null: the first one installed. */
  agent: string | null;
}

/** An agent the panel can talk to: installed, and connected in Settings ▸ AI Assistants. */
export interface AgentChoice {
  id: string;
  name: string;
  /** Where it's installed. */
  path: string;
}

export interface AgentInfo {
  config: AgentConfig;
  agents: AgentChoice[];
  /** The agent messages go to: the chosen one if installed, else the first installed; null if none. */
  active: string | null;
}

/** A saved chat with the assistant, as listed in its history. */
export interface AgentChatSummary {
  id: string;
  /** The agent it was with ("claude", "codex"). */
  agent: string;
  title: string;
  /** The paper or note it was about, if any. */
  itemId: number | null;
  noteId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentChat extends AgentChatSummary {
  /** The agent's own session id, to continue the conversation. */
  session: string | null;
  /** The panel's transcript, JSON. */
  messages: string;
}

/** What the panel shows while a reply is written. */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; input: Record<string, unknown> }
  | { type: "toolDone"; id: string; ok: boolean; summary: string; changed: boolean }
  | { type: "session"; id: string }
  | { type: "done"; stop: string }
  | { type: "error"; message: string };

/** A whole library written as a folder (library.json + pdfs/). */
export interface LibraryExport {
  path: string;
  papers: number;
  files: number;
  /** Attachments whose file was missing from the library. */
  missing: string[];
}

export interface CliInstall {
  path: string;
  /** "package": Nix, deb or rpm already put it on PATH. */
  method: "symlink" | "copy" | "package";
  inPath: boolean;
}

export type SecretName = "semantic_scholar" | "openalex";

export interface SecretStatus {
  name: SecretName;
  /** Where the key is stored; never the key itself. */
  location: "os" | "encryptedFile" | null;
}

/** Normalized to the displayed page: (0,0) is top-left, (1,1) bottom-right. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SearchSource =
  | "openalex"
  | "semantic_scholar"
  | "arxiv"
  | "pubmed"
  | "crossref"
  | "europe_pmc"
  | "datacite"
  | "doaj";

/** One paper found online, merged across the sources that returned it. */
export interface DiscoverHit {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  pmid: string | null;
  openalexId: string | null;
  citedByCount: number | null;
  openAccessUrl: string | null;
  abstractText: string | null;
  sources: SearchSource[];
  score: number;
  inLibrary: number | null;
}

export interface DiscoverReport {
  hits: DiscoverHit[];
  errors: { source: SearchSource; message: string }[];
  hasOpenalexKey: boolean;
}

/** A kind of typed connection: "Extends" / "Extended by", or the user's own. */
export interface RelationType {
  id: number;
  key: string;
  label: string;
  /** How it reads from the other paper; null: the same both ways. */
  inverseLabel: string | null;
  color: TagColor;
  builtin: boolean;
  count: number;
}

/** One step of a project's spine (its key papers): several papers can share a step. */
export interface SpineStep {
  id: number;
  position: number;
  label: string | null;
  /** Paper ids in this step, in order. */
  items: number[];
}

export interface Relation {
  id: number;
  fromItemId: number;
  toItemId: number;
  typeId: number;
  note: string | null;
  evidenceHighlightId: number | null;
  createdAt: string;
}

/** A connection seen from one paper. */
export interface RelationView extends Relation {
  outgoing: boolean;
  otherItemId: number;
  /** Worded from this paper: "Extends" or "Extended by". */
  label: string;
  color: TagColor;
  evidenceText: string | null;
  evidencePage: number | null;
  evidenceItemId: number | null;
}

export interface Highlight {
  id: number;
  itemId: number;
  attachmentId: number;
  /** 1-based. */
  page: number;
  kind: HighlightKind;
  rects: Rect[];
  text: string | null;
  color: HighlightColor;
  comment: string | null;
  createdAt: string;
}

export interface NewHighlight {
  itemId: number;
  page: number;
  kind: HighlightKind;
  rects: Rect[];
  text: string | null;
  color: HighlightColor;
  comment: string | null;
}

export type NoteKind = "paper_note" | "free" | "project";

export interface Note {
  id: number;
  kind: NoteKind;
  itemId: number | null;
  projectId: number | null;
  highlightId: number | null;
  title: string | null;
  body: string;
  updatedAt: string;
}

export interface NewNote {
  kind: "free" | "project";
  itemId?: number | null;
  projectId?: number | null;
  highlightId?: number | null;
  title?: string | null;
  body?: string;
}

/** A note in lists and backlinks. `title` is the paper title for paper notes. */
export interface NoteRef {
  noteId: number;
  kind: NoteKind;
  title: string;
  itemId: number | null;
  projectId: number | null;
  updatedAt: string;
  snippet: string;
}

export interface Progress {
  done: number;
  total: number;
}

/** A paper that cites a library paper (from OpenAlex or Semantic Scholar). */
export interface CitingRow {
  openalexId: string | null;
  doi: string | null;
  arxivId: string | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  citedByCount: number | null;
  openAccessUrl: string | null;
  /** The same paper in the library. */
  inLibrary: number | null;
  /** Other library papers it cites (OpenAlex only). */
  connected: number[];
}

export interface CitingReport {
  itemId: number;
  source: "openalex" | "semantic_scholar";
  /** How many papers cite it according to the source; `rows` holds the most cited of them. */
  total: number;
  fetchedAt: string;
  stale: boolean;
  connectedAvailable: boolean;
  rows: CitingRow[];
  /** Citing papers in the library whose own references were never fetched. */
  unfetchedInLibrary: number[];
}

export interface BackendEvents {
  "import-progress": Progress;
  "open-settings": undefined;
  /** Files dropped on the window, and where (CSS pixels), so a drop on a project can go into it. */
  "files-dropped": { paths: string[]; x: number; y: number };
  /** Files are being dragged over the window (null: the drag left or ended). */
  "files-dragging": { x: number; y: number } | null;
  "references-progress": Progress;
  "references-updated": FetchSummary;
  /** The OS asked the app to open files; fetch them with takePendingOpens(). */
  "files-opened": undefined;
  "auto-exports-written": number;
  /** Papers older than the Trash setting were deleted for good (count). */
  "trash-purged": number;
  /** Linux: the desktop switched light/dark (XDG portal), or null for no preference. */
  "system-theme": "dark" | "light" | null;
  "citing-progress": { itemId: number; done: number; total: number };
  /** Papers were added without a file; free PDFs are being looked for (count). */
  "pdfs-searching": number;
  "pdfs-found": FindPdfReport;
  /** Bytes of the update downloaded so far (total unknown: null). */
  "update-progress": { done: number; total: number | null };
}

export type Unsubscribe = () => void;

export interface BackendPort {
  platformInfo(): Promise<PlatformInfo>;
  /** Cached papers citing a paper, matched against the library now (no network). */
  cachedCiting(itemId: number): Promise<CitingReport | null>;
  /** Looks them up unless a recent copy is cached (or `refresh`); progress via "citing-progress". */
  findCiting(itemId: number, refresh: boolean): Promise<CitingReport>;
  /** One citing paper's abstract, fetched on demand (null: none available). */
  citingAbstract(row: Pick<CitingRow, "openalexId" | "doi" | "arxivId">): Promise<string | null>;
  /** The desktop's light/dark preference where the webview can't see it (Linux), else null. */
  systemColorScheme(): Promise<"dark" | "light" | null>;
  listItems(): Promise<Item[]>;
  updateItem(id: number, input: ItemInput): Promise<Item>;
  deleteItem(id: number): Promise<void>;
  deleteItems(ids: number[]): Promise<void>;
  setReadStatus(ids: number[], status: ReadStatus): Promise<void>;
  search(query: string): Promise<SearchResult>;
  listTags(): Promise<TagInfo[]>;
  tagItems(ids: number[], tags: string[]): Promise<void>;
  untagItems(ids: number[], tags: string[]): Promise<void>;
  /** Renaming onto an existing tag merges the two. Children move along. */
  renameTag(from: string, to: string): Promise<void>;
  deleteTag(path: string): Promise<void>;
  setTagColor(path: string, color: TagColor | null): Promise<void>;
  listProjects(): Promise<ProjectInfo[]>;
  createProject(name: string, description: string | null): Promise<number>;
  updateProject(id: number, name: string, description: string | null): Promise<void>;
  setProjectColor(id: number, color: TagColor): Promise<void>;
  deleteProject(id: number): Promise<void>;
  addToProject(projectId: number, ids: number[]): Promise<void>;
  removeFromProject(projectId: number, ids: number[]): Promise<void>;
  readPdf(itemId: number): Promise<Uint8Array>;
  attachPdf(itemId: number, path: string): Promise<Item>;
  listHighlights(itemId: number): Promise<Highlight[]>;
  /** Searches the chosen sources (all when empty) and marks papers already in the library. */
  searchOnline(query: string, sources: SearchSource[]): Promise<DiscoverReport>;
  relationTypes(): Promise<RelationType[]>;
  createRelationType(label: string, inverseLabel: string | null, color: TagColor): Promise<number>;
  updateRelationType(
    id: number,
    label: string,
    inverseLabel: string | null,
    color: TagColor,
  ): Promise<void>;
  /** Deletes a type the user made, with its connections. */
  deleteRelationType(id: number): Promise<void>;
  itemRelations(itemId: number): Promise<RelationView[]>;
  allRelations(): Promise<Relation[]>;
  addRelation(
    from: number,
    to: number,
    typeId: number,
    note: string | null,
    evidence: number | null,
  ): Promise<Relation>;
  /** `swap` reverses the direction. */
  updateRelation(
    id: number,
    typeId: number,
    swap: boolean,
    note: string | null,
    evidence: number | null,
  ): Promise<Relation>;
  removeRelation(id: number): Promise<void>;
  /** A project's spine: its key papers, step by step. */
  spineGet(projectId: number): Promise<SpineStep[]>;
  /** Puts a paper on the spine in `stepId` (null: a new step at the end); it joins the project. */
  spineAdd(projectId: number, itemId: number, stepId: number | null): Promise<number>;
  spineRemove(projectId: number, itemId: number): Promise<void>;
  spineAddStep(projectId: number, label: string | null): Promise<number>;
  spineRenameStep(stepId: number, label: string | null): Promise<void>;
  /** -1: one place earlier, +1: one later. */
  spineMoveStep(stepId: number, delta: number): Promise<void>;
  /** Puts a step's papers in this order (dragging them in the editor). */
  spineReorder(stepId: number, itemIds: number[]): Promise<void>;
  /** Its papers leave the spine (they stay in the project). */
  spineDeleteStep(stepId: number): Promise<void>;
  createHighlight(h: NewHighlight): Promise<Highlight>;
  /** Saves where the reader found a highlight that only had its words (rects empty). */
  placeHighlight(id: number, page: number, rects: Rect[]): Promise<Highlight>;
  updateHighlight(
    id: number,
    patch: { color?: HighlightColor; comment?: string },
  ): Promise<Highlight>;
  deleteHighlight(id: number): Promise<void>;
  /** Writes a copy of the PDF with highlights as PDF annotations. Returns how many were written. */
  exportAnnotatedPdf(itemId: number, dest: string): Promise<number>;
  getPaperNote(itemId: number): Promise<Note>;
  getNote(id: number): Promise<Note>;
  saveNote(id: number, body: string): Promise<Note>;
  createNote(note: NewNote): Promise<Note>;
  renameNote(id: number, title: string): Promise<Note>;
  deleteNote(id: number): Promise<void>;
  /** Free and project notes; with itemId, only that item's free notes. */
  listNotes(itemId?: number): Promise<NoteRef[]>;
  itemBacklinks(itemId: number): Promise<NoteRef[]>;
  noteBacklinks(noteId: number): Promise<NoteRef[]>;
  appendToPaperNote(itemId: number, bullet: string): Promise<Note>;
  getCitations(itemId: number): Promise<Citations>;
  /** Every visible edge as [citing, cited]; both ends are library items. */
  graphEdges(): Promise<[number, number][]>;
  /** Fetches reference lists (skipping cached ones unless `force`) and links them to the library. */
  fetchReferences(itemIds: number[], force: boolean): Promise<FetchSummary>;
  addCitation(citing: number, cited: number): Promise<void>;
  /** Hides an edge permanently (a manual decision). */
  removeCitation(citing: number, cited: number): Promise<void>;
  /** Forgets a manual decision so automatic matching decides again. */
  resetCitation(citing: number, cited: number): Promise<void>;
  secretStatus(): Promise<SecretStatus[]>;
  setSecret(name: SecretName, value: string): Promise<"os" | "encryptedFile">;
  deleteSecret(name: SecretName): Promise<void>;
  /** Writes an export file; returns its path. "json" is the full library dump. */
  exportItems(format: ExportFormat, scope: ExportScope, dest: string): Promise<string>;
  /** One Markdown file per note into `dir`; returns the number of files. */
  exportNotes(dir: string): Promise<number>;
  listBackups(): Promise<BackupInfo[]>;
  backupNow(): Promise<string>;
  /** Replaces the library with a backup; the current state is saved first. Returns that safety copy. */
  restoreBackup(path: string): Promise<string>;
  runDoctor(fix: boolean): Promise<DoctorReport>;
  installCli(): Promise<CliInstall>;
  /** Suggestions waiting in a project's inbox (null: the library's). Imported ones drop out. */
  suggestionsList(projectId: number | null): Promise<Suggestion[]>;
  suggestionSetStatus(id: number, status: "new" | "added" | "dismissed"): Promise<void>;
  /** How many suggestions wait per project (projectId null: the library's inbox). */
  suggestionsCounts(): Promise<{ projectId: number | null; count: number }[]>;
  /** Writes the whole library, PDFs included, as a new folder inside `parent`. */
  exportLibrary(parent: string): Promise<LibraryExport>;
  /** AI assistants on this computer, whether they're connected, and what the server offers. */
  assistantsStatus(): Promise<AssistantsReport>;
  /** The assistant panel: its settings, and which agents (Claude Code, Codex) are installed. */
  agentInfo(): Promise<AgentInfo>;
  agentSaveConfig(config: AgentConfig): Promise<void>;
  /**
   * Sends a message to the active agent; `onEvent` gets the reply as it's written.
   * Resolves when the reply is done.
   */
  agentSend(
    chat: string,
    text: string,
    context: string | null,
    about: { itemId: number | null; noteId: number | null },
    onEvent: (e: AgentEvent) => void,
  ): Promise<void>;
  /** Saved chats, the most recent first. */
  agentChats(): Promise<AgentChatSummary[]>;
  agentChatGet(id: string): Promise<AgentChat>;
  /** Stores a chat's transcript (JSON) after a reply. */
  agentChatSave(id: string, messages: string): Promise<void>;
  agentChatDelete(id: string): Promise<void>;
  agentStop(chat: string): Promise<void>;
  /** Forgets a conversation. */
  agentForget(chat: string): Promise<void>;
  /** Adds (or with `on` false removes) the MCP server in the assistant's own configuration. */
  assistantConnect(id: string, on: boolean): Promise<void>;
  /** Installs or removes the skill (SKILL.md) in the assistant's skills folder. */
  assistantSkill(id: string, on: boolean): Promise<void>;
  /** Writes `<dir>/paperlines/SKILL.md`; returns the file's path. */
  assistantSaveSkill(dir: string): Promise<string>;
  /** Files the OS asked to open (Open with, Dock, second launch). */
  takePendingOpens(): Promise<string[]>;
  trashItems(ids: number[]): Promise<void>;
  restoreItems(ids: number[]): Promise<void>;
  listTrash(): Promise<Item[]>;
  /** Deletes for good: the given trashed papers, or the whole Trash when `ids` is empty. */
  emptyTrash(ids: number[]): Promise<number>;
  duplicateGroups(): Promise<DuplicateGroup[]>;
  mergeDuplicates(master: number, others: number[]): Promise<void>;
  dismissDuplicates(ids: number[]): Promise<void>;
  findPdfs(ids: number[]): Promise<FindPdfReport>;
  zoteroDefaultDir(): Promise<string | null>;
  importZotero(dir: string): Promise<ImportReport>;
  importDump(path: string): Promise<ImportReport>;
  citationStyles(): Promise<CitationStyle[]>;
  formatCitation(
    ids: number[],
    style: string | null,
    mode: "citation" | "bibliography",
  ): Promise<Formatted>;
  /** Formats and copies to the clipboard (HTML + plain text). */
  copyCitation(
    ids: number[],
    style: string | null,
    mode: "citation" | "bibliography",
  ): Promise<Formatted>;
  exportFormatted(scope: ExportScope, style: string | null, dest: string): Promise<string>;
  listAutoExports(): Promise<AutoExport[]>;
  addAutoExport(
    format: string,
    scopeKind: "all" | "project" | "query",
    scopeValue: string | null,
    path: string,
  ): Promise<AutoExport>;
  removeAutoExport(id: number): Promise<void>;
  /** Opens an attachment (e.g. an EPUB) in the system's default app. */
  openAttachment(itemId: number, kind: "pdf" | "epub"): Promise<void>;
  /** Reads a paper's details again from its PDF (nothing is saved). */
  reidentifyPdf(itemId: number): Promise<{ input: ItemInput; warnings: string[]; citekey: string }>;
  /** Shows the paper's stored file in Finder / the file manager. */
  revealAttachment(itemId: number, kind: "pdf" | "epub"): Promise<void>;
  libraryLocation(): Promise<LibraryLocation>;
  /** "move" copies this library to `path`; "open" uses the library there; "default" resets. Restarts the app. */
  setLibraryLocation(path: string | null, mode: "move" | "open" | "default"): Promise<void>;
  /** Native file picker for one file with the given extensions. */
  pickFile(extensions: string[]): Promise<string | null>;
  /** Native save dialog; `extension` filters the file type (default pdf). */
  pickSavePath(defaultName: string, extension?: string): Promise<string | null>;
  /** Opens an http(s) URL in the system browser. */
  openExternal(url: string): Promise<void>;
  /** Asks GitHub Releases for a newer version (null: up to date). Fails in offline mode. */
  checkForUpdate(): Promise<AppUpdate | null>;
  /** Downloads and installs the update from the last check, then restarts the app. */
  installUpdate(): Promise<void>;
  /** Chrome-family browsers on this computer, and which ones the extension can reach Paperlines from. */
  browserStatus(): Promise<BrowserStatus[]>;
  /** Registers Paperlines with every installed Chrome-family browser, for the extension. */
  browserConnect(): Promise<BrowserStatus[]>;
  /** The window buttons the app draws itself where the system frame is off (Windows). */
  windowControl(action: "minimize" | "toggleMaximize" | "close"): Promise<void>;
  listSavedSearches(): Promise<SavedSearch[]>;
  createSavedSearch(name: string, query: string): Promise<number>;
  deleteSavedSearch(id: number): Promise<void>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  importPreviewPaths(paths: string[]): Promise<Preview>;
  importPreviewText(text: string): Promise<Preview>;
  importCommit(decisions: Decision[]): Promise<CommitResult>;
  /** Native file picker; returns null when cancelled or unsupported. */
  pickPaths(kind: "files" | "folder"): Promise<string[] | null>;
  confirm(message: string): Promise<boolean>;
  on<K extends keyof BackendEvents>(event: K, cb: (payload: BackendEvents[K]) => void): Unsubscribe;
}

export function toInput(item: Item): ItemInput {
  const {
    id: _id,
    dateAdded: _a,
    dateModified: _m,
    hasPdf: _p,
    tags: _t,
    projectIds: _pr,
    hasEpub: _e,
    deletedAt: _d,
    ...rest
  } = item;
  return rest;
}

export const emptyBiblio: Biblio = {
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
