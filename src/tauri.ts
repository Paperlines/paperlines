import type { AgentEvent, BackendEvents, BackendPort, Unsubscribe } from "@paperlines/backend-port";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

function later(p: Promise<() => void>): Unsubscribe {
  return () => {
    p.then((f) => f());
  };
}

export const tauriBackend: BackendPort = {
  platformInfo: () => invoke("platform_info"),
  listItems: () => invoke("list_items"),
  updateItem: (id, input) => invoke("update_item", { id, input }),
  deleteItem: (id) => invoke("delete_item", { id }),
  deleteItems: (ids) => invoke("delete_items", { ids }),
  setReadStatus: (ids, status) => invoke("set_read_status", { ids, status }),
  search: (query) => invoke("search", { query }),
  listTags: () => invoke("list_tags"),
  tagItems: (ids, tags) => invoke("tag_items", { ids, tags }),
  untagItems: (ids, tags) => invoke("untag_items", { ids, tags }),
  renameTag: (from, to) => invoke("rename_tag", { from, to }),
  deleteTag: (path) => invoke("delete_tag", { path }),
  setTagColor: (path, color) => invoke("set_tag_color", { path, color }),
  listProjects: () => invoke("list_projects"),
  createProject: (name, description) => invoke("create_project", { name, description }),
  updateProject: (id, name, description) => invoke("update_project", { id, name, description }),
  setProjectColor: (id, color) => invoke("set_project_color", { id, color }),
  deleteProject: (id) => invoke("delete_project", { id }),
  addToProject: (projectId, ids) => invoke("add_to_project", { projectId, ids }),
  removeFromProject: (projectId, ids) => invoke("remove_from_project", { projectId, ids }),
  readPdf: async (itemId) => new Uint8Array(await invoke<ArrayBuffer>("read_pdf", { itemId })),
  attachPdf: (itemId, path) => invoke("attach_pdf", { itemId, path }),
  listHighlights: (itemId) => invoke("list_highlights", { itemId }),
  createHighlight: (highlight) => invoke("create_highlight", { highlight }),
  placeHighlight: (id, page, rects) => invoke("place_highlight", { id, page, rects }),
  updateHighlight: (id, patch) => invoke("update_highlight", { id, patch }),
  deleteHighlight: (id) => invoke("delete_highlight", { id }),
  exportAnnotatedPdf: (itemId, dest) => invoke("export_annotated_pdf", { itemId, dest }),
  getPaperNote: (itemId) => invoke("get_paper_note", { itemId }),
  getNote: (id) => invoke("get_note", { id }),
  saveNote: (id, body) => invoke("save_note", { id, body }),
  createNote: (note) => invoke("create_note", { note }),
  renameNote: (id, title) => invoke("rename_note", { id, title }),
  deleteNote: (id) => invoke("delete_note", { id }),
  listNotes: (itemId) => invoke("list_notes", { itemId: itemId ?? null }),
  itemBacklinks: (itemId) => invoke("item_backlinks", { itemId }),
  noteBacklinks: (noteId) => invoke("note_backlinks", { noteId }),
  appendToPaperNote: (itemId, bullet) => invoke("append_to_paper_note", { itemId, bullet }),
  getCitations: (itemId) => invoke("get_citations", { itemId }),
  graphEdges: () => invoke("graph_edges"),
  fetchReferences: (itemIds, force) => invoke("fetch_references", { itemIds, force }),
  addCitation: (citing, cited) => invoke("add_citation", { citing, cited }),
  removeCitation: (citing, cited) => invoke("remove_citation", { citing, cited }),
  resetCitation: (citing, cited) => invoke("reset_citation", { citing, cited }),
  secretStatus: () => invoke("secret_status"),
  setSecret: (name, value) => invoke("set_secret", { name, value }),
  deleteSecret: (name) => invoke("delete_secret", { name }),
  exportItems: (format, scope, dest) => invoke("export_items", { format, scope, dest }),
  exportNotes: (dir) => invoke("export_notes", { dir }),
  listBackups: () => invoke("list_backups"),
  backupNow: () => invoke("backup_now"),
  restoreBackup: (path) => invoke("restore_backup", { path }),
  runDoctor: (fix) => invoke("run_doctor", { fix }),
  installCli: () => invoke("install_cli"),
  takePendingOpens: () => invoke("take_pending_opens"),
  trashItems: (ids) => invoke("trash_items", { ids }),
  restoreItems: (ids) => invoke("restore_items", { ids }),
  listTrash: () => invoke("list_trash"),
  emptyTrash: (ids) => invoke("empty_trash", { ids }),
  duplicateGroups: () => invoke("duplicate_groups"),
  mergeDuplicates: (master, others) => invoke("merge_duplicates", { master, others }),
  dismissDuplicates: (ids) => invoke("dismiss_duplicates", { ids }),
  findPdfs: (ids) => invoke("find_pdfs", { ids }),
  zoteroDefaultDir: () => invoke("zotero_default_dir"),
  importZotero: (dir) => invoke("import_zotero", { dir }),
  importDump: (path) => invoke("import_dump", { path }),
  citationStyles: () => invoke("citation_styles"),
  formatCitation: (ids, style, mode) => invoke("format_citation", { ids, style, mode }),
  copyCitation: (ids, style, mode) => invoke("copy_citation", { ids, style, mode }),
  exportFormatted: (scope, style, dest) => invoke("export_formatted", { scope, style, dest }),
  listAutoExports: () => invoke("list_auto_exports"),
  addAutoExport: (format, scopeKind, scopeValue, path) =>
    invoke("add_auto_export", { format, scopeKind, scopeValue, path }),
  removeAutoExport: (id) => invoke("remove_auto_export", { id }),
  systemColorScheme: () => invoke("system_color_scheme"),
  cachedCiting: (itemId) => invoke("cached_citing", { itemId }),
  findCiting: (itemId, refresh) => invoke("find_citing", { itemId, refresh }),
  citingAbstract: (r) =>
    invoke("citing_abstract", { openalexId: r.openalexId, doi: r.doi, arxivId: r.arxivId }),
  openAttachment: (itemId, kind) => invoke("open_attachment", { itemId, kind }),
  revealAttachment: (itemId, kind) => invoke("reveal_attachment", { itemId, kind }),
  reidentifyPdf: (itemId) => invoke("reidentify_pdf", { itemId }),
  searchOnline: (query, sources) => invoke("search_online", { query, sources }),
  relationTypes: () => invoke("relation_types"),
  createRelationType: (label, inverseLabel, color) =>
    invoke("create_relation_type", { label, inverseLabel, color }),
  updateRelationType: (id, label, inverseLabel, color) =>
    invoke("update_relation_type", { id, label, inverseLabel, color }),
  deleteRelationType: (id) => invoke("delete_relation_type", { id }),
  itemRelations: (itemId) => invoke("item_relations", { itemId }),
  allRelations: () => invoke("all_relations"),
  addRelation: (from, to, typeId, note, evidence) =>
    invoke("add_relation", { from, to, typeId, note, evidence }),
  updateRelation: (id, typeId, swap, note, evidence) =>
    invoke("update_relation", { id, typeId, swap, note, evidence }),
  removeRelation: (id) => invoke("remove_relation", { id }),
  assistantsStatus: () => invoke("assistants_status"),
  agentInfo: () => invoke("agent_info"),
  agentSaveConfig: (config) => invoke("agent_save_config", { config }),
  agentSend: (chat, text, context, about, onEvent) => {
    const ch = new Channel<AgentEvent>();
    ch.onmessage = onEvent;
    return invoke("agent_send", { chat, text, context, ...about, onEvent: ch });
  },
  agentChats: () => invoke("agent_chats"),
  agentChatGet: (id) => invoke("agent_chat_get", { id }),
  agentChatSave: (id, messages) => invoke("agent_chat_save", { id, messages }),
  agentChatDelete: (id) => invoke("agent_chat_delete", { id }),
  agentStop: (chat) => invoke("agent_stop", { chat }),
  agentForget: (chat) => invoke("agent_forget", { chat }),
  exportLibrary: (parent) => invoke("export_library", { parent }),
  suggestionsList: (projectId) => invoke("suggestions_list", { projectId }),
  suggestionSetStatus: (id, status) => invoke("suggestion_set_status", { id, status }),
  suggestionsCounts: () => invoke("suggestions_counts"),
  assistantConnect: (id, on) => invoke("assistant_connect", { id, on }),
  assistantSkill: (id, on) => invoke("assistant_skill", { id, on }),
  assistantSaveSkill: (dir) => invoke("assistant_save_skill", { dir }),
  spineGet: (projectId) => invoke("spine_get", { projectId }),
  spineAdd: (projectId, itemId, stepId) => invoke("spine_add", { projectId, itemId, stepId }),
  spineRemove: (projectId, itemId) => invoke("spine_remove", { projectId, itemId }),
  spineAddStep: (projectId, label) => invoke("spine_add_step", { projectId, label }),
  spineRenameStep: (stepId, label) => invoke("spine_rename_step", { stepId, label }),
  spineMoveStep: (stepId, delta) => invoke("spine_move_step", { stepId, delta }),
  spineReorder: (stepId, itemIds) => invoke("spine_reorder", { stepId, itemIds }),
  spineDeleteStep: (stepId) => invoke("spine_delete_step", { stepId }),
  libraryLocation: () => invoke("library_location"),
  setLibraryLocation: (path, mode) => invoke("set_library_location", { path, mode }),
  async pickFile(extensions) {
    const r = await open({
      multiple: false,
      filters: [{ name: extensions.join(", ").toUpperCase(), extensions }],
    });
    return Array.isArray(r) ? (r[0] ?? null) : r;
  },
  pickSavePath: (defaultName, extension = "pdf") =>
    save({
      defaultPath: defaultName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    }),
  openExternal: (url) => openUrl(url),
  listSavedSearches: () => invoke("list_saved_searches"),
  createSavedSearch: (name, query) => invoke("create_saved_search", { name, query }),
  deleteSavedSearch: (id) => invoke("delete_saved_search", { id }),
  getSettings: () => invoke("get_settings"),
  updateSettings: (patch) => invoke("update_settings", { patch }),
  checkForUpdate: () => invoke("update_check"),
  installUpdate: () => invoke("update_install"),
  windowControl: (action) => {
    const w = getCurrentWindow();
    return action === "minimize"
      ? w.minimize()
      : action === "close"
        ? w.close()
        : w.toggleMaximize();
  },
  importPreviewPaths: (paths) => invoke("import_preview_paths", { paths }),
  importPreviewText: (text) => invoke("import_preview_text", { text }),
  importCommit: (decisions) => invoke("import_commit", { decisions }),
  async pickPaths(kind) {
    const r = await open(
      kind === "folder"
        ? { directory: true, multiple: true }
        : {
            multiple: true,
            filters: [
              {
                name: "PDF, EPUB, BibTeX, RIS, CSL-JSON",
                extensions: ["pdf", "epub", "bib", "ris", "json"],
              },
            ],
          },
    );
    if (r === null) return null;
    return Array.isArray(r) ? r : [r];
  },
  confirm: (message) => ask(message, { kind: "warning" }),
  on<K extends keyof BackendEvents>(event: K, cb: (p: BackendEvents[K]) => void): Unsubscribe {
    if (event === "files-dropped" || event === "files-dragging") {
      // positions are physical pixels
      const css = (p: { x: number; y: number }) => ({
        x: p.x / window.devicePixelRatio,
        y: p.y / window.devicePixelRatio,
      });
      return later(
        getCurrentWebview().onDragDropEvent((e) => {
          const p = e.payload;
          if (event === "files-dropped" && p.type === "drop")
            (cb as (v: BackendEvents["files-dropped"]) => void)({
              paths: p.paths,
              ...css(p.position),
            });
          if (event === "files-dragging")
            (cb as (v: BackendEvents["files-dragging"]) => void)(
              p.type === "over" || p.type === "enter" ? css(p.position) : null,
            );
        }),
      );
    }
    return later(listen<BackendEvents[K]>(event, (e) => cb(e.payload)));
  },
};
