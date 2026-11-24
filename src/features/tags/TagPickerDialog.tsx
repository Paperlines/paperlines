import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { useUi } from "../../store/ui";
import { TagInput } from "./TagInput";

/** Bulk tagging for the current selection. Shows tags any selected item has; × removes from all. */
export function TagPickerDialog({ onClose }: { onClose(): void }) {
  const { items, tags, mutate } = useLibrary();
  const ids = useUi((s) => s.selectedIds);
  const selected = items.filter((i) => ids.includes(i.id));
  const present = [...new Set(selected.flatMap((i) => i.tags))].sort();
  return (
    <Dialog
      title={t("tags.pickerTitle", { n: selected.length })}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t("settings.close")}
        </button>
      }
    >
      <TagInput
        value={present}
        allTags={tags}
        autoFocus
        onAdd={(p) => mutate(() => backend.tagItems(ids, [p]))}
        onRemove={(p) => mutate(() => backend.untagItems(ids, [p]))}
      />
      <p className="muted small">{t("tags.pickerHint")}</p>
    </Dialog>
  );
}
