import { TAG_COLORS, type TagInfo } from "@paperlines/backend-port";
import { useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";

function Row({ tag }: { tag: TagInfo }) {
  const { tags, mutate } = useLibrary();
  const [name, setName] = useState(tag.path);
  const rename = async () => {
    const to = name.trim();
    if (!to || to === tag.path) return setName(tag.path);
    const exists = tags.some((x) => x.id !== tag.id && x.path.toLowerCase() === to.toLowerCase());
    if (exists && !(await backend.confirm(t("tags.mergeConfirm", { from: tag.path, to }))))
      return setName(tag.path);
    if (!(await mutate(() => backend.renameTag(tag.path, to)))) setName(tag.path);
  };
  return (
    <li className="tag-row">
      <div className="swatches" role="group" aria-label={t("tags.color")}>
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${tag.color === c ? " on" : ""}`}
            style={{ background: `var(--tag-${c})` }}
            aria-label={c}
            aria-pressed={tag.color === c}
            onClick={() => mutate(() => backend.setTagColor(tag.path, tag.color === c ? null : c))}
          />
        ))}
      </div>
      <input
        className="input"
        aria-label={t("tags.rename")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <span className="muted small tag-count">{tag.count}</span>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("tags.delete", { path: tag.path })}
        onClick={async () => {
          if (await backend.confirm(t("tags.deleteConfirm", { path: tag.path })))
            mutate(() => backend.deleteTag(tag.path));
        }}
      >
        ×
      </button>
    </li>
  );
}

export function ManageTagsDialog({ onClose }: { onClose(): void }) {
  const tags = useLibrary((s) => s.tags);
  return (
    <Dialog title={t("tags.manage")} onClose={onClose} wide>
      <p className="muted small">{t("tags.manageHint")}</p>
      <ul className="tag-rows">
        {tags.map((tg) => (
          <Row key={`${tg.id}:${tg.path}`} tag={tg} />
        ))}
      </ul>
    </Dialog>
  );
}
