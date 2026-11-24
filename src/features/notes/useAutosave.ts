import { useCallback, useEffect, useRef, useState } from "react";
import { backend } from "../../backend";
import { usePanes } from "../../store/panes";

/** Note body with debounced saving; pending edits are flushed on unmount or note switch. */
export function useAutosave(noteId: number | null, serverBody: string | null) {
  const [body, setBody] = useState(serverBody ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = useRef<{ id: number; body: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    setState("saving");
    try {
      await backend.saveNote(p.id, p.body);
      setState("saved");
      usePanes.getState().notesChanged();
    } catch {
      setState("error");
    }
  }, []);

  // adopt server changes (load, quote-to-note) unless the user has unsaved edits
  useEffect(() => {
    if (serverBody !== null && !pending.current) setBody(serverBody);
  }, [serverBody]);

  useEffect(() => () => void flush(), [flush]);

  const change = useCallback(
    (v: string) => {
      setBody(v);
      if (noteId === null) return;
      pending.current = { id: noteId, body: v };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    },
    [noteId, flush],
  );

  return { body, change, flush, state };
}
