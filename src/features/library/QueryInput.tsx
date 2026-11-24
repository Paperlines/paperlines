import { IS_VALUES, KEYS, qualifier, tokenAtEnd } from "@paperlines/search-query";
import { useState } from "react";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";

interface Suggestion {
  label: string;
  /** Full replacement for the query text. */
  value: string;
}

/** Search box with autocomplete for qualifier names and tag/project/is values. */
export function QueryInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  const { tags, projects } = useLibrary();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const tok = tokenAtEnd(value);
  const head = value.slice(0, tok.start);
  const p = tok.partial.toLowerCase();
  let suggestions: Suggestion[] = [];
  if (tok.key) {
    const pool =
      tok.key === "tag"
        ? tags.map((x) => x.path)
        : tok.key === "project"
          ? projects.map((x) => x.name)
          : tok.key === "is" || tok.key === "has"
            ? IS_VALUES
            : [];
    suggestions = pool
      .filter((v) => v.toLowerCase().includes(p) && v.toLowerCase() !== p)
      .slice(0, 8)
      .map((v) => ({
        label: `${tok.key}:${v}`,
        value: `${head}${qualifier(tok.key as string, v)} `,
      }));
  } else if (p.length >= 1) {
    const bare = p.replace(/^-/, "");
    suggestions = KEYS.filter((k) => k.startsWith(bare) && bare.length > 0).map((k) => ({
      label: `${k}:`,
      value: `${head}${p.startsWith("-") ? "-" : ""}${k}:`,
    }));
  }
  const showing = open && suggestions.length > 0;

  return (
    <div className="query">
      <input
        id="library-search"
        className="input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("library.search")}
        aria-label={t("library.search")}
        role="combobox"
        aria-expanded={showing}
        aria-controls="query-suggestions"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (showing) setOpen(false);
            else if (value) onChange("");
            else (e.target as HTMLInputElement).blur();
            e.preventDefault();
            return;
          }
          if (!showing) return;
          if (e.key === "ArrowDown") setActive((active + 1) % suggestions.length);
          else if (e.key === "ArrowUp")
            setActive((active - 1 + suggestions.length) % suggestions.length);
          else if (e.key === "Tab" || e.key === "Enter") {
            onChange(suggestions[active].value);
            setActive(0);
          } else return;
          e.preventDefault();
        }}
      />
      {showing && (
        <ul className="suggestions" id="query-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.label}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.value);
              }}
            >
              <span className="mono">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
