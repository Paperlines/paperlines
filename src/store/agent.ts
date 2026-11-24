import type { AgentChatSummary, AgentEvent, AgentInfo } from "@paperlines/backend-port";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { backend } from "../backend";
import { useHighlights } from "./highlights";
import { useLibrary } from "./library";
import { usePanes } from "./panes";

export type Part =
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "running" | "ok" | "error";
      summary?: string;
      /** It changed the library (a note, highlights, a connection, suggestions). */
      changed?: boolean;
    }
  | { kind: "error"; text: string };

export interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  /** The user's words (assistant messages use `parts`). */
  text: string;
  parts: Part[];
}

let seq = 0;
const newChatId = () => `chat-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** What a message is about: the paper or note that was open. */
export interface ChatAbout {
  itemId: number | null;
  noteId: number | null;
}

interface AgentState {
  open: boolean;
  width: number;
  info: AgentInfo | null;
  /** Identifies the conversation to the backend; New chat gets a new one. */
  chatId: string;
  /** The agent the open chat was saved with (null: a new chat). */
  chatAgent: string | null;
  messages: ChatMsg[];
  running: boolean;
  /** The history list is showing instead of the chat. */
  showHistory: boolean;
  history: AgentChatSummary[];
  setShowHistory(on: boolean): void;
  loadHistory(): Promise<void>;
  /** Opens a saved chat (or the last one, after a restart). */
  openChat(id: string): Promise<boolean>;
  deleteChat(id: string): Promise<void>;
  toggle(): void;
  setOpen(open: boolean): void;
  setWidth(px: number): void;
  loadInfo(): Promise<AgentInfo>;
  setAllowWrites(on: boolean): Promise<void>;
  /** Switches agent; the conversation starts over, since sessions belong to one agent. */
  setAgent(id: string): Promise<void>;
  send(text: string, context: string | null, about?: ChatAbout): Promise<void>;
  stop(): void;
  newChat(): void;
}

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
});

/** Reloads what the assistant changed: papers, notes and highlights. */
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
function libraryChanged() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    useLibrary.getState().refresh();
    usePanes.getState().notesChanged();
    useHighlights.getState().reloadAll();
  }, 150);
}

export const useAgent = create<AgentState>()(
  persist(
    (set, get) => {
      /** Applies `f` to the reply being written, if the chat is still the same one. */
      const update = (chatId: string, f: (parts: Part[]) => Part[]) =>
        set((s) => {
          if (s.chatId !== chatId) return s;
          const msgs = s.messages.slice();
          const last = msgs[msgs.length - 1];
          if (!last || last.role !== "assistant") return s;
          msgs[msgs.length - 1] = { ...last, parts: f(last.parts.slice()) };
          return { messages: msgs };
        });
      const onEvent = (chatId: string) => (e: AgentEvent) => {
        switch (e.type) {
          case "text":
            return update(chatId, (parts) => {
              const last = parts[parts.length - 1];
              if (last?.kind === "text")
                parts[parts.length - 1] = { ...last, text: last.text + e.delta };
              else parts.push({ kind: "text", text: e.delta });
              return parts;
            });
          case "tool":
            return update(chatId, (parts) => [
              ...parts,
              { kind: "tool", id: e.id, name: e.name, input: e.input, status: "running" },
            ]);
          case "toolDone":
            if (e.changed) libraryChanged();
            return update(chatId, (parts) =>
              parts.map((p) =>
                p.kind === "tool" && p.id === e.id
                  ? { ...p, status: e.ok ? "ok" : "error", summary: e.summary, changed: e.changed }
                  : p,
              ),
            );
          case "error":
            return update(chatId, (parts) => [...parts, { kind: "error", text: e.message }]);
          case "session":
            return;
          case "done":
            // a stopped reply leaves steps that never finished
            return update(chatId, (parts) =>
              parts.map((p) =>
                p.kind === "tool" && p.status === "running" ? { ...p, status: "error" } : p,
              ),
            );
        }
      };

      return {
        open: false,
        width: 400,
        info: null,
        chatId: newChatId(),
        chatAgent: null,
        messages: [],
        running: false,
        showHistory: false,
        history: [],
        setShowHistory: (showHistory) => {
          set({ showHistory });
          if (showHistory) get().loadHistory();
        },
        async loadHistory() {
          try {
            set({ history: await backend.agentChats() });
          } catch {
            // the history is a convenience: an error just shows none
          }
        },
        async openChat(id) {
          if (get().running) return false;
          try {
            const c = await backend.agentChatGet(id);
            const parsed: unknown = JSON.parse(c.messages);
            const messages = Array.isArray(parsed) ? (parsed as ChatMsg[]) : [];
            seq = Math.max(seq, ...messages.map((m) => m.id + 1));
            set({ chatId: c.id, chatAgent: c.agent, messages, showHistory: false });
            return true;
          } catch {
            return false;
          }
        },
        async deleteChat(id) {
          await backend.agentChatDelete(id);
          if (get().chatId === id) set({ chatId: newChatId(), chatAgent: null, messages: [] });
          await get().loadHistory();
        },
        toggle: () => set({ open: !get().open }),
        setOpen: (open) => set({ open }),
        setWidth: (px) => set({ width: Math.round(Math.max(320, Math.min(760, px))) }),
        async loadInfo() {
          const info = await backend.agentInfo();
          set({ info });
          return info;
        },
        async setAllowWrites(on) {
          const info = get().info;
          if (!info) return;
          const config = { ...info.config, cliAllowWrites: on };
          set({ info: { ...info, config } });
          await backend.agentSaveConfig(config);
        },
        async setAgent(id) {
          const info = get().info;
          if (!info || info.active === id) return;
          await backend.agentSaveConfig({ ...info.config, agent: id });
          get().newChat();
          await get().loadInfo();
        },
        async send(text, context, about = { itemId: null, noteId: null }) {
          const { chatId, running, messages } = get();
          if (running || !text.trim()) return;
          const user: ChatMsg = { id: seq++, role: "user", text, parts: [] };
          const reply: ChatMsg = { id: seq++, role: "assistant", text: "", parts: [] };
          set({ running: true, messages: [...messages, user, reply] });
          try {
            await backend.agentSend(chatId, text, context, about, onEvent(chatId));
          } catch (err) {
            onEvent(chatId)({ type: "error", message: String(err).replace(/^Error: /, "") });
          } finally {
            if (get().chatId === chatId) {
              set({ running: false, chatAgent: get().info?.active ?? get().chatAgent });
              // keep the transcript, so the chat can be read and continued after a restart
              backend.agentChatSave(chatId, JSON.stringify(get().messages)).catch(() => {});
            }
          }
        },
        stop() {
          if (get().running) backend.agentStop(get().chatId);
        },
        newChat() {
          backend.agentForget(get().chatId);
          set({
            chatId: newChatId(),
            chatAgent: null,
            messages: [],
            running: false,
            showHistory: false,
          });
        },
      };
    },
    {
      name: "assistant-panel",
      storage: safeStorage,
      version: 3,
      migrate: (s) => s as AgentState,
      // the open chat comes back after a restart (its transcript is loaded from the library)
      partialize: ({ open, width, chatId }) => ({ open, width, chatId }),
    },
  ),
);
