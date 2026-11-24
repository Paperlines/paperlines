import { useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { useUi } from "../../store/ui";

export function SaveSearchDialog({ onClose }: { onClose(): void }) {
  const query = useUi((s) => s.query);
  const mutate = useLibrary((s) => s.mutate);
  const [name, setName] = useState(query);
  const save = async () => {
    if (await mutate(() => backend.createSavedSearch(name, query))) onClose();
  };
  return (
    <Dialog
      title={t("search.saveTitle")}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={save}>
          {t("common.save")}
        </button>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save();
        }}
      >
        <label className="field">
          <span className="field-label">{t("projects.name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <code className="path">{query}</code>
      </form>
    </Dialog>
  );
}
