/** The Trash, drawn two ways so the difference shows at a glance: an empty bin, or a full one
 *  with its lid lifted and papers sticking out. Same line style as the lucide icons. */
export function TrashIcon({ full, size = 14 }: { full: boolean; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide trash-icon ${full ? "trash-full" : "trash-empty"}`}
      aria-hidden="true"
    >
      {full ? (
        <>
          {/* lid, lifted and tilted */}
          <path d="M3.5 6.5 19 2.8" />
          <path d="M9.6 5.1 9.2 3.4l3.9-.9.4 1.7" />
          {/* papers */}
          <path d="M7.5 10 8.6 6.6l3.4 1" />
          <path d="M12.6 9.6 14.4 6.9l3 1.6" />
          {/* bin, with a light fill */}
          <path
            d="M5 10h14l-1 10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z"
            fill="currentColor"
            fillOpacity={0.18}
          />
        </>
      ) : (
        <>
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14" />
        </>
      )}
    </svg>
  );
}
