/** Paperlines' assistant icon: one large four-point star and two small ones, drawn like the
 *  lucide icons around it (stroke, currentColor, and the app's icon weight via the class). */
function star(cx: number, cy: number, r: number): string {
  const k = r * 0.38;
  return [
    `M${cx} ${cy - r}`,
    `C${cx} ${cy - k} ${cx + k} ${cy} ${cx + r} ${cy}`,
    `C${cx + k} ${cy} ${cx} ${cy + k} ${cx} ${cy + r}`,
    `C${cx} ${cy + k} ${cx - k} ${cy} ${cx - r} ${cy}`,
    `C${cx - k} ${cy} ${cx} ${cy - k} ${cx} ${cy - r}Z`,
  ].join(" ");
}

const PATH = [star(8.5, 12, 6.5), star(17.5, 6, 3.5), star(17.5, 18, 3.5)].join(" ");

export function SparkIcon({
  size = 16,
  ...rest
}: { size?: number } & React.SVGProps<SVGSVGElement>) {
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
      className="lucide lucide-spark"
      {...rest}
    >
      <path d={PATH} />
    </svg>
  );
}
