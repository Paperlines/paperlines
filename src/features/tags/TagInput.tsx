import type { TagInfo } from "@paperlines/backend-port";
import { useId, useMemo, useState } from "react";
import { t } from "../../i18n";
import { TagChip } from "./TagChip";

interface Props {
  value: string[];
  allTags: TagInfo[];
  onAdd(path: string): void;
  onRemove?(path: string): void;
  autoFocus?: boolean;
  placeholder?: string;
}

/** Chips plus an input with autocomplete. Enter adds the highlighted suggestion or the typed text. */
export function TagInput({ value, allTags, onAdd, onRemove, autoFocus, placeholder }: Props) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const colors = useMemo(
    () => new Map(allTags.map((tg) => [tg.path.toLowerCase(), tg.color])),
    [allTags],
  );
  const current = new Set(value.map((v) => v.toLowerCase()));
  const q = text.trim().toLowerCase();
  const suggestions = q
    ? allTags
        .filter((tg) => !current.has(tg.path.toLowerCase()) && tg.path.toLowerCase().includes(q))
        .sort(
          (a, b) =>
            Number(!a.path.toLowerCase().startsWith(q)) -
            Number(!b.path.toLowerCase().startsWith(q)),
        )
        .slice(0, 8)
    : [];

  const add = (p: string) => {
    if (!p.trim()) return;
    onAdd(p.trim());
    setText("");
    setActive(0);
  };

  return (
    <div className="tag-input">
      <div className="chips">
        {value.map((v) => (
          <TagChip
            key={v}
            path={v}
            color={colors.get(v.toLowerCase())}
            onRemove={onRemove && (() => onRemove(v))}
          />
        ))}
        <input
          className="tag-input-field"
          value={text}
          placeholder={placeholder ?? t("tags.add")}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-label={placeholder ?? t("tags.add")}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(suggestions[active]?.path ?? text);
            } else if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault();
              setActive((active + 1) % suggestions.length);
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault();
              setActive((active - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Backspace" && !text && onRemove && value.length) {
              onRemove(value[value.length - 1]);
            }
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="suggestions" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.path);
              }}
            >
              <TagChip path={s.path} color={s.color} />
              <span className="muted small">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
