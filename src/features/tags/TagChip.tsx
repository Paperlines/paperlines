import type { TagColor } from "@paperlines/backend-port";

interface Props {
  path: string;
  color?: TagColor | null;
  onRemove?(): void;
  onClick?(): void;
}

export function TagChip({ path, color, onRemove, onClick }: Props) {
  return (
    <span className="chip">
      <span
        className="chip-dot"
        style={{ background: color ? `var(--tag-${color})` : undefined }}
      />
      {onClick ? (
        <button type="button" className="chip-label" onClick={onClick}>
          {path}
        </button>
      ) : (
        <span className="chip-label">{path}</span>
      )}
      {onRemove && (
        <button type="button" className="chip-x" aria-label={`Remove ${path}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
