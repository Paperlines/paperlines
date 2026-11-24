import { type RelationType, TAG_COLORS, type TagColor } from "@paperlines/backend-port";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { usePanes } from "../../store/panes";
import type { ConnectionArg } from "./ConnectionDialog";

function Swatches({ value, onPick }: { value: TagColor; onPick(c: TagColor): void }) {
  return (
    <div className="swatches" role="group" aria-label={t("conn.color")}>
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch${value === c ? " on" : ""}`}
          style={{ background: `var(--tag-${c})` }}
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

function TypeRow({ ty, reload }: { ty: RelationType; reload(): void }) {
  const [label, setLabel] = useState(ty.label);
  const [inverse, setInverse] = useState(ty.inverseLabel ?? "");
  const save = async (patch: Partial<{ label: string; inverse: string; color: TagColor }>) => {
    await backend.updateRelationType(
      ty.id,
      patch.label ?? label,
      (patch.inverse ?? inverse) || null,
      patch.color ?? ty.color,
    );
    usePanes.getState().citationsChanged();
    reload();
  };
  return (
    <li className="conn-type-row">
      <Swatches value={ty.color} onPick={(c) => save({ color: c })} />
      <input
        className="input"
        aria-label={t("conn.typeName", { name: ty.label })}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== ty.label && save({ label })}
      />
      <input
        className="input"
        aria-label={t("conn.typeInverse", { name: ty.label })}
        placeholder={t("conn.sameBothWays")}
        value={inverse}
        onChange={(e) => setInverse(e.target.value)}
        onBlur={() => inverse !== (ty.inverseLabel ?? "") && save({ inverse })}
      />
      <span className="muted small conn-count">{ty.count}</span>
      {ty.builtin ? (
        <span className="badge badge-muted">{t("conn.builtin")}</span>
      ) : (
        <button
          type="button"
          className="icon-btn"
          aria-label={t("conn.deleteType", { name: ty.label })}
          onClick={async () => {
            if (
              ty.count &&
              !(await backend.confirm(t("conn.deleteTypeConfirm", { name: ty.label, n: ty.count })))
            )
              return;
            await backend.deleteRelationType(ty.id);
            usePanes.getState().citationsChanged();
            reload();
          }}
        >
          ×
        </button>
      )}
    </li>
  );
}

/** The kinds of connection: rename, recolor, and add your own. */
export function ConnectionTypesDialog({
  back,
  onClose,
}: {
  /** Return to the connection dialog this was opened from. */
  back?: ConnectionArg | null;
  onClose(): void;
}) {
  const [types, setTypes] = useState<RelationType[]>([]);
  const [label, setLabel] = useState("");
  const [inverse, setInverse] = useState("");
  const [color, setColor] = useState<TagColor>("teal");
  const reload = () => backend.relationTypes().then(setTypes);
  useEffect(() => {
    reload();
  }, []);
  const close = () => (back ? useDialogs.getState().show("connection", back) : onClose());
  return (
    <Dialog
      title={t("conn.typesTitle")}
      subtitle={t("conn.typesSubtitle")}
      onClose={close}
      wide
      footer={
        <button type="button" className="btn btn-primary" onClick={close}>
          {t("settings.close")}
        </button>
      }
    >
      <div className="conn-type-head muted small">
        <span />
        <span>{t("conn.typeLabel")}</span>
        <span>{t("conn.typeInverseHead")}</span>
        <span />
      </div>
      <ul className="conn-types">
        {types.map((ty) => (
          <TypeRow key={`${ty.id}:${ty.label}:${ty.color}`} ty={ty} reload={reload} />
        ))}
      </ul>
      <form
        className="conn-new-type"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!label.trim()) return;
          await backend.createRelationType(label, inverse || null, color);
          setLabel("");
          setInverse("");
          reload();
        }}
      >
        <Swatches value={color} onPick={setColor} />
        <input
          className="input"
          placeholder={t("conn.newTypePlaceholder")}
          aria-label={t("conn.newType")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="input"
          placeholder={t("conn.newInversePlaceholder")}
          aria-label={t("conn.newInverse")}
          value={inverse}
          onChange={(e) => setInverse(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!label.trim()}>
          {t("conn.addType")}
        </button>
      </form>
    </Dialog>
  );
}
