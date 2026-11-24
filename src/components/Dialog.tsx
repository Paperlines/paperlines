import { type ReactNode, useEffect, useRef } from "react";
import { t } from "../i18n";

interface Props {
  title: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Dialog({ title, subtitle, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("input, textarea, select, button:not(.dialog-x)")
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`dialog${wide ? " dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header className="dialog-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="dialog-sub">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-btn dialog-x"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}
