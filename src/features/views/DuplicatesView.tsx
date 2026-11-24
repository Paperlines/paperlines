import type { DuplicateGroup } from "@paperlines/backend-port";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";

function Group({ g, done }: { g: DuplicateGroup; done(): void }) {
  const [master, setMaster] = useState(g.papers.find((p) => p.hasPdf)?.id ?? g.ids[0]);
  return (
    <li className="dup-group">
      <div className="small muted">
        {g.reason === "same PDF" ? t("dups.samePdf") : t("dups.sameTitle")}
      </div>
      <fieldset className="dup-choices">
        <legend className="field-label">{t("dups.keep")}</legend>
        {g.papers.map((p) => (
          <label key={p.id} className="check dup-choice">
            <input
              type="radio"
              name={`master-${g.ids.join("-")}`}
              checked={master === p.id}
              onChange={() => setMaster(p.id)}
            />
            <span>
              <strong>{p.title}</strong>
              <span className="field-hint">
                {[
                  p.authors,
                  p.year,
                  p.citekey,
                  p.hasPdf ? "PDF" : null,
                  p.tags.length ? p.tags.join(", ") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await backend.mergeDuplicates(
              master,
              g.ids.filter((i) => i !== master),
            );
            done();
          }}
        >
          {t("dups.merge", { n: g.ids.length })}
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await backend.dismissDuplicates(g.ids);
            done();
          }}
        >
          {t("dups.dismiss")}
        </button>
      </div>
    </li>
  );
}

export function DuplicatesView() {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const refresh = useLibrary((s) => s.refresh);
  const load = () => backend.duplicateGroups().then(setGroups);
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="view-pane">
      <div className="view-head">
        <h2>{t("view.duplicates")}</h2>
        <InfoTip label={t("help.dupsLabel")}>{t("help.dups")}</InfoTip>
      </div>
      {groups === null ? null : groups.length === 0 ? (
        <div className="empty muted">{t("dups.none")}</div>
      ) : (
        <ul className="view-list">
          {groups.map((g) => (
            <Group
              key={g.ids.join("-")}
              g={g}
              done={async () => {
                await load();
                await refresh();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
