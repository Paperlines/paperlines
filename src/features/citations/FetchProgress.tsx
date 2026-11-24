import type { Progress } from "@paperlines/backend-port";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";

/** Small status pill while reference lists are fetched in the background. */
export function FetchProgress() {
  const [p, setP] = useState<Progress | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    const offs = [
      backend.on("references-progress", (x) => setP(x.done < x.total ? x : null)),
      backend.on("references-updated", (sum) => {
        setP(null);
        usePanes.getState().citationsChanged();
        useLibrary.getState().runSearch(useUi.getState().query);
        if (sum.fetched || sum.failed.length) {
          setDone(
            t("citations.updated", {
              fetched: sum.fetched,
              linked: sum.linked,
              failed: sum.failed.length,
            }),
          );
          setTimeout(() => setDone(null), 5000);
        }
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  if (!p && !done) return null;
  return (
    <div className="toast" role="status">
      {p ? t("citations.progress", { done: p.done, total: p.total }) : done}
    </div>
  );
}
