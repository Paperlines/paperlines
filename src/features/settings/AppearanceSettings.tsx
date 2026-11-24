import { t } from "../../i18n";
import { ACCENTS, type Side, type Theme, useUi } from "../../store/ui";

const THEMES: Theme[] = ["system", "light", "dark"];

/** Where the sidebar and the assistant sit; drawn as a small picture of the window. */
const LAYOUTS: {
  id: "classic" | "mirrored" | "toolsLeft" | "toolsRight";
  sidebar: Side;
  assistant: Side;
}[] = [
  { id: "classic", sidebar: "left", assistant: "right" },
  { id: "mirrored", sidebar: "right", assistant: "left" },
  { id: "toolsLeft", sidebar: "left", assistant: "left" },
  { id: "toolsRight", sidebar: "right", assistant: "right" },
];

function LayoutPicture({ sidebar, assistant }: { sidebar: Side; assistant: Side }) {
  const parts: string[] = [];
  if (sidebar === "left") parts.push("side");
  if (assistant === "left") parts.push("chat");
  parts.push("list", "page");
  if (assistant === "right") parts.push("chat");
  if (sidebar === "right") parts.push("side");
  return (
    <span className="lay-pic" aria-hidden="true">
      <span className="lay-top" />
      <span className="lay-row">
        {parts.map((p, i) => (
          <span key={`${p}${i}`} className={`lay-${p}`} />
        ))}
      </span>
    </span>
  );
}

export function AppearanceSettings() {
  const ui = useUi();
  const layout = LAYOUTS.find(
    (l) => l.sidebar === ui.sidebarSide && l.assistant === ui.assistantSide,
  );
  return (
    <>
      <div className="field">
        <span className="field-label">{t("settings.theme")}</span>
        <div className="segmented" role="group" aria-label={t("settings.theme")}>
          {THEMES.map((th) => (
            <button
              key={th}
              type="button"
              aria-pressed={ui.theme === th}
              className={ui.theme === th ? "on" : ""}
              onClick={() => ui.setTheme(th)}
            >
              {t(`settings.theme.${th}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label" id="accent-label">
          {t("look.accent")}
        </span>
        <div className="accent-swatches" role="radiogroup" aria-labelledby="accent-label">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={ui.accent === a}
              aria-label={t(`look.accent.${a}`)}
              title={t(`look.accent.${a}`)}
              className={`accent-swatch accent-${a}`}
              onClick={() => ui.setAppearance({ accent: a })}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label" id="layout-label">
          {t("look.layout")}
        </span>
        <div className="lay-grid" role="radiogroup" aria-labelledby="layout-label">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={layout?.id === l.id}
              className={`lay-card${layout?.id === l.id ? " on" : ""}`}
              onClick={() =>
                ui.setAppearance({ sidebarSide: l.sidebar, assistantSide: l.assistant })
              }
            >
              <LayoutPicture sidebar={l.sidebar} assistant={l.assistant} />
              <span className="lay-name">{t(`look.layout.${l.id}`)}</span>
            </button>
          ))}
        </div>
        <span className="field-hint">{t("look.layoutHint")}</span>
      </div>

      <div className="field">
        <span className="field-label">{t("look.icons")}</span>
        <div className="segmented" role="group" aria-label={t("look.icons")}>
          {(["light", "regular"] as const).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={ui.iconWeight === w}
              className={ui.iconWeight === w ? "on" : ""}
              onClick={() => ui.setAppearance({ iconWeight: w })}
            >
              {t(`look.icons.${w}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="check">
        <input
          type="checkbox"
          id="look-labels"
          checked={ui.topbarLabels}
          onChange={(e) => ui.setAppearance({ topbarLabels: e.target.checked })}
        />
        <label htmlFor="look-labels">
          <strong>{t("look.labels")}</strong>
          <span className="field-hint">{t("look.labelsHint")}</span>
        </label>
      </div>
    </>
  );
}
