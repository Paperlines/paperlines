import type { Item } from "@paperlines/backend-port";
import { fuzzyScore } from "@paperlines/registry";
import { useMemo, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { shortAuthors } from "../library/filter";

interface Props {
  title: string;
  exclude: number[];
  onPick(item: Item): void;
  onClose(): void;
}

/** Find a library paper by title, author or citekey. */
export function ItemPickerDialog({ title, exclude, onPick, onClose }: Props) {
  const items = useLibrary((s) => s.items);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const rows = useMemo(
    () =>
      items
        .filter((i) => !exclude.includes(i.id))
        .map((i) => ({
          i,
          s: fuzzyScore(q, `${i.title} ${i.citekey} ${i.authors.map((a) => a.family).join(" ")}`),
        }))
        .filter((x) => x.s !== null)
        .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
        .slice(0, 30)
        .map((x) => x.i),
    [items, q, exclude],
  );
  return (
    <Dialog title={title} onClose={onClose}>
      <input
        className="input"
        placeholder={t("citations.pickerFilter")}
        aria-label={t("citations.pickerFilter")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive(Math.min(rows.length - 1, active + 1));
          else if (e.key === "ArrowUp") setActive(Math.max(0, active - 1));
          else if (e.key === "Enter" && rows[active]) onPick(rows[active]);
          else return;
          e.preventDefault();
        }}
      />
      <ul className="pick-list" role="listbox">
        {rows.map((i, n) => (
          <li key={i.id} role="option" aria-selected={n === active}>
            <button
              type="button"
              className={n === active ? "active" : ""}
              onClick={() => onPick(i)}
            >
              <span className="pick-title">{i.title}</span>
              <span className="spacer" />
              <span className="muted small">
                {[shortAuthors(i.authors), i.year].filter(Boolean).join(" ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
