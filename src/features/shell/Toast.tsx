import { useToast } from "../../store/toast";

export function Toast() {
  const { toast, hide } = useToast();
  if (!toast) return null;
  return (
    <div className="toast toast-action" role="status">
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-btn"
          onClick={() => {
            toast.action?.run();
            hide();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
