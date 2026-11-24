import { Check, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type MenuAction, type MenuEntry, useContextMenu } from "../store/contextMenu";
import { usePlatform } from "../store/platform";

/** "mod+shift+c" → "⇧⌘C" on macOS, "Ctrl+Shift+C" elsewhere. */
function keys(shortcut: string, mac: boolean): string {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const k =
    key === "backspace" ? (mac ? "⌫" : "Backspace") : key.length === 1 ? key.toUpperCase() : key;
  if (mac) {
    const mods =
      (parts.includes("shift") ? "⇧" : "") +
      (parts.includes("alt") ? "⌥" : "") +
      (parts.includes("mod") ? "⌘" : "");
    return mods + k;
  }
  return [...parts.map((p) => (p === "mod" ? "Ctrl" : p[0].toUpperCase() + p.slice(1))), k].join(
    "+",
  );
}

function MenuList({
  items,
  label,
  x,
  y,
  onDone,
  autoFocus,
}: {
  items: MenuEntry[];
  label: string;
  x: number;
  y: number;
  onDone(): void;
  autoFocus: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mac = usePlatform((s) => s.platform?.os === "macos");
  const [pos, setPos] = useState({ left: x, top: y });
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);

  // keep the menu on screen: flip left/up when it would overflow
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offset sizes: the opening animation scales the menu, which would skew getBoundingClientRect
    const r = { width: el.offsetWidth, height: el.offsetHeight };
    const left = x + r.width > window.innerWidth - 6 ? Math.max(6, x - r.width) : x;
    const top =
      y + r.height > window.innerHeight - 6 ? Math.max(6, window.innerHeight - r.height - 6) : y;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    if (autoFocus)
      ref.current?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
  }, [autoFocus]);

  const buttons = () => [
    ...(ref.current?.querySelectorAll<HTMLElement>(
      ":scope > [role=menuitem]:not([aria-disabled=true])",
    ) ?? []),
  ];
  const openSub = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setSub({ index: i, x: r.right - 4, y: r.top - 5 });
  };

  return (
    <>
      <div
        ref={ref}
        className="ctx-menu"
        role="menu"
        aria-label={label}
        style={pos}
        onKeyDown={(e) => {
          const list = buttons();
          const at = list.indexOf(document.activeElement as HTMLElement);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const d = e.key === "ArrowDown" ? 1 : -1;
            list[(at + d + list.length) % list.length]?.focus();
          } else if (e.key === "ArrowRight" && at >= 0) {
            const el = list[at];
            const i = Number(el.dataset.index);
            if ((items[i] as MenuAction).items) {
              e.preventDefault();
              openSub(i, el);
            }
          }
        }}
      >
        {items.map((it, i) => {
          if (it === "separator") return <div key={`s${i}`} className="ctx-sep" role="separator" />;
          const hasSub = !!it.items?.length;
          return (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              data-index={i}
              aria-disabled={it.disabled || undefined}
              aria-haspopup={hasSub ? "menu" : undefined}
              aria-expanded={hasSub ? sub?.index === i : undefined}
              className={`ctx-item${it.danger ? " danger" : ""}${sub?.index === i ? " open" : ""}`}
              tabIndex={-1}
              onMouseEnter={(e) => {
                if (hasSub) openSub(i, e.currentTarget);
                else setSub(null);
              }}
              onClick={(e) => {
                if (it.disabled) return;
                if (hasSub) return openSub(i, e.currentTarget);
                onDone();
                it.run?.();
              }}
            >
              <span className="ctx-icon" aria-hidden="true">
                {it.checked ? <Check size={14} /> : it.icon}
              </span>
              <span className="ctx-label">{it.label}</span>
              {it.shortcut && <kbd className="ctx-key">{keys(it.shortcut, mac)}</kbd>}
              {hasSub && <ChevronRight size={14} className="ctx-chevron" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {sub && (items[sub.index] as MenuAction).items && (
        <MenuList
          key={sub.index}
          items={(items[sub.index] as MenuAction).items ?? []}
          label={(items[sub.index] as MenuAction).label}
          x={sub.x}
          y={sub.y}
          onDone={onDone}
          autoFocus={false}
        />
      )}
    </>
  );
}

/** The app's own right-click menu (see `useContextMenu`). */
export function ContextMenu() {
  const { menu, close } = useContextMenu();
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".ctx-menu")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [menu, close]);
  if (!menu) return null;
  return (
    <MenuList
      key={`${menu.x},${menu.y}`}
      items={menu.items}
      label={menu.label}
      x={menu.x}
      y={menu.y}
      onDone={close}
      autoFocus
    />
  );
}

/**
 * The system menu (Look Up, Translate, Speech…) only where it helps: text fields, the notes
 * editor and selected text. Elsewhere right-click does nothing unless the app shows its own menu.
 */
export function suppressSystemMenu(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest("input, textarea, [contenteditable=true], .cm-editor, .md-preview")) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return;
  e.preventDefault();
}
